/**
 * Main entry point for the TikTok Live Notifier Bot.
 *
 * Flow per execution:
 *  1. Load state (which live sessions have already been notified)
 *  2. Check all monitored TikTok usernames in parallel
 *  3. For each streamer that is NOW live and NOT yet notified → send Discord embed
 *  4. Prune offline sessions from state (so next live triggers a new notification)
 *  5. Save state → workflow commits state.json back to repo
 */

import { env } from './config/env.js';
import { checkIsLive } from './tiktok/checkLive.js';
import { sendLiveNotification } from './discord/sendEmbed.js';
import {
  loadState,
  saveState,
  buildSessionKey,
  hasNotified,
  markNotified,
  pruneOfflineSessions,
} from './state.js';
import type { LiveInfo } from './types.js';

const DELAY_BETWEEN_NOTIFICATIONS_MS = 1_500;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const { tiktokUsernames, discordBotToken, discordChannelId, discordMention } = env;

  console.log(`\n🚀 postnotify_bot starting — monitoring ${tiktokUsernames.length} streamer(s)`);
  console.log(`   Users: ${tiktokUsernames.join(', ')}\n`);

  const state = loadState();

  // ─── 1. Check all streamers in parallel ───────────────────────────────────
  console.log('🔍 Checking live status...');
  const results = await Promise.allSettled(
    tiktokUsernames.map((username) => checkIsLive(username))
  );

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
      activeSessionKeys.push(buildSessionKey(info.username, info.roomId));
    }
  }

  console.log(`\n📊 Results: ${liveResults.length} live / ${tiktokUsernames.length} total\n`);

  // ─── 2. Prune sessions that are now offline ────────────────────────────────
  // This resets the "seen" flag so the NEXT live session triggers a new notification.
  pruneOfflineSessions(state, activeSessionKeys);

  // ─── 3. Notify for new live sessions ──────────────────────────────────────
  let notificationsSent = 0;

  for (let i = 0; i < liveResults.length; i++) {
    const liveInfo = liveResults[i]!;
    const sessionKey = buildSessionKey(liveInfo.username, liveInfo.roomId);

    if (hasNotified(state, sessionKey)) {
      console.log(`[${liveInfo.username}] Already notified for session ${liveInfo.roomId} — skipping.`);
      continue;
    }

    try {
      await sendLiveNotification(discordBotToken, discordChannelId, liveInfo, discordMention);
      markNotified(state, sessionKey);
      notificationsSent++;

      // Small delay between notifications to avoid Discord rate-limiting
      if (i < liveResults.length - 1) {
        await delay(DELAY_BETWEEN_NOTIFICATIONS_MS);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${liveInfo.username}] ❌ Failed to send Discord notification: ${message}`);
      // Don't mark as notified — will retry next cycle
    }
  }

  // ─── 4. Save state ─────────────────────────────────────────────────────────
  saveState(state);

  console.log(`\n✅ Done — ${notificationsSent} new notification(s) sent.`);
  console.log(`   Active sessions tracked: ${state.activeLiveSessions.length}`);
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ Fatal error:', message);
  process.exit(1);
});
