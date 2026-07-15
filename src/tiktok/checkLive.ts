/**
 * TikTok live status checker.
 *
 * Uses `tiktok-live-connector` v2's HTTP-only API:
 *   - `fetchIsLive()` — lightweight boolean check (no WebSocket)
 *   - `fetchRoomInfo()` — fetch stream details (title, viewers, thumbnail)
 *
 * This approach avoids maintaining a persistent WebSocket connection, making
 * it ideal for the GitHub Actions polling model.
 *
 * Error handling: Any error (user offline, rate-limit, network) is treated as
 * "not live" to avoid false positive notifications.
 */

import { TikTokLiveConnection } from 'tiktok-live-connector';
import type { LiveCheckResult } from '../types.js';

/**
 * Check whether a TikTok user is currently live.
 * @param username - TikTok username WITHOUT the @ symbol.
 */
export async function checkIsLive(username: string): Promise<LiveCheckResult> {
  const liveUrl = `https://www.tiktok.com/@${username}/live`;
  const connection = new TikTokLiveConnection(username, {});

  try {
    // Step 1: Lightweight boolean check (pure HTTP, no WebSocket)
    const isLive = await connection.fetchIsLive();

    if (!isLive) {
      console.log(`[${username}] 💤 Not live.`);
      return { isLive: false, username };
    }

    // Step 2: Fetch room details to populate the Discord embed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomInfo = (await connection.fetchRoomInfo()) as Record<string, any>;

    const roomId = String(
      roomInfo['id'] ?? roomInfo['roomId'] ?? roomInfo['room_id'] ?? ''
    );

    if (!roomId) {
      // Live but couldn't get a stable room ID — skip to avoid dedup issues
      console.warn(`[${username}] ⚠️  Live but roomId unavailable — skipping.`);
      return { isLive: false, username };
    }

    const thumbnailUrl = extractThumbnail(roomInfo);
    const startedAt = extractStartTime(roomInfo);
    const viewerCount = Number(
      roomInfo['user_count'] ?? roomInfo['stats']?.['total_user'] ?? 0
    );
    const title = String(roomInfo['title'] ?? username);

    console.log(`[${username}] ✅ Is LIVE — roomId: ${roomId}, viewers: ${viewerCount}`);

    return {
      isLive: true,
      username,
      roomId,
      title,
      viewerCount,
      thumbnailUrl,
      liveUrl,
      startedAt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    const isExpectedOffline =
      lower.includes('not live') ||
      lower.includes('offline') ||
      lower.includes('ended') ||
      lower.includes('user is not live') ||
      lower.includes('useroflline');  // typo present in some library versions

    if (isExpectedOffline) {
      console.log(`[${username}] 💤 Not live (confirmed offline).`);
    } else {
      console.warn(`[${username}] ⚠️  Error checking live status: ${message}`);
    }

    return { isLive: false, username };
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractThumbnail(roomInfo: Record<string, any>): string | null {
  const urlList: unknown[] =
    roomInfo['cover']?.['url_list'] ??
    roomInfo['thumb_url']?.['url_list'] ??
    [];
  const first = urlList[0];
  return typeof first === 'string' ? first : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStartTime(roomInfo: Record<string, any>): string {
  const ts: unknown = roomInfo['create_time'] ?? roomInfo['start_time'];
  if (typeof ts === 'number' && ts > 0) {
    // TikTok timestamps are in seconds
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}
