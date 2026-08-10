/**
 * Main entry point for PostNotify live monitoring.
 *
 * Flow per execution:
 *  1. Load state (which live sessions have already been notified)
 *  2. Check configured TikTok and YouTube creators in parallel
 *  3. Send Discord alerts for active sessions not yet notified
 *  4. Prune sessions that are no longer active
 *  5. Save state for the workflow to commit back to the repository
 */

import { env } from './config/env.js';
import { checkIsLive } from './tiktok/checkLive.js';
import { checkYouTubeLive } from './youtube/checkLive.js';
import { settleLiveChecks, type LiveCheckRequest } from './checks.js';
import {
  sendAdminErrorNotification,
  sendAdminRecoveryNotification,
  sendLiveNotification,
} from './discord/sendEmbed.js';
import {
  buildSessionKey,
  clearPlatformError,
  clearYouTubeActiveVideo,
  getPlatformError,
  getYouTubeActiveVideo,
  hasNotified,
  loadState,
  markNotified,
  pruneTargetSessions,
  saveState,
  setPlatformError,
  setYouTubeActiveVideo,
} from './state.js';
import type { LiveCheckError, LiveInfo } from './types.js';

const DELAY_BETWEEN_NOTIFICATIONS_MS = 1_500;

interface DiscordRoute {
  channelId: string;
  mention: string | undefined;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const {
    tiktokUsernames,
    youtubeChannelIds,
    discordBotToken,
    tiktokDiscordChannelId,
    tiktokDiscordMention,
    youtubeDiscordChannelId,
    youtubeDiscordMention,
    youtubeApiKey,
    adminDiscordChannelId,
    adminDiscordMention,
  } = env;

  const tiktokEnabled = tiktokUsernames.length > 0 && Boolean(tiktokDiscordChannelId);
  const youtubeEnabled = youtubeChannelIds.length > 0 && Boolean(youtubeDiscordChannelId);
  const totalTargets =
    (tiktokEnabled ? tiktokUsernames.length : 0) +
    (youtubeEnabled ? youtubeChannelIds.length : 0);

  console.log(`\n🚀 postnotify_bot starting — monitoring ${totalTargets} creator(s)`);
  console.log(`   TikTok: ${tiktokEnabled ? tiktokUsernames.join(', ') : 'disabled'}`);
  console.log(`   YouTube: ${youtubeEnabled ? youtubeChannelIds.join(', ') : 'disabled'}\n`);

  if (tiktokUsernames.length > 0 && !tiktokDiscordChannelId) {
    console.warn('[TikTok] ⚠️ TIKTOK_DISCORD_CHANNEL_ID missing — TikTok monitoring disabled.');
  }

  if (youtubeChannelIds.length > 0 && !youtubeDiscordChannelId) {
    console.warn('[YouTube] ⚠️ YOUTUBE_DISCORD_CHANNEL_ID missing — YouTube monitoring disabled.');
  }

  const configuredTargets = tiktokUsernames.length + youtubeChannelIds.length;
  if (configuredTargets > 0 && !adminDiscordChannelId) {
    throw new Error('ADMIN_DISCORD_CHANNEL_ID is required when monitoring is configured.');
  }
  if (youtubeChannelIds.length > 0 && !youtubeApiKey) {
    throw new Error('YOUTUBE_API_KEY is required when YOUTUBE_CHANNEL_IDS is configured.');
  }
  if (youtubeChannelIds.length > 10) {
    throw new Error('YOUTUBE_CHANNEL_IDS supports at most 10 channels to protect API quota.');
  }
  const invalidYouTubeId = youtubeChannelIds.find((id) => !/^UC[\w-]{20,}$/.test(id));
  if (invalidYouTubeId) {
    throw new Error(`Invalid YouTube channel ID: ${invalidYouTubeId}`);
  }

  if (!tiktokEnabled && !youtubeEnabled) {
    throw new Error(
      'No platform configured. Set a creator list and Discord channel for TikTok or YouTube.'
    );
  }

  const state = loadState();

  // ─── 1. Check all creators in parallel ─────────────────────────────────────
  console.log('🔍 Checking live status...');
  const checks: LiveCheckRequest[] = [
    ...(tiktokEnabled
      ? tiktokUsernames.map((username) => ({
          platform: 'tiktok' as const,
          target: username,
          promise: checkIsLive(username),
        }))
      : []),
    ...(youtubeEnabled
      ? youtubeChannelIds.map((channelId) => ({
          platform: 'youtube' as const,
          target: channelId,
          promise: checkYouTubeLive(
            channelId,
            youtubeApiKey ?? '',
            getYouTubeActiveVideo(state, channelId)
          ),
        }))
      : []),
  ];
  const results = await settleLiveChecks(checks);

  const liveResults: LiveInfo[] = [];
  let offlineCount = 0;
  let errorCount = 0;

