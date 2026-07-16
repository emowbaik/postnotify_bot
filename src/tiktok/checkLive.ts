/**
 * TikTok live status checker.
 *
 * Uses `tiktok-live-connector` v2's `connect()` method which internally:
 *   1. Resolves the roomId
 *   2. Fetches full room info (title, cover, viewers, owner avatar, etc.)
 *   3. Opens WebSocket for live events
 *
 * We immediately `disconnect()` after connect resolves — we only need
 * the room data snapshot, not the live event stream.
 *
 * `fetchRoomInfo()` alone only returns a minimal API wrapper (data.prompts),
 * NOT the full room data. That's why we must use connect().
 */

import { TikTokLiveConnection } from 'tiktok-live-connector';
import type { LiveCheckResult } from '../types.js';

const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Check whether a TikTok user is currently live.
 * @param username - TikTok username WITHOUT the @ symbol.
 */
export async function checkIsLive(username: string): Promise<LiveCheckResult> {
  const liveUrl = `https://www.tiktok.com/@${username}/live`;
  const connection = new TikTokLiveConnection(username, {
    enableExtendedGiftInfo: false,
  });

  try {
    // Connect with timeout — this fetches full room data internally
    const state = await Promise.race([
      connection.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connect timeout')), CONNECT_TIMEOUT_MS)
      ),
    ]);

    // Immediately disconnect — we only needed the room data snapshot
    try { await connection.disconnect(); } catch { /* ignore */ }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomInfo = (state as any)?.roomInfo ?? connection.roomInfo ?? {};

    // Debug: log keys to trace data structure
    const keys = Object.keys(roomInfo);
    console.log(`[${username}] roomInfo keys: ${keys.join(', ')}`);

    const roomId = String(connection.roomId ?? roomInfo['id'] ?? roomInfo['room_id'] ?? '');

    if (!roomId) {
      console.warn(`[${username}] ⚠️  Connected but no roomId — skipping.`);
      return { isLive: false, username };
    }

    const thumbnailUrl = extractThumbnail(roomInfo);
    const profilePicUrl = extractProfilePic(roomInfo);
    const startedAt = extractStartTime(roomInfo);
    const viewerCount = extractViewerCount(roomInfo);
    const title = String(roomInfo['title'] ?? username);

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
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    // Gracefully disconnect on error
    try { await connection.disconnect(); } catch { /* ignore */ }

    const isExpectedOffline =
      lower.includes('not live') ||
      lower.includes('offline') ||
      lower.includes('ended') ||
      lower.includes('user is not live') ||
      lower.includes('useroflline') ||
      lower.includes('connect timeout');

    if (isExpectedOffline) {
      console.log(`[${username}] 💤 Not live.`);
    } else {
      console.warn(`[${username}] ⚠️  Error: ${message}`);
    }

    return { isLive: false, username };
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractViewerCount(roomInfo: Record<string, any>): number {
  const candidates = [
    roomInfo['user_count'],
    roomInfo['stats']?.['total_user'],
    roomInfo['data']?.['user_count'],
    roomInfo['data']?.['stats']?.['total_user'],
  ];
  for (const val of candidates) {
    const num = Number(val);
    if (!Number.isNaN(num) && num > 0) return num;
  }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractThumbnail(roomInfo: Record<string, any>): string | null {
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
    roomInfo['owner']?.['avatar_medium']?.['url_list'],
    roomInfo['data']?.['owner']?.['avatar_thumb']?.['url_list'],
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
