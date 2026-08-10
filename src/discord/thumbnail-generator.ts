/**
 * Live Landscape Thumbnail Generator
 *
 * Output:
 * - Ukuran tetap 1280×720
 * - Rasio 16:9
 * - Background blur dari thumbnail live
 * - Informasi streamer di sebelah kiri
 * - Thumbnail portrait di sebelah kanan
 * - Format JPEG agar ukuran file kecil
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import type { IncomingHttpHeaders } from 'node:http';
import { get as httpsGet } from 'node:https';
import { BlockList, isIP } from 'node:net';
import sharp from 'sharp';
import type { LiveInfo } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const POSTER_WIDTH = 390;
const POSTER_HEIGHT = 570;

const POSTER_LEFT = 820;
const POSTER_TOP = 75;

const AVATAR_SIZE = 88;

const PLATFORM_ACCENT_COLOR = {
  tiktok: '#FE2C55',
  youtube: '#FF0033',
} as const;

const MAX_REMOTE_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_REMOTE_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_REDIRECTS = 3;
const IMAGE_DOWNLOAD_TIMEOUT = 10_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const ALLOWED_SHARP_FORMATS = new Set(['avif', 'gif', 'heif', 'jpeg', 'png', 'webp']);

const BLOCKED_IPV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_IPV4.addSubnet(network, prefix, 'ipv4');
}

const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, 'ipv6');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Generator
// ─────────────────────────────────────────────────────────────────────────────

export async function generateLivePreview(
  info: LiveInfo
): Promise<Buffer> {
  const displayName = displayCreatorName(info);
  const accentColor = platformAccentColor(info);

  const thumbnailBuffer = await downloadImage(info.thumbnailUrl);
  const profileBuffer = await downloadImage(info.profilePicUrl);

  /**
   * Thumbnail live menjadi sumber utama background.
   * Jika tidak tersedia, gunakan foto profil.
   * Jika keduanya gagal, gunakan background fallback.
   */
  const backgroundSource =
    thumbnailBuffer ?? profileBuffer ?? createFallbackBackground(accentColor);

  const background = await createBackground(backgroundSource);

  const poster = thumbnailBuffer
    ? await createRoundedPoster(thumbnailBuffer)
    : createFallbackPoster(displayName, info);

  const avatar = profileBuffer
    ? await createCircularAvatar(profileBuffer)
    : createFallbackAvatar(displayName, accentColor);

  const finalImage = await sharp(background, {
    limitInputPixels: MAX_REMOTE_IMAGE_PIXELS,
  })
    .composite([
      { input: createBackgroundOverlay(), top: 0, left: 0 },
      { input: createPosterShadow(), top: POSTER_TOP + 14, left: POSTER_LEFT + 14 },
      { input: poster, top: POSTER_TOP, left: POSTER_LEFT },
      { input: createPosterBorder(), top: POSTER_TOP, left: POSTER_LEFT },
      { input: avatar, top: 65, left: 72 },
      { input: createTextOverlay(info), top: 0, left: 0 },
    ])
    .flatten({ background: '#080A0F' })
    .jpeg({ quality: 88, progressive: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return finalImage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Background
// ─────────────────────────────────────────────────────────────────────────────

async function createBackground(source: Buffer): Promise<Buffer> {
  return sharp(source, { limitInputPixels: MAX_REMOTE_IMAGE_PIXELS })
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .blur(30)
    .modulate({ brightness: 0.46, saturation: 0.88 })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function createFallbackBackground(accentColor: string): Buffer {
  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fallbackBackground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#07090F"/>
          <stop offset="55%" stop-color="#171A24"/>
          <stop offset="100%" stop-color="${accentColor}"/>
        </linearGradient>
        <radialGradient id="glow" cx="85%" cy="35%" r="65%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${accentColor}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#fallbackBackground)"/>
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#glow)"/>
    </svg>
  `);
}

function createBackgroundOverlay(): Buffer {
  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="darkOverlay" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#05070B" stop-opacity="0.98"/>
          <stop offset="48%" stop-color="#05070B" stop-opacity="0.90"/>
          <stop offset="70%" stop-color="#05070B" stop-opacity="0.58"/>
          <stop offset="100%" stop-color="#05070B" stop-opacity="0.20"/>
        </linearGradient>
        <linearGradient id="bottomOverlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="45%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
        </linearGradient>
      </defs>
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#darkOverlay)"/>
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#bottomOverlay)"/>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Poster
// ─────────────────────────────────────────────────────────────────────────────

async function createRoundedPoster(source: Buffer): Promise<Buffer> {
  const roundedMask = Buffer.from(`
    <svg width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="28" ry="28" fill="#ffffff"/>
    </svg>
  `);

  return sharp(source, { limitInputPixels: MAX_REMOTE_IMAGE_PIXELS })
    .resize(POSTER_WIDTH, POSTER_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function createFallbackPoster(displayName: string, info: LiveInfo): Buffer {
  const initial = escapeXml(displayName.charAt(0).toUpperCase() || 'L');
  const accentColor = platformAccentColor(info);
  const platform = escapeXml(`${platformLabel(info).toUpperCase()} LIVE`);

  return Buffer.from(`
    <svg width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="posterGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="#11141D"/>
        </linearGradient>
        <radialGradient id="posterGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="28" fill="url(#posterGradient)"/>
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="28" fill="url(#posterGlow)"/>
      <circle cx="${POSTER_WIDTH / 2}" cy="${POSTER_HEIGHT / 2 - 35}" r="98" fill="#ffffff" fill-opacity="0.12"/>
      <text x="50%" y="${POSTER_HEIGHT / 2 + 5}" text-anchor="middle" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="118" font-weight="700">${initial}</text>
      <text x="50%" y="${POSTER_HEIGHT - 70}" text-anchor="middle" fill="#ffffff" fill-opacity="0.80"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${platform}</text>
    </svg>
  `);
}

function createPosterShadow(): Buffer {
  return Buffer.from(`
    <svg width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="28" fill="#000000" fill-opacity="0.50"/>
    </svg>
  `);
}

function createPosterBorder(): Buffer {
  return Buffer.from(`
    <svg width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${POSTER_WIDTH - 4}" height="${POSTER_HEIGHT - 4}" rx="27"
        fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="4"/>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────

async function createCircularAvatar(source: Buffer): Promise<Buffer> {
  const mask = Buffer.from(`
    <svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="#ffffff"/>
    </svg>
  `);

  return sharp(source, { limitInputPixels: MAX_REMOTE_IMAGE_PIXELS })
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function createFallbackAvatar(displayName: string, accentColor: string): Buffer {
  const initial = escapeXml(displayName.charAt(0).toUpperCase() || 'L');

  return Buffer.from(`
    <svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="${accentColor}"/>
      <text x="${AVATAR_SIZE / 2}" y="59" text-anchor="middle" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="44" font-weight="700">${initial}</text>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Overlay
// ─────────────────────────────────────────────────────────────────────────────

function createTextOverlay(info: LiveInfo): Buffer {
  const creatorName = displayCreatorName(info);
  const rawTitle = stripEmoji(info.title?.trim() || `${creatorName} sedang melakukan siaran langsung`);
  const titleLines = wrapTextByWidth(rawTitle, 650, 54, 2);

  const firstTitleLine = escapeXml(titleLines[0] ?? '');
  const secondTitleLine = escapeXml(titleLines[1] ?? '');
  const viewerRaw = info.viewerCount ?? 0;
  const viewers = escapeXml(viewerRaw > 0 ? formatViewerCount(viewerRaw) : '-');
  const duration = escapeXml(formatLiveDuration(info.startedAt));
  const escapedCreatorName = escapeXml(fitTextToWidth(creatorName, 570, 28));
  const platform = platformLabel(info);
  const creatorRole = escapeXml(platform === 'YouTube' ? 'YouTube Live Channel' : 'TikTok Live Creator');
  const accentColor = platformAccentColor(info);

  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- Avatar border -->
      <circle cx="116" cy="109" r="47" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="3"/>

      <!-- Username -->
      <text x="180" y="102" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="28" font-weight="700">${escapedCreatorName}</text>
      <text x="180" y="134" fill="#ffffff" fill-opacity="0.58"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="19" font-weight="500">${creatorRole}</text>

      <!-- Live badge -->
      <rect x="72" y="184" width="246" height="52" rx="26" fill="${accentColor}"/>
      <circle cx="102" cy="210" r="8" fill="#ffffff"/>
      <text x="124" y="218" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="20" font-weight="700" letter-spacing="1">LIVE SEKARANG</text>

      <!-- Heading -->
      <text x="72" y="303" fill="#ffffff" fill-opacity="0.62"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="25" font-weight="600">Sedang menyiarkan</text>

      <!-- Title line 1 -->
      <text x="72" y="370" fill="#ffffff" direction="auto" unicode-bidi="plaintext"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="54" font-weight="800">${firstTitleLine}</text>

      ${secondTitleLine ? `
      <text x="72" y="435" fill="#ffffff" direction="auto" unicode-bidi="plaintext"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="54" font-weight="800">${secondTitleLine}</text>
      ` : ''}

      <!-- Divider -->
      <rect x="72" y="494" width="650" height="2" rx="1" fill="#ffffff" fill-opacity="0.13"/>

      <!-- Viewer statistics -->
      <text x="72" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">PENONTON</text>
      <text x="72" y="588" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${viewers}</text>

      <!-- Live duration -->
      <text x="320" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">DURASI LIVE</text>
      <text x="320" y="588" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${duration}</text>

      <!-- Platform -->
      <text x="570" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">PLATFORM</text>
      <text x="570" y="588" fill="#ffffff"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${platform}</text>

      <!-- Bottom CTA -->
      <circle cx="82" cy="654" r="6" fill="${accentColor}"/>
      <text x="102" y="661" fill="#ffffff" fill-opacity="0.65"
        font-family="Noto Sans, Noto Sans CJK JP, DejaVu Sans, sans-serif" font-size="20" font-weight="500">Tonton sekarang sebelum siaran berakhir</text>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote Image Downloader
// ─────────────────────────────────────────────────────────────────────────────

type ImageDnsResolver = (hostname: string) => Promise<LookupAddress[]>;

type RemoteImageResponse = AsyncIterable<Uint8Array | string> & {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  destroy(): void;
  resume(): void;
};

type RemoteImageRequest = (
  url: URL,
  addresses: readonly LookupAddress[],
  signal: AbortSignal
) => Promise<RemoteImageResponse>;

export interface ImageDownloadDependencies {
  resolveHostname?: ImageDnsResolver;
  request?: RemoteImageRequest;
}

export async function downloadImage(
  imageUrl?: string | null,
  dependencies: ImageDownloadDependencies = {}
): Promise<Buffer | null> {
  if (!imageUrl) return null;

  let currentUrl: URL;
  try {
    currentUrl = new URL(imageUrl);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);
  const resolveHostname = dependencies.resolveHostname ?? defaultImageDnsResolver;
  const request = dependencies.request ?? requestRemoteImage;

  let activeResponse: RemoteImageResponse | null = null;
  try {
    for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount++) {
      const addresses = await withAbort(
        resolvePublicImageTarget(currentUrl, resolveHostname),
        controller.signal
      );
      const response = await request(currentUrl, addresses, controller.signal);
      activeResponse = response;
      const status = response.statusCode ?? 0;

      if (isRedirectStatus(status)) {
        const location = headerValue(response.headers.location);
        response.resume();
        if (!location || redirectCount === MAX_IMAGE_REDIRECTS) {
          throw new Error('Remote image redirect tidak valid.');
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        throw new Error(`HTTP ${status}`);
      }

      const contentType = headerValue(response.headers['content-type'])
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase();
      if (!contentType || !ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
        response.destroy();
        throw new Error('Remote resource bukan gambar raster yang didukung.');
      }

      const contentLength = Number(headerValue(response.headers['content-length']) ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_SIZE) {
        response.destroy();
        throw new Error('Remote image terlalu besar.');
      }

      const buffer = await readLimitedImageBody(response);
      const metadata = await sharp(buffer, {
        limitInputPixels: MAX_REMOTE_IMAGE_PIXELS,
      }).metadata();
      const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
      if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
        throw new Error('Format remote image tidak didukung.');
      }
      if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > MAX_REMOTE_IMAGE_PIXELS) {
        throw new Error('Dimensi remote image terlalu besar.');
      }
      return buffer;
    }
  } catch (error: unknown) {
    activeResponse?.destroy();
    const reason = error instanceof Error
      ? error.message.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').trim()
      : 'Unknown image error.';
    console.warn(
      `[Thumbnail] Gagal mengunduh gambar dari ${safeRemoteOrigin(currentUrl)}: ${reason}`
    );
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

export async function resolvePublicImageTarget(
  url: URL,
  resolveHostname: ImageDnsResolver = defaultImageDnsResolver
): Promise<LookupAddress[]> {
  if (url.protocol !== 'https:') throw new Error('Remote image wajib menggunakan HTTPS.');
  if (url.username || url.password) throw new Error('Remote image URL tidak boleh berisi kredensial.');
  if (url.port && url.port !== '443') throw new Error('Remote image wajib menggunakan port HTTPS standar.');

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Remote image host tidak diizinkan.');
  }

  const family = isIP(hostname);
  const resolved = family
    ? [{ address: hostname, family } as LookupAddress]
    : await resolveHostname(hostname);
  if (resolved.length === 0) throw new Error('Remote image host tidak dapat di-resolve.');

  const unique = new Map<string, LookupAddress>();
  for (const result of resolved) {
    if ((result.family !== 4 && result.family !== 6) || !isPublicIpAddress(result.address)) {
      throw new Error('Remote image host mengarah ke jaringan nonpublik.');
    }
    unique.set(`${result.family}:${result.address}`, result);
  }
  return [...unique.values()];
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).split('%', 1)[0] ?? '';
  const family = isIP(normalized);
  if (family === 4) return !BLOCKED_IPV4.check(normalized, 'ipv4');
  if (family === 6) return !BLOCKED_IPV6.check(normalized, 'ipv6');
  return false;
}

async function defaultImageDnsResolver(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function requestRemoteImage(
  url: URL,
  addresses: readonly LookupAddress[],
  signal: AbortSignal
): Promise<RemoteImageResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, {
      agent: false,
      signal,
      headers: { 'User-Agent': 'PostNotifyBot/2.0', Accept: 'image/*' },
      lookup: (_hostname, options, callback) => {
        const requestedFamily = options.family === 4 || options.family === 6
          ? options.family
          : 0;
        const eligible = requestedFamily
          ? addresses.filter((address) => address.family === requestedFamily)
          : addresses;
        const selected = eligible[0];
        if (!selected) {
          const error = Object.assign(new Error('No validated address for requested family.'), {
            code: 'ENOTFOUND',
          });
          callback(error, '', 0);
        } else if (options.all) {
          callback(null, [...eligible]);
        } else {
          callback(null, selected.address, selected.family);
        }
      },
    }, (response) => resolve(Object.assign(response, {
      statusCode: response.statusCode,
    })));
    request.once('error', reject);
  });
}

async function readLimitedImageBody(response: RemoteImageResponse): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_REMOTE_IMAGE_SIZE) {
      response.destroy();
      throw new Error('Remote image melebihi batas ukuran.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Remote image request timed out.'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Remote image request timed out.'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeRemoteOrigin(url: URL): string {
  return url.protocol === 'https:' ? url.origin : '[blocked URL]';
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting Utilities
// ─────────────────────────────────────────────────────────────────────────────

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '') || 'creator';
}

function displayCreatorName(info: LiveInfo): string {
  const name = info.displayName.trim() || normalizeUsername(info.username);
  return info.platform === 'tiktok' ? `@${normalizeUsername(name)}` : name;
}

function platformLabel(info: LiveInfo): 'TikTok' | 'YouTube' {
  return info.platform === 'youtube' ? 'YouTube' : 'TikTok';
}

function platformAccentColor(info: LiveInfo): string {
  return PLATFORM_ACCENT_COLOR[info.platform];
}

function formatViewerCount(viewerCount: number): string {
  if (!Number.isFinite(viewerCount) || viewerCount < 0) return '—';
  return new Intl.NumberFormat('id-ID').format(Math.floor(viewerCount));
}

function formatLiveDuration(startedAt: string): string {
  const startedTime = Date.parse(startedAt);
  if (!Number.isFinite(startedTime)) return 'Baru dimulai';

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedTime) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);

  if (hours > 0) return `${hours}j ${minutes}m`;
  if (minutes > 0) return `${minutes} menit`;
  return 'Baru dimulai';
}

function wrapTextByWidth(
  input: string,
  maximumWidth: number,
  fontSize: number,
  maximumLines: number
): string[] {
  const cleanInput = input.replace(/\s+/g, ' ').trim();
  if (!cleanInput) return ['Live Now'];

  const words = cleanInput.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (estimatedTextWidth(candidate, fontSize) <= maximumWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = fitTextToWidth(word, maximumWidth, fontSize);

    if (lines.length === maximumLines - 1) {
      const remaining = [currentLine, ...words.slice(index + 1)].join(' ');
      lines.push(fitTextToWidth(remaining, maximumWidth, fontSize));
      return lines;
    }
  }

  if (currentLine && lines.length < maximumLines) lines.push(currentLine);
  return lines.slice(0, maximumLines);
}

function estimatedTextWidth(value: string, fontSize: number): number {
  return [...value].reduce((width, character) => {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) {
      return width + fontSize;
    }
    if (/[WM@%&]/.test(character)) return width + fontSize * 0.9;
    if (/[A-Z0-9]/.test(character)) return width + fontSize * 0.68;
    if (/\s/.test(character)) return width + fontSize * 0.32;
    return width + fontSize * 0.56;
  }, 0);
}

function fitTextToWidth(value: string, maximumWidth: number, fontSize: number): string {
  if (estimatedTextWidth(value, fontSize) <= maximumWidth) return value;
  const suffix = '…';
  let fitted = '';
  for (const character of value) {
    if (estimatedTextWidth(fitted + character + suffix, fontSize) > maximumWidth) break;
    fitted += character;
  }
  return fitted.trimEnd() + suffix;
}


function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Remove emoji characters that Ubuntu system fonts cannot render in SVG. */
function stripEmoji(value: string): string {
  return value
    .replace(/\p{Emoji_Presentation}/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
