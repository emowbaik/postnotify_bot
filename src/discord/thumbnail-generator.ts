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

const MAX_REMOTE_IMAGE_SIZE =
  15 * 1024 * 1024;

const IMAGE_DOWNLOAD_TIMEOUT = 10_000;

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

  const finalImage = await sharp(background)
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
  return sharp(source)
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

  return sharp(source)
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
        font-family="Arial, DejaVu Sans, sans-serif" font-size="118" font-weight="700">${initial}</text>
      <text x="50%" y="${POSTER_HEIGHT - 70}" text-anchor="middle" fill="#ffffff" fill-opacity="0.80"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${platform}</text>
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

  return sharp(source)
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
        font-family="Arial, DejaVu Sans, sans-serif" font-size="44" font-weight="700">${initial}</text>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Overlay
// ─────────────────────────────────────────────────────────────────────────────

function createTextOverlay(info: LiveInfo): Buffer {
  const creatorName = displayCreatorName(info);
  const rawTitle = info.title?.trim() || `${creatorName} sedang melakukan siaran langsung`;
  const titleLines = wrapText(rawTitle, 27, 2);

  const firstTitleLine = escapeXml(titleLines[0] ?? '');
  const secondTitleLine = escapeXml(titleLines[1] ?? '');
  const viewers = escapeXml(formatViewerCount(info.viewerCount));
  const duration = escapeXml(formatLiveDuration(info.startedAt));
  const escapedCreatorName = escapeXml(creatorName);
  const platform = platformLabel(info);
  const creatorRole = escapeXml(platform === 'YouTube' ? 'YouTube Live Channel' : 'TikTok Live Creator');
  const accentColor = platformAccentColor(info);

  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- Avatar border -->
      <circle cx="116" cy="109" r="47" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="3"/>

      <!-- Username -->
      <text x="180" y="102" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="28" font-weight="700">${escapedCreatorName}</text>
      <text x="180" y="134" fill="#ffffff" fill-opacity="0.58"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="19" font-weight="500">${creatorRole}</text>

      <!-- Live badge -->
      <rect x="72" y="184" width="226" height="52" rx="26" fill="${accentColor}"/>
      <circle cx="102" cy="210" r="8" fill="#ffffff"/>
      <text x="124" y="218" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="700" letter-spacing="1">LIVE SEKARANG</text>

      <!-- Heading -->
      <text x="72" y="303" fill="#ffffff" fill-opacity="0.62"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="25" font-weight="600">Sedang menyiarkan</text>

      <!-- Title line 1 -->
      <text x="72" y="370" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="54" font-weight="800">${firstTitleLine}</text>

      ${secondTitleLine ? `
      <text x="72" y="435" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="54" font-weight="800">${secondTitleLine}</text>
      ` : ''}

      <!-- Divider -->
      <rect x="72" y="494" width="650" height="2" rx="1" fill="#ffffff" fill-opacity="0.13"/>

      <!-- Viewer statistics -->
      <text x="72" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">PENONTON</text>
      <text x="72" y="588" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${viewers}</text>

      <!-- Live duration -->
      <text x="320" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">DURASI LIVE</text>
      <text x="320" y="588" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${duration}</text>

      <!-- Platform -->
      <text x="570" y="548" fill="#ffffff" fill-opacity="0.50"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="17" font-weight="700" letter-spacing="1">PLATFORM</text>
      <text x="570" y="588" fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="30" font-weight="700">${platform}</text>

      <!-- Bottom CTA -->
      <circle cx="82" cy="654" r="6" fill="${accentColor}"/>
      <text x="102" y="661" fill="#ffffff" fill-opacity="0.65"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="20" font-weight="500">Tonton sekarang sebelum siaran berakhir</text>
    </svg>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote Image Downloader
// ─────────────────────────────────────────────────────────────────────────────

async function downloadImage(imageUrl?: string | null): Promise<Buffer | null> {
  if (!imageUrl || !isHttpUrl(imageUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PostNotifyBot/2.0', Accept: 'image/*' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_SIZE) {
      throw new Error('Remote image terlalu besar.');
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_IMAGE_SIZE) {
      throw new Error('Remote image melebihi batas ukuran.');
    }

    const buffer = Buffer.from(arrayBuffer);
    await sharp(buffer).metadata(); // validate image
    return buffer;
  } catch (error) {
    console.warn(
      `[Thumbnail] Gagal mengunduh ${imageUrl}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

function wrapText(input: string, maximumCharacters: number, maximumLines: number): string[] {
  const cleanInput = input.replace(/\s+/g, ' ').trim();
  if (!cleanInput) return ['Live Now'];

  const words = cleanInput.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maximumCharacters) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word.length > maximumCharacters ? truncate(word, maximumCharacters) : word;

    if (lines.length === maximumLines - 1) {
      const remainingWords = [currentLine, ...words.slice(index + 1)].join(' ');
      lines.push(truncate(remainingWords, maximumCharacters));
      return lines;
    }
  }

  if (currentLine && lines.length < maximumLines) lines.push(currentLine);
  return lines.slice(0, maximumLines);
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return value.slice(0, maximumLength - 1) + '…';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
