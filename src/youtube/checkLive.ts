/**
 * YouTube live status checker using YouTube's unofficial internal web API data.
 *
 * The channel `/live` page is the primary source. If its embedded initial data
 * does not contain an active broadcast, one bounded Innertube browse request is
 * attempted using the client context embedded in that same page. When a page
 * exposes candidate video IDs but no active renderer, bounded watch-page checks
 * verify active player metadata before reporting live.
 */

import type { LiveCheckResult } from '../types.js';

const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_WATCH_PAGE_CANDIDATES = 3;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

interface YouTubeLiveCandidate {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string | null;
  profilePicUrl: string | null;
  viewerCount: number;
  startedAt: string;
}

interface JsonObject {
  [key: string]: unknown;
}

/** Check one YouTube channel ID for an active live or airing Premiere. */
export async function checkYouTubeLive(channelId: string): Promise<LiveCheckResult> {
  const normalizedChannelId = channelId.trim();
  const liveUrl = `${YOUTUBE_ORIGIN}/channel/${encodeURIComponent(normalizedChannelId)}/live`;

  if (!/^UC[\w-]{20,}$/.test(normalizedChannelId)) {
    console.warn(`[YouTube:${normalizedChannelId}] âš ï¸ Invalid channel ID â€” skipping.`);
    return { isLive: false, username: normalizedChannelId };
  }

  try {
    const pageHtml = await fetchText(liveUrl, 'text/html');
    const pageData = extractInitialData(pageHtml);
    const playerData = extractInitialPlayerResponse(pageHtml);
    const candidate =
      (playerData ? findActivePlayerLive(playerData) : null) ??
      (pageData ? findActiveLive(pageData) : null);

    if (candidate) {
      return toLiveInfo(normalizedChannelId, candidate);
    }

    const browseData = await fetchBrowseData(normalizedChannelId, pageHtml);
    const browseCandidate = browseData ? findActiveLive(browseData) : null;

    if (browseCandidate) {
      return toLiveInfo(normalizedChannelId, browseCandidate);
    }

    const watchCandidate = await findWatchPageLive(pageData, playerData, pageHtml, normalizedChannelId);
    if (watchCandidate) {
      return toLiveInfo(normalizedChannelId, watchCandidate);
    }

    console.log(`[YouTube:${normalizedChannelId}] ðŸ’¤ Not live.`);
    return { isLive: false, username: normalizedChannelId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[YouTube:${normalizedChannelId}] âš ï¸ Error: ${message}`);
    return { isLive: false, username: normalizedChannelId };
  }
}

function toLiveInfo(channelId: string, candidate: YouTubeLiveCandidate): LiveCheckResult {
  const info: LiveCheckResult = {
    isLive: true,
    platform: 'youtube',
    username: channelId,
    displayName: candidate.channelName || channelId,
    roomId: candidate.videoId,
    title: candidate.title || `${candidate.channelName || channelId} Live`,
    viewerCount: candidate.viewerCount,
    thumbnailUrl: candidate.thumbnailUrl,
    profilePicUrl: candidate.profilePicUrl,
    liveUrl: `${YOUTUBE_ORIGIN}/watch?v=${encodeURIComponent(candidate.videoId)}`,
    profileUrl: `${YOUTUBE_ORIGIN}/channel/${encodeURIComponent(channelId)}`,
    startedAt: candidate.startedAt,
  };

  console.log(
    `[YouTube:${channelId}] âœ… LIVE â€” video: ${candidate.videoId}, viewers: ${candidate.viewerCount}, title: ${info.title}`
  );
  return info;
}

async function fetchText(url: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: accept,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`YouTube HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchBrowseData(channelId: string, pageHtml: string): Promise<JsonObject | null> {
  const apiKey = extractQuotedValue(pageHtml, 'INNERTUBE_API_KEY');
  const clientVersion =
    extractQuotedValue(pageHtml, 'INNERTUBE_CLIENT_VERSION') ?? '2.20250701.01.00';

  if (!apiKey) return null;

  const response = await fetch(
    `${YOUTUBE_ORIGIN}/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: YOUTUBE_ORIGIN,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion,
            hl: 'en',
            gl: 'US',
          },
        },
        browseId: channelId,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) return null;
  const json = (await response.json()) as unknown;
  return isObject(json) ? json : null;
}

function extractWatchVideoIds(
  pageData: JsonObject | null,
  playerData: JsonObject | null,
  pageHtml: string
): string[] {
  const videoIds = new Set<string>();
  const addVideoId = (value: unknown): void => {
    if (typeof value === 'string' && /^[\w-]{11}$/.test(value)) {
      videoIds.add(value);
    }
  };

  const playerMicroformat = getObject(getObject(playerData?.microformat)?.playerMicroformatRenderer);
  addVideoId(getObject(playerData?.videoDetails)?.videoId);
  addVideoId(playerMicroformat?.externalId);

  if (pageData) {
    walk(pageData, (value) => {
      if (!isObject(value)) return;
      addVideoId(getObject(value.watchEndpoint)?.videoId);
    });
  }

  for (const match of pageHtml.matchAll(/"watchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"([\w-]{11})"/g)) {
    addVideoId(match[1]);
  }
  for (const match of pageHtml.matchAll(/[?&]v=([\w-]{11})/g)) {
    addVideoId(match[1]);
  }
  for (const match of pageHtml.matchAll(/"videoId"\s*:\s*"([\w-]{11})"/g)) {
    addVideoId(match[1]);
  }

  return [...videoIds].slice(0, MAX_WATCH_PAGE_CANDIDATES);
}

async function findWatchPageLive(
  pageData: JsonObject | null,
  playerData: JsonObject | null,
  pageHtml: string,
  channelId: string
): Promise<YouTubeLiveCandidate | null> {
  for (const videoId of extractWatchVideoIds(pageData, playerData, pageHtml)) {
    try {
      const watchUrl = `${YOUTUBE_ORIGIN}/watch?v=${encodeURIComponent(videoId)}`;
      const watchHtml = await fetchText(watchUrl, 'text/html');
      const watchPlayerData = extractInitialPlayerResponse(watchHtml);
      const candidate = watchPlayerData ? findActivePlayerLive(watchPlayerData) : null;
      if (candidate) return candidate;

      // GitHub Actions runners receive a challenge-shaped response where videoDetails
      // is absent but raw live signals are present in the HTML. The videoId was
      // sourced from the channel live page, so a single "isLive":true signal is
      // sufficient — false positives on VODs are unlikely given that context.
      const rawIsLive = /"isLive"\s*:\s*true/.test(watchHtml);
      if (rawIsLive) {
        // Extract richer metadata from channel page data if available.
        const channelPageCandidate = pageData ? findActiveLive(pageData) : null;
        const channelName = channelPageCandidate?.channelName
          ?? extractChannelNameFromHtml(watchHtml)
          ?? extractChannelNameFromHtml(pageHtml)
          ?? channelId;
        const title = channelPageCandidate?.title
          ?? extractTitleFromHtml(watchHtml)
          ?? 'YouTube Live';
        const viewerCount = channelPageCandidate?.viewerCount
          ?? extractViewerCountFromHtml(watchHtml);
        const startedAt = channelPageCandidate?.startedAt ?? new Date().toISOString();
        const thumbnailUrl = channelPageCandidate?.thumbnailUrl
          ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        return { videoId, title, channelName, thumbnailUrl, profilePicUrl: null, viewerCount, startedAt };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractChannelNameFromHtml(html: string): string | null {
  return html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/)?.[1]
    ?? html.match(/"author"\s*:\s*"([^"]+)"/)?.[1]
    ?? html.match(/"channelName"\s*:\s*"([^"]+)"/)?.[1]
    ?? null;
}

function extractTitleFromHtml(html: string): string | null {
  const raw = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  if (!raw) return null;
  const cleaned = raw.replace(/ - YouTube$/i, '').trim();
  return cleaned || null;
}

function extractViewerCountFromHtml(html: string): number {
  const m = html.match(/"concurrentViewers"\s*:\s*"(\d+)"/)
    ?? html.match(/"viewCount"\s*:\s*"(\d+)"/);
  const n = Number(m?.[1]);
  return Number.isFinite(n) ? n : 0;
}

function extractInitialData(html: string): JsonObject | null {
  return extractEmbeddedJson(html, [
    /ytInitialData\s*=\s*/g,
    /["']ytInitialData["']\s*:\s*/g,
  ]);
}

function extractInitialPlayerResponse(html: string): JsonObject | null {
  return extractEmbeddedJson(html, [
    /ytInitialPlayerResponse\s*=\s*/g,
    /["']ytInitialPlayerResponse["']\s*:\s*/g,
  ]);
}

function extractEmbeddedJson(html: string, markers: RegExp[]): JsonObject | null {
  for (const marker of markers) {
    marker.lastIndex = 0;
    const match = marker.exec(html);
    if (!match) continue;

    const start = html.indexOf('{', match.index + match[0].length);
    const rawJson = start >= 0 ? extractBalancedJson(html, start) : null;
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // Try the next embedded data marker.
    }
  }

  return null;
}

function extractBalancedJson(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index++) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  return null;
}

function findActivePlayerLive(player: JsonObject): YouTubeLiveCandidate | null {
  const videoDetails = getObject(player.videoDetails);
  if (!videoDetails) return null;

  const microformat = getObject(getObject(player.microformat)?.playerMicroformatRenderer);
  const liveDetails = getObject(microformat?.liveBroadcastDetails);
  const hasStream = isObject(player.streamingData);
  const isLiveNow =
    videoDetails.isLive === true ||
    liveDetails?.isLiveNow === true ||
    (videoDetails.isLiveContent === true &&
      hasStream &&
      !isFutureTimestamp(liveDetails?.startTimestamp));

  if (!isLiveNow) return null;

  const videoId = readString(videoDetails.videoId) ?? readString(microformat?.externalId);
  if (!videoId) return null;

  const channelName =
    readString(videoDetails.author) ?? readText(microformat?.ownerChannelName) ?? 'YouTube channel';
  const startTime = readString(liveDetails?.startTimestamp);

  return {
    videoId,
    title: readString(videoDetails.title) ?? readText(microformat?.title) ?? 'YouTube Live',
    channelName,
    thumbnailUrl: readThumbnail(videoDetails.thumbnail) ?? readThumbnail(microformat?.thumbnail),
    profilePicUrl: null,
    viewerCount: parseViewerCount(
      readString(liveDetails?.concurrentViewers) ?? readString(videoDetails.viewCount)
    ),
    startedAt: startTime && !Number.isNaN(Date.parse(startTime))
      ? new Date(startTime).toISOString()
      : new Date().toISOString(),
  };
}

function findActiveLive(root: unknown): YouTubeLiveCandidate | null {
  const renderers: JsonObject[] = [];
  walk(root, (value) => {
    if (!isObject(value)) return;

    for (const key of ['videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer']) {
      const renderer = value[key];
      if (isObject(renderer) && typeof renderer.videoId === 'string') {
        renderers.push(renderer);
      }
    }
  });

  for (const renderer of renderers) {
    if (!isActiveLiveRenderer(renderer)) continue;

    const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : '';
    if (!videoId) continue;

    return {
      videoId,
      title: readText(renderer.title) ?? 'YouTube Live',
      channelName:
        readText(renderer.ownerText) ?? readText(renderer.shortBylineText) ?? 'YouTube channel',
      thumbnailUrl: readThumbnail(renderer.thumbnail),
      profilePicUrl:
        readThumbnail(renderer.channelThumbnailSupportedRenderers) ??
        readThumbnail(renderer.channelThumbnail),
      viewerCount: parseViewerCount(
        readText(renderer.viewCountText) ?? readText(renderer.shortViewCountText)
      ),
      startedAt: readStartTime(renderer) ?? new Date().toISOString(),
    };
  }

  return null;
}

function isActiveLiveRenderer(renderer: JsonObject): boolean {
  if (hasUpcomingMarker(renderer)) return false;

  let active = false;
  walk(renderer, (value) => {
    if (!isObject(value)) return;

    const style = value.style;
    if (style === 'LIVE' || style === 'LIVE_NOW') active = true;
    if (value.thumbnailOverlayNowPlayingRenderer) active = true;

    const label = readText(value.label) ?? readText(value.text);
    if (label && /\blive(?: now)?\b/i.test(label)) active = true;

    if (value.isLiveNow === true || value.isLive === true) active = true;
  });

  return active;
}

function hasUpcomingMarker(renderer: JsonObject): boolean {
  let upcoming = false;
  walk(renderer, (value) => {
    if (!isObject(value)) return;

    const style = readString(value.style);
    const label = [readText(value.text), readText(value.label), readText(value.badgeText)]
      .filter(Boolean)
      .join(' ');

    if (
      value.upcomingEventData ||
      style === 'UPCOMING' ||
      /upcoming|scheduled|set reminder|premieres?\s+(?:in|on)/i.test(label)
    ) {
      upcoming = true;
    }
  });
  return upcoming;
}

function readText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isObject(value)) return null;
  if (typeof value.simpleText === 'string') return value.simpleText.trim() || null;
  if (Array.isArray(value.runs)) {
    const text = value.runs
      .filter(isObject)
      .map((run) => (typeof run.text === 'string' ? run.text : ''))
      .join('')
      .trim();
    return text || null;
  }
  return null;
}

function readThumbnail(value: unknown): string | null {
  const thumbnails: Array<{ url: string; width: number }> = [];
  walk(value, (entry) => {
    if (!isObject(entry) || typeof entry.url !== 'string') return;
    thumbnails.push({
      url: entry.url,
      width: typeof entry.width === 'number' ? entry.width : 0,
    });
  });
  thumbnails.sort((left, right) => right.width - left.width);
  return normalizeYouTubeUrl(thumbnails[0]?.url);
}

function readStartTime(value: unknown): string | null {
  let result: string | null = null;
  walk(value, (entry) => {
    if (!isObject(entry) || result) return;
    for (const key of ['actualStartTime', 'startTime']) {
      const candidate = entry[key];
      if (typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) {
        result = new Date(candidate).toISOString();
        return;
      }
    }
  });
  return result;
}

function parseViewerCount(value: string | null): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([KMB])?/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return Number.isFinite(amount) ? Math.floor(amount * multiplier) : 0;
}

function extractQuotedValue(source: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`"${escapedKey}"\\s*:\\s*"([^"\\\\]+)"`));
  return match?.[1] ?? null;
}

function walk(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit);
    return;
  }
  if (!isObject(value)) return;
  for (const child of Object.values(value)) walk(child, visit);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getObject(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isFutureTimestamp(value: unknown): boolean {
  const timestamp = readString(value);
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time > Date.now() + 60_000;
}

function normalizeYouTubeUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${YOUTUBE_ORIGIN}${value}`;
  return value;
}