  for (const info of results) {
    if (info.status === 'error') {
      errorCount++;
      await handleCheckError(
        state,
        info,
        discordBotToken,
        adminDiscordChannelId!,
        adminDiscordMention
      );
      continue;
    }

    await handleRecovery(
      state,
      info.platform,
      info.username,
      discordBotToken,
      adminDiscordChannelId!,
      adminDiscordMention
    );

    if (info.status === 'offline') {
      offlineCount++;
      pruneTargetSessions(state, info.platform, info.username);
      if (info.platform === 'youtube') clearYouTubeActiveVideo(state, info.username);
      continue;
    }

    liveResults.push(info);
    const sessionKey = buildSessionKey(info.platform, info.username, info.roomId);
    pruneTargetSessions(state, info.platform, info.username, sessionKey);
    if (info.platform === 'youtube') {
      setYouTubeActiveVideo(state, info.username, info.roomId);
    }
  }

  console.log(
    `\n📊 Results: ${liveResults.length} live / ${offlineCount} offline / ${errorCount} error / ${totalTargets} total\n`
  );

  // ─── 3. Notify for new live sessions ──────────────────────────────────────
  let notificationsSent = 0;

  for (let i = 0; i < liveResults.length; i++) {
    const liveInfo = liveResults[i]!;
    const sessionKey = buildSessionKey(liveInfo.platform, liveInfo.username, liveInfo.roomId);

    if (hasNotified(state, sessionKey)) {
      console.log(`[${liveInfo.platform}:${liveInfo.username}] Already notified for session ${liveInfo.roomId} — skipping.`);
      continue;
    }

    try {
      const route = getDiscordRoute(
        liveInfo,
        tiktokDiscordChannelId,
        tiktokDiscordMention,
        youtubeDiscordChannelId,
        youtubeDiscordMention
      );

      await sendLiveNotification(discordBotToken, route.channelId, liveInfo, route.mention);
      markNotified(state, sessionKey);
      notificationsSent++;

      // Small delay between notifications to avoid Discord rate-limiting.
      if (i < liveResults.length - 1) {
        await delay(DELAY_BETWEEN_NOTIFICATIONS_MS);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${liveInfo.platform}:${liveInfo.username}] ❌ Failed to send Discord notification: ${message}`
      );
      // Don't mark as notified — will retry next cycle.
    }
  }

  // ─── 4. Save state ─────────────────────────────────────────────────────────
  saveState(state);

  console.log(`\n✅ Done — ${notificationsSent} new notification(s) sent.`);
  console.log(`   Active sessions tracked: ${state.activeLiveSessions.length}`);
}

async function handleCheckError(
  state: ReturnType<typeof loadState>,
  error: LiveCheckError,
  botToken: string,
  adminChannelId: string,
  mention?: string
): Promise<void> {
  const fingerprint = `${error.platform}:${error.username}:${error.errorCode}`;
  if (getPlatformError(state, error.platform, error.username)?.fingerprint === fingerprint) {
    console.log(`[${error.platform}:${error.username}] Error already reported: ${error.errorCode}`);
    return;
  }

  try {
    await sendAdminErrorNotification(botToken, adminChannelId, error, mention);
    setPlatformError(state, {
      fingerprint,
      platform: error.platform,
      target: error.username,
      errorCode: error.errorCode,
      message: error.message,
      firstSeenAt: new Date().toISOString(),
    });
  } catch (sendError: unknown) {
    console.error(`[Admin] Failed to send error alert: ${errorMessage(sendError)}`);
  }
}

async function handleRecovery(
  state: ReturnType<typeof loadState>,
  platform: 'tiktok' | 'youtube',
  target: string,
  botToken: string,
  adminChannelId: string,
  mention?: string
): Promise<void> {
  const previous = getPlatformError(state, platform, target);
  if (!previous) return;

  try {
    await sendAdminRecoveryNotification(botToken, adminChannelId, previous, mention);
    clearPlatformError(state, platform, target);
  } catch (error: unknown) {
    console.error(`[Admin] Failed to send recovery alert: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDiscordRoute(
  liveInfo: LiveInfo,
  tiktokChannelId?: string,
  tiktokMention?: string,
  youtubeChannelId?: string,
  youtubeMention?: string
): DiscordRoute {
  const channelId = liveInfo.platform === 'youtube' ? youtubeChannelId : tiktokChannelId;
  const mention = liveInfo.platform === 'youtube' ? youtubeMention : tiktokMention;

  if (!channelId) {
    const key = liveInfo.platform === 'youtube'
      ? 'YOUTUBE_DISCORD_CHANNEL_ID'
      : 'TIKTOK_DISCORD_CHANNEL_ID';
    throw new Error(`${key} is required for ${liveInfo.platform} alerts.`);
  }

  return { channelId, mention };
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ Fatal error:', message);
  process.exit(1);
});
