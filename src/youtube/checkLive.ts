import { safeLogValue } from '../log.ts';
import type { LiveCheckError, LiveCheckResult, LiveInfo } from '../types.js';

const API_ORIGIN = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_SCAN_SIZE = 20;
const CHANNEL_ID_PATTERN = /^UC[\w-]{20,}$/;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
type JsonObject = Record<string, unknown>;
interface ApiItem extends JsonObject { id?: unknown; contentDetails?: unknown; snippet?: unknown; liveStreamingDetails?: unknown; }

export async function checkYouTubeLive(channelId: string, apiKey: string, knownActiveVideoId?: string): Promise<LiveCheckResult> {
  const target = channelId.trim();
  if (!CHANNEL_ID_PATTERN.test(target)) return errorResult(target, 'YOUTUBE_CHANNEL_INVALID', 'Invalid YouTube channel ID.');
  if (!apiKey.trim()) return errorResult(target, 'YOUTUBE_API_KEY_MISSING', 'YOUTUBE_API_KEY is required.');
  try {
    if (knownActiveVideoId && VIDEO_ID_PATTERN.test(knownActiveVideoId)) {
      const active = newestActiveVideo(await fetchVideos([knownActiveVideoId], apiKey));
      if (active) return await toLiveInfo(active, target, apiKey);
    }
    const videoIds = await fetchUploadVideoIds(target, apiKey);
    if (videoIds.length === 0) return offline(target);
    const active = newestActiveVideo(await fetchVideos(videoIds, apiKey));
    return active ? await toLiveInfo(active, target, apiKey) : offline(target);
  } catch (error: unknown) {
    const normalized = normalizeError(error);
    console.warn(`[YouTube:${safeLogValue(target)}] [ERROR] ${safeLogValue(normalized.message)}`);
    return errorResult(target, normalized.code, normalized.message);
  }
}

async function fetchUploadVideoIds(channelId: string, apiKey: string): Promise<string[]> {
  const data = await apiRequest('playlistItems', { part: 'contentDetails', playlistId: `UU${channelId.slice(2)}`, maxResults: String(UPLOAD_SCAN_SIZE) }, apiKey);
  return getItems(data).flatMap((item) => {
    const videoId = asObject(item.contentDetails)?.videoId;
    return typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId) ? [videoId] : [];
  });
}
async function fetchVideos(videoIds: string[], apiKey: string): Promise<ApiItem[]> {
  return getItems(await apiRequest('videos', { part: 'snippet,liveStreamingDetails', id: videoIds.join(',') }, apiKey));
}
async function fetchChannel(channelId: string, apiKey: string): Promise<ApiItem | null> {
  return getItems(await apiRequest('channels', { part: 'snippet', id: channelId }, apiKey))[0] ?? null;
}
async function apiRequest(resource: string, params: Record<string, string>, apiKey: string): Promise<JsonObject> {
  const url = new URL(`${API_ORIGIN}/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new YouTubeApiError('YOUTUBE_TIMEOUT', 'YouTube API request timed out.');
    throw new YouTubeApiError('YOUTUBE_NETWORK_ERROR', 'YouTube API request failed.');
  }
  const data = await readJson(response);
  if (!response.ok) throw googleApiError(response.status, data);
  if (!data) throw new YouTubeApiError('YOUTUBE_RESPONSE_INVALID', 'YouTube API returned invalid JSON.');
  return data;
}
async function readJson(response: Response): Promise<JsonObject | null> {
  try { return asObject(await response.json() as unknown); } catch { return null; }
}
function googleApiError(status: number, data: JsonObject | null): YouTubeApiError {
  const error = asObject(data?.error);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const reason = errors.map(asObject).find(Boolean)?.reason;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') return new YouTubeApiError('YOUTUBE_QUOTA_EXCEEDED', 'YouTube API quota exceeded.');
  if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') return new YouTubeApiError('YOUTUBE_API_KEY_INVALID', 'YouTube API key is invalid or not authorized.');
  return new YouTubeApiError(`YOUTUBE_HTTP_${status}`, `YouTube API returned HTTP ${status}.`);
}
function newestActiveVideo(items: ApiItem[]): ApiItem | null {
  return items.filter(isActiveLive).sort((a, b) => startTime(b).localeCompare(startTime(a)))[0] ?? null;
}
function isActiveLive(item: ApiItem): boolean {
  const snippet = asObject(item.snippet);
  const details = asObject(item.liveStreamingDetails);
  return snippet?.liveBroadcastContent === 'live' && typeof details?.actualStartTime === 'string' && typeof details.actualEndTime !== 'string';
}
async function toLiveInfo(video: ApiItem, channelId: string, apiKey: string): Promise<LiveInfo> {
  const videoId = typeof video.id === 'string' ? video.id : '';
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new YouTubeApiError('YOUTUBE_RESPONSE_INVALID', 'Active video has no valid ID.');
  const snippet = asObject(video.snippet) ?? {};
  const details = asObject(video.liveStreamingDetails) ?? {};
  const channelSnippet = asObject((await fetchChannel(channelId, apiKey))?.snippet) ?? {};
  const info: LiveInfo = {
    status: 'live', isLive: true, platform: 'youtube', username: channelId,
    displayName: stringValue(channelSnippet.title) ?? stringValue(snippet.channelTitle) ?? channelId,
    roomId: videoId, title: stringValue(snippet.title) ?? 'YouTube Live',
    viewerCount: nonNegativeInteger(details.concurrentViewers), thumbnailUrl: bestThumbnail(snippet.thumbnails),
    profilePicUrl: bestThumbnail(channelSnippet.thumbnails), liveUrl: `https://www.youtube.com/watch?v=${videoId}`,
    profileUrl: `https://www.youtube.com/channel/${channelId}`, startedAt: stringValue(details.actualStartTime) ?? new Date().toISOString(),
  };
  console.log(`[YouTube:${safeLogValue(channelId)}] [LIVE] video: ${safeLogValue(videoId)}, viewers: ${info.viewerCount}, title: ${safeLogValue(info.title)}`);
  return info;
}
function offline(channelId: string): LiveCheckResult {
  console.log(`[YouTube:${safeLogValue(channelId)}] [OFFLINE] Not live.`);
  return { status: 'offline', isLive: false, platform: 'youtube', username: channelId };
}
function errorResult(username: string, errorCode: string, message: string): LiveCheckError {
  return { status: 'error', isLive: false, platform: 'youtube', username, errorCode, message };
}
function getItems(data: JsonObject): ApiItem[] { return Array.isArray(data.items) ? data.items.filter(isObject) : []; }
function asObject(value: unknown): JsonObject | null { return isObject(value) ? value : null; }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function startTime(item: ApiItem): string { return stringValue(asObject(item.liveStreamingDetails)?.actualStartTime) ?? ''; }
function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}
function bestThumbnail(value: unknown): string | null {
  const thumbnails = asObject(value);
  if (!thumbnails) return null;
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = asObject(thumbnails[key])?.url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return null;
}
class YouTubeApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'YouTubeApiError';
    this.code = code;
  }
}
function normalizeError(error: unknown): { code: string; message: string } {
  return error instanceof YouTubeApiError ? error : { code: 'YOUTUBE_UNKNOWN_ERROR', message: 'Unexpected YouTube API error.' };
}
