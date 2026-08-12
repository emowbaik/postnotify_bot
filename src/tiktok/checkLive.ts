/**
 * TikTok live status checker.
 *
 * Strategy:
 *   1. Fetch composite boolean and room ID independently.
 *   2. Query both room-detail endpoints for that exact string room ID.
 *   3. Require matching owner plus room status 2 (active) or 4 (ended).
 *   4. Treat missing, malformed, mismatched, or conflicting evidence as error.
 */

import { TikTokLiveConnection } from 'tiktok-live-connector';
import { safeLogValue } from '../log.ts';
import type {
  LiveCheckResult,
  TikTokDetectorDiagnostic,
} from '../types.js';

/**
 * Check whether a TikTok user is currently live.
 * @param username - TikTok username WITHOUT the @ symbol.
 */
export async function checkIsLive(username: string): Promise<LiveCheckResult> {
  const liveUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}/live`;
  const connection = new TikTokLiveConnection(username, {});
  const [isLiveResult, roomIdResult] = await Promise.allSettled([
    connection.fetchIsLive(),
    connection.fetchRoomId(),
  ]);
  const isLive = isLiveResult.status === 'fulfilled' ? isLiveResult.value : null;
  const roomId = roomIdResult.status === 'fulfilled' && /^\d+$/u.test(roomIdResult.value)
    ? roomIdResult.value
    : null;
  const detailFetch = roomId
    ? await fetchRoomDetails(roomId)
    : { candidates: [], outcomes: [] };
  const decision = classifyTikTokSignals(
    username,
    isLive,
    roomId,
    detailFetch.candidates.map((candidate) => candidate.value)
  );
  decision.sourceOutcomes.unshift(
    settledSignalOutcome('isLive', isLiveResult),
    settledSignalOutcome('roomId', roomIdResult),
    ...detailFetch.outcomes
  );
  const diagnostic = buildTikTokDiagnostic(username, decision);

  if (decision.status === 'offline') {
    console.log(`[${safeLogValue(username)}] 💤 Not live.`);
    return {
      status: 'offline',
      isLive: false,
      platform: 'tiktok',
      username,
      detectorDiagnostic: diagnostic,
    };
  }

  if (decision.status === 'error' || !decision.room || !decision.roomId) {
    const signalErrors = [isLiveResult, roomIdResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    const allSignalsFailed = isLiveResult.status === 'rejected'
      && roomIdResult.status === 'rejected';
    const errorCode = allSignalsFailed
      ? signalErrors.some(isTimeoutError) ? 'TIKTOK_TIMEOUT' : 'TIKTOK_CONNECTOR_ERROR'
      : decision.errorCode ?? 'TIKTOK_STATUS_INCONCLUSIVE';
    const message = tiktokErrorMessage(errorCode);
    console.warn(`[${safeLogValue(username)}] [ERROR] ${message}`);
    return checkError(username, errorCode, message, diagnostic);
  }

  const room = normalizeTikTokRoomData(decision.room, username);
  const { title, viewerCount, thumbnailUrl, profilePicUrl, startedAt } = room;
  console.log(`[${safeLogValue(username)}] ✅ LIVE — room: ${safeLogValue(decision.roomId)}, viewers: ${viewerCount}, title: ${safeLogValue(title)}`);

  return {
    status: 'live',
    isLive: true,
    platform: 'tiktok',
    username,
    displayName: username,
    roomId: decision.roomId,
    title,
    viewerCount,
    thumbnailUrl,
    profilePicUrl,
    liveUrl,
    profileUrl: `https://www.tiktok.com/@${encodeURIComponent(username)}`,
    startedAt,
    detectorDiagnostic: diagnostic,
  };
}

function checkError(
  username: string,
  errorCode: string,
  message: string,
  detectorDiagnostic?: TikTokDetectorDiagnostic
): LiveCheckResult {
  return {
    status: 'error',
    isLive: false,
    platform: 'tiktok',
    username,
    errorCode,
    message,
    ...(detectorDiagnostic && { detectorDiagnostic }),
  };
}

function tiktokErrorMessage(errorCode: string): string {
  if (errorCode === 'TIKTOK_TIMEOUT') return 'TikTok request timed out.';
  if (errorCode === 'TIKTOK_CONNECTOR_ERROR') return 'TikTok live check failed.';
  if (errorCode === 'TIKTOK_STATUS_CONFLICT') return 'TikTok live-status sources returned conflicting results.';
  return 'TikTok live status could not be confirmed.';
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'TimeoutError'
    || error.name === 'AbortError'
    || message.includes('timeout');
}

function settledSignalOutcome<T>(
  name: string,
  result: PromiseSettledResult<T>
): string {
  if (result.status === 'fulfilled') {
    if (typeof result.value === 'boolean') return `${name}:${result.value}`;
    return `${name}:present`;
  }
  return `${name}:${isTimeoutError(result.reason) ? 'timeout' : 'error'}`;
}

// ─── TikTok internal API ─────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

interface RoomDetailCandidate {
  source: string;
  value: JsonObject;
}

interface RoomDetailFetch {
  candidates: RoomDetailCandidate[];
  outcomes: string[];
}

