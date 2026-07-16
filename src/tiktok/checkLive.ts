/**
 * TikTok live status checker.
 *
 * Strategy:
 *   1. `fetchIsLive()` — boolean check (reliable, works)
 *   2. `fetchRoomId()` — get room ID (reliable, works)
 *   3. Direct HTTP to TikTok internal API `/api/live/detail/` — full room data
 *      (cover, viewers, title, owner avatar, start time)
 *
 * We avoid `connect()` and `fetchRoomInfo()` because both only return
 * a minimal API wrapper `{data: {prompts}, extra, status_code}`.
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
    // Step 1: Boolean live check
    const isLive = await connection.fetchIsLive();

    if (!isLive) {
      console.log(`[${username}] 💤 Not live.`);
      return { isLive: false, username };
    }

    // Step 2: Get roomId
    const roomId = await connection.fetchRoomId();

    if (!roomId) {
      console.warn(`[${username}] ⚠️  Live but no roomId — skipping.`);
      return { isLive: false, username };
    }

    // Step 3: Fetch full room data via TikTok internal API
    const roomData = await fetchRoomDetail(roomId);

    const title = roomData?.['title'] ?? username;
    const viewerCount = Number(roomData?.['user_count'] ?? roomData?.['user_count_str'] ?? 0);
    const thumbnailUrl = extractUrl(roomData?.['cover']?.['url_list']);
    const profilePicUrl = extractUrl(roomData?.['owner']?.['avatar_thumb']?.['url_list']);
    const startedAt = extractStartTime(roomData);

    console.log(`[${username}] ✅ LIVE — room: ${roomId}, viewers: ${viewerCount}, title: ${title}`);

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
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    const isOffline =
      lower.includes('not live') ||
      lower.includes('offline') ||
      lower.includes("isn't online") ||
      lower.includes('ended') ||
      lower.includes('user is not live') ||
      lower.includes('useroflline') ||
      lower.includes('timeout');

    if (isOffline) {
      console.log(`[${username}] 💤 Not live.`);
    } else {
      console.warn(`[${username}] ⚠️  Error: ${msg}`);
    }

    return { isLive: false, username };
  }
}

// ─── TikTok internal API ─────────────────────────────────────────────────────

/**
 * Fetch full room detail from TikTok's internal live detail API.
 * Returns the room data object, or null if unavailable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRoomDetail(roomId: string): Promise<Record<string, any> | null> {
  try {
    const url = `https://www.tiktok.com/api/live/detail/?aid=1988&roomID=${roomId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://www.tiktok.com/',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[TikTok API] HTTP ${response.status} for room ${roomId}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await response.json()) as Record<string, any>;

    // Debug: log available keys
    const liveRoom = json['LiveRoomInfo'];
    if (liveRoom) {
      console.log(`[TikTok API] LiveRoomInfo keys: ${Object.keys(liveRoom).join(', ')}`);
      return liveRoom;
    }

    // Fallback: try other known response shapes
    const roomInfo = json['data'] ?? json['roomInfo'] ?? json;
    console.log(`[TikTok API] Response keys: ${Object.keys(json).join(', ')}`);
    return roomInfo;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[TikTok API] Failed to fetch room detail: ${msg}`);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractUrl(urlList: unknown): string | null {
  if (Array.isArray(urlList) && typeof urlList[0] === 'string') {
    return urlList[0];
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStartTime(roomData: Record<string, any> | null): string {
  const ts = roomData?.['create_time'] ?? roomData?.['start_time'];
  if (typeof ts === 'number' && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}
