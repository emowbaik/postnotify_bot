/**
 * TikTok live status checker.
 *
 * Strategy:
 *   1. `fetchIsLive()` — boolean check
 *   2. `fetchRoomId()` — get room ID
 *   3. `webcast.tiktok.com/webcast/room/info/` — full room data
 *      (title, cover, owner avatar, viewer count, start time)
 */

import { TikTokLiveConnection } from 'tiktok-live-connector';
import { safeLogValue } from '../log.ts';
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
      return { status: 'offline', isLive: false, platform: 'tiktok', username };
    }

    // Step 2: Get roomId
    const roomId = await connection.fetchRoomId();

    if (!roomId) {
      console.warn(`[${username}] [ERROR] Live status returned no room ID.`);
      return checkError(username, 'TIKTOK_ROOM_ID_MISSING', 'TikTok live status returned no room ID.');
    }

    // Step 3: Fetch full room data via TikTok internal API
    const roomData = await fetchRoomDetail(roomId);
    if (!roomData) {
      return checkError(username, 'TIKTOK_ROOM_API_ERROR', 'TikTok room details could not be loaded.');
    }

    const room = normalizeTikTokRoomData(roomData, username);
    const { title, viewerCount, thumbnailUrl, profilePicUrl, startedAt } = room;

    console.log(`[${username}] ✅ LIVE — room: ${roomId}, viewers: ${viewerCount}, title: ${safeLogValue(title)}`);

    return {
      status: 'live',
      isLive: true,
      platform: 'tiktok',
      username,
      displayName: username,
      roomId,
      title,
      viewerCount,
      thumbnailUrl,
      profilePicUrl,
      liveUrl,
      profileUrl: `https://www.tiktok.com/@${encodeURIComponent(username)}`,
      startedAt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const isConfirmedOffline =
      lower.includes('not live') ||
      lower.includes('offline') ||
      lower.includes("isn't online") ||
      lower.includes('ended') ||
      lower.includes('user is not live') ||
      lower.includes('useroflline');

    if (isConfirmedOffline) {
      console.log(`[${username}] 💤 Not live.`);
      return { status: 'offline', isLive: false, platform: 'tiktok', username };
    }

    const isTimeout = lower.includes('timeout')
      || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
    const code = isTimeout ? 'TIKTOK_TIMEOUT' : 'TIKTOK_CONNECTOR_ERROR';
    const safeMessage = isTimeout
      ? 'TikTok request timed out.'
      : 'TikTok live check failed.';
    console.warn(`[${username}] [ERROR] ${safeMessage}`);
    return checkError(username, code, safeMessage);
  }
}

function checkError(username: string, errorCode: string, message: string): LiveCheckResult {
  return { status: 'error', isLive: false, platform: 'tiktok', username, errorCode, message };
}

// ─── TikTok internal API ─────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

async function fetchRoomDetail(roomId: string): Promise<JsonObject | null> {
  // Try multiple endpoints — TikTok sometimes blocks one but not the other
  const endpoints = [
    `https://webcast.tiktok.com/webcast/room/info/?aid=1988&room_id=${roomId}`,
    `https://www.tiktok.com/api/live/detail/?aid=1988&roomID=${roomId}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
          Referer: 'https://www.tiktok.com/',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) continue;

      const json = asObject(await response.json() as unknown);
      const roomData = json
        ? json['data'] ?? json['LiveRoomInfo'] ?? json['roomInfo']
        : null;

      if (isObject(roomData)) return roomData;
    } catch {
      // try next endpoint
    }
  }

  return null;
}

interface NormalizedTikTokRoom {
  title: string;
  viewerCount: number;
  thumbnailUrl: string | null;
  profilePicUrl: string | null;
  startedAt: string;
}

export function normalizeTikTokRoomData(
  value: unknown,
  username: string
): NormalizedTikTokRoom {
  const room = asObject(value) ?? {};
  const title = stringValue(room['title']) ?? username;
  const viewerCount = nonNegativeInteger(room['user_count'] ?? room['user_count_str']);
  const cover = asObject(room['cover']);
  const owner = asObject(room['owner']);
  const avatar = asObject(owner?.['avatar_thumb']);

  return {
    title,
    viewerCount,
    thumbnailUrl: extractUrl(cover?.['url_list']),
    profilePicUrl: extractUrl(avatar?.['url_list']),
    startedAt: extractStartTime(room),
  };
}

function extractUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return value.find((item): item is string =>
    typeof item === 'string' && /^https?:\/\//.test(item)
  ) ?? null;
}

function extractStartTime(roomData: JsonObject): string {
  const seconds = finiteNumber(roomData['create_time'] ?? roomData['start_time']);
  if (seconds !== null && seconds > 0) {
    const milliseconds = seconds * 1000;
    if (Number.isFinite(milliseconds)) {
      const date = new Date(milliseconds);
      if (Number.isFinite(date.getTime())) return date.toISOString();
    }
  }
  return new Date().toISOString();
}

function nonNegativeInteger(value: unknown): number {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : 0;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asObject(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
