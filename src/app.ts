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
import { sendLiveNotification } from './discord/sendEmbed.js';
import {
  loadState,
  saveState,
  buildSessionKey,
  hasNotified,
  markNotified,
  pruneOfflineSessions,
} from './state.js';
import type { LiveCheckResult, LiveInfo } from './types.js';

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
  } = env;

  const youtubeEnabled = youtubeChannelIds.length > 0 && Boolean(youtubeDiscordChannelId);
  const totalTargets = tiktokUsernames.length + (youtubeEnabled ? youtubeChannelIds.length : 0);

  console.log(`\n🚀 postnotify_bot starting — monitoring ${totalTargets} creator(s)`);
  console.log(`   TikTok: ${tiktokUsernames.join(', ') || '-'}`);
  console.log(`   YouTube: ${youtubeEnabled ? youtubeChannelIds.join(', ') : 'disabled'}\n`);

  if (youtubeChannelIds.length > 0 && !youtubeDiscordChannelId) {
    console.warn('[YouTube] ⚠️ YOUTUBE_DISCORD_CHANNEL_ID missing — YouTube monitoring disabled.');
  }

  const state = loadState();

  // ─── 1. Check all creators in parallel ─────────────────────────────────────
  console.log('🔍 Checking live status...');
  const checks: Array<Promise<LiveCheckResult>> = [
    ...tiktokUsernames.map((username) => checkIsLive(username)),
    ...(youtubeEnabled ? youtubeChannelIds.map((channelId) => checkYouTubeLive(channelId)) : []),
  ];
  const results = await Promise.allSettled(checks);

  const liveResults: LiveInfo[] = [];
  const activeSessionKeys: string[] = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Unexpected error during live check:', result.reason);
      continue;
    }

    const info = result.value;

    if (info.isLive) {
      liveResults.push(info);
      activeSessionKeys.push(buildSessionKey(info.platform, info.username, info.roomId));
    }
  }

  console.log(`\n📊 Results: ${liveResults.length} live / ${totalTargets} total\n`);

  // ─── 2. Prune sessions that are now offline ────────────────────────────────
  // This resets the "seen" flag so the NEXT live session triggers a new notification.
  pruneOfflineSessions(state, activeSessionKeys);

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
      const route = getDiscordRoute(liveInfo, {
        channelId: tiktokDiscordChannelId,
        mention: tiktokDiscordMention,
      }, youtubeDiscordChannelId, youtubeDiscordMention);

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

function getDiscordRoute(
  liveInfo: LiveInfo,
  defaultRoute: DiscordRoute,
  youtubeChannelId?: string,
  youtubeMention?: string
): DiscordRoute {
  if (liveInfo.platform !== 'youtube') return defaultRoute;
  if (!youtubeChannelId) throw new Error('YOUTUBE_DISCORD_CHANNEL_ID is required for YouTube alerts.');
  return { channelId: youtubeChannelId, mention: youtubeMention };
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ Fatal error:', message);
  process.exit(1);
});
