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

    // Step 2: Get the roomId first — required before fetching room info
    const roomId = await connection.fetchRoomId();

    if (!roomId) {
      console.warn(`[${username}] ⚠️  Live but roomId unavailable — skipping.`);
      return { isLive: false, username };
    }

    // Step 3: Fetch room details using the resolved roomId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomInfo = (await connection.fetchRoomInfo(roomId)) as Record<string, any>;

    // Debug: log top-level keys and nested data keys to find viewer count path
    console.log(`[${username}] roomInfo keys: ${Object.keys(roomInfo).join(', ')}`);
    if (roomInfo['data']) {
      console.log(`[${username}] roomInfo.data keys: ${Object.keys(roomInfo['data']).join(', ')}`);
    }

    const thumbnailUrl = extractThumbnail(roomInfo);
    const profilePicUrl = extractProfilePic(roomInfo);
    const startedAt = extractStartTime(roomInfo);
    const viewerCount = extractViewerCount(roomInfo);
    const title = String(
      roomInfo['title'] ?? roomInfo['data']?.['title'] ?? username
    );

    console.log(`[${username}] ✅ Is LIVE — roomId: ${roomId}, viewers: ${viewerCount}, title: ${title}`);

    return {
      isLive: true,
      username,
      roomId,
      title,
      viewerCount,
      thumbnailUrl,
      profilePicUrl,
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
function extractViewerCount(roomInfo: Record<string, any>): number {
  // Try multiple known paths where TikTok stores viewer count
  const candidates = [
    roomInfo['user_count'],
    roomInfo['data']?.['user_count'],
    roomInfo['stats']?.['total_user'],
    roomInfo['data']?.['stats']?.['total_user'],
    roomInfo['like_count'],
    roomInfo['data']?.['like_count'],
  ];
  for (const val of candidates) {
    const num = Number(val);
    if (!Number.isNaN(num) && num > 0) return num;
  }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractThumbnail(roomInfo: Record<string, any>): string | null {
  // Search multiple nested paths
  const sources = [
    roomInfo['cover']?.['url_list'],
    roomInfo['data']?.['cover']?.['url_list'],
    roomInfo['thumb_url']?.['url_list'],
    roomInfo['data']?.['thumb_url']?.['url_list'],
  ];
  for (const urlList of sources) {
    if (Array.isArray(urlList) && typeof urlList[0] === 'string') {
      return urlList[0];
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProfilePic(roomInfo: Record<string, any>): string | null {
  const sources = [
    roomInfo['owner']?.['avatar_thumb']?.['url_list'],
    roomInfo['data']?.['owner']?.['avatar_thumb']?.['url_list'],
    roomInfo['owner']?.['avatar_medium']?.['url_list'],
    roomInfo['data']?.['owner']?.['avatar_medium']?.['url_list'],
  ];
  for (const urlList of sources) {
    if (Array.isArray(urlList) && typeof urlList[0] === 'string') {
      return urlList[0];
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStartTime(roomInfo: Record<string, any>): string {
  const ts: unknown =
    roomInfo['create_time'] ??
    roomInfo['data']?.['create_time'] ??
    roomInfo['start_time'] ??
    roomInfo['data']?.['start_time'];
  if (typeof ts === 'number' && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}