async function fetchRoomDetails(roomId: string): Promise<RoomDetailFetch> {
  const roomInfoUrl = new URL('https://webcast.tiktok.com/webcast/room/info/');
  roomInfoUrl.searchParams.set('aid', '1988');
  roomInfoUrl.searchParams.set('room_id', roomId);
  const liveDetailUrl = new URL('https://www.tiktok.com/api/live/detail/');
  liveDetailUrl.searchParams.set('aid', '1988');
  liveDetailUrl.searchParams.set('roomID', roomId);
  const endpoints = [
    { source: 'roomInfo', url: roomInfoUrl },
    { source: 'liveDetail', url: liveDetailUrl },
  ];
  const candidates: RoomDetailCandidate[] = [];
  const outcomes: string[] = [];

  await Promise.all(endpoints.map(async ({ source, url }) => {
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
      if (!response.ok) {
        outcomes.push(`${source}:http_${response.status}`);
        return;
      }

      const json = asObject(await response.json() as unknown);
      const statusCode = finiteNumber(json?.['status_code'] ?? json?.['statusCode']);
      if (!json || (statusCode !== null && statusCode !== 0)) {
        outcomes.push(`${source}:api_error`);
        return;
      }
      const roomData = json['data'] ?? json['LiveRoomInfo'] ?? json['roomInfo'];
      if (!isObject(roomData)) {
        outcomes.push(`${source}:invalid`);
        return;
      }
      candidates.push({ source, value: roomData });
      outcomes.push(`${source}:ok`);
    } catch (error: unknown) {
      outcomes.push(`${source}:${isTimeoutError(error) ? 'timeout' : 'error'}`);
    }
  }));

  return { candidates, outcomes };
}

interface TikTokSignalDecision {
  status: 'live' | 'offline' | 'error';
  roomId?: string;
  room?: JsonObject;
  errorCode?: 'TIKTOK_STATUS_CONFLICT' | 'TIKTOK_STATUS_INCONCLUSIVE';
  sourceOutcomes: string[];
}

interface ClassifiedTikTokRoom {
  kind: 'live' | 'offline' | 'invalid';
  reason: string;
  room?: JsonObject;
}

export function classifyTikTokSignals(
  username: string,
  isLive: boolean | null,
  roomId: string | null,
  roomDetails: unknown | readonly unknown[]
): TikTokSignalDecision {
  const sourceOutcomes = [
    `composite:${isLive === null ? 'error' : isLive}`,
    `resolvedRoomId:${roomId ? 'present' : 'missing'}`,
  ];
  if (!roomId) {
    return {
      status: 'error',
      errorCode: 'TIKTOK_STATUS_INCONCLUSIVE',
      sourceOutcomes,
    };
  }

  const details = Array.isArray(roomDetails) ? roomDetails : [roomDetails];
  const rooms = details.map((value) => classifyTikTokRoom(username, roomId, value));
  rooms.forEach((room) => sourceOutcomes.push(room.reason));
  const liveRoom = rooms.find((room) => room.kind === 'live');
  const offlineRoom = rooms.find((room) => room.kind === 'offline');
  if (liveRoom?.room && offlineRoom?.room) {
    return {
      status: 'error',
      roomId,
      errorCode: 'TIKTOK_STATUS_CONFLICT',
      sourceOutcomes,
    };
  }
  if (liveRoom?.room) {
    return { status: 'live', roomId, room: liveRoom.room, sourceOutcomes };
  }

  if (offlineRoom?.room && isLive !== true) {
    return { status: 'offline', roomId, room: offlineRoom.room, sourceOutcomes };
  }

  return {
    status: 'error',
    roomId,
    ...(offlineRoom?.room && { room: offlineRoom.room }),
    errorCode: offlineRoom && isLive === true
      ? 'TIKTOK_STATUS_CONFLICT'
      : 'TIKTOK_STATUS_INCONCLUSIVE',
    sourceOutcomes,
  };
}

function classifyTikTokRoom(
  username: string,
  requestedRoomId: string,
  value: unknown
): ClassifiedTikTokRoom {
  const room = asObject(value);
  if (!room) return { kind: 'invalid', reason: 'room:not_object' };

  const roomId = identifier(room['id_str'] ?? room['room_id'] ?? room['roomId']);
  if (!roomId || roomId !== requestedRoomId) {
    return { kind: 'invalid', reason: 'room:id_mismatch' };
  }

  const owner = asObject(room['owner']);
  const ownerId = stringValue(owner?.['display_id'] ?? owner?.['unique_id'] ?? owner?.['uniqueId']);
  if (!ownerId || normalizeUsername(ownerId) !== normalizeUsername(username)) {
    return { kind: 'invalid', reason: 'room:owner_mismatch' };
  }

  const status = finiteNumber(room['status']);
  if (status === 2) return { kind: 'live', reason: 'room:status_2', room };
  if (status === 4) return { kind: 'offline', reason: 'room:status_4', room };
  return { kind: 'invalid', reason: 'room:status_unknown' };
}

function buildTikTokDiagnostic(
  username: string,
  decision: TikTokSignalDecision
): TikTokDetectorDiagnostic {
  return {
    platform: 'tiktok',
    target: username,
    classification: decision.status,
    sourceOutcomes: decision.sourceOutcomes.map((value) => value.slice(0, 80)).slice(0, 12),
    ...(decision.roomId && { roomIdSuffix: decision.roomId.slice(-8) }),
    ...(decision.errorCode && { errorCode: decision.errorCode }),
    observedAt: new Date().toISOString(),
  };
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/u, '').toLowerCase();
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/u.test(value) ? value : null;
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
