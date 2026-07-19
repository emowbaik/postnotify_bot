/**
 * Discord TikTok Live Notification Sender
 *
 * Fitur:
 * - Mengirim notifikasi menggunakan Discord Bot REST API
 * - Mengunggah preview landscape 1280×720
 * - Tidak menggunakan embed.thumbnail agar embed tidak menyempit
 * - Statistik ditampilkan vertikal agar stabil di desktop dan mobile
 * - Mendukung role mention, user mention, @everyone, dan @here
 */

import type { LiveInfo } from '../types.js';
import { generateLivePreview } from './thumbnail-generator.js';

const DISCORD_API = 'https://discord.com/api/v10';

/** Warna aksen TikTok: #FE2C55 */
const EMBED_COLOR = 0xfe2c55;

/**
 * Mengirim notifikasi live ke channel Discord.
 */
export async function sendLiveNotification(
  botToken: string,
  channelId: string,
  liveInfo: LiveInfo,
  mention?: string
): Promise<void> {
  validateNotificationInput(botToken, channelId, liveInfo);

  const previewBuffer = await generateLivePreview(liveInfo);

  const payload: DiscordMessagePayload = {
    content: buildContent(liveInfo, mention),
    allowed_mentions: buildAllowedMentions(mention),
    embeds: [buildEmbed(liveInfo)],
    components: buildComponents(liveInfo),
    attachments: [
      {
        id: 0,
        filename: 'live-preview.jpg',
        description: `Preview live TikTok @${normalizeUsername(liveInfo.username)}`,
      },
    ],
  };

  const formData = new FormData();
  formData.append('payload_json', JSON.stringify(payload));
  formData.append(
    'files[0]',
    new Blob([new Uint8Array(previewBuffer)], { type: 'image/jpeg' }),
    'live-preview.jpg'
  );

  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'PostNotifyBot/2.0',
    },
    body: formData,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Discord API error ${response.status}: ${responseBody}`);
  }

  console.log(`[Discord] ✅ Notification sent for @${normalizeUsername(liveInfo.username)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Content
// ─────────────────────────────────────────────────────────────────────────────

function buildContent(info: LiveInfo, mention?: string): string {
  const username = normalizeUsername(info.username);
  const mentionPrefix = mention?.trim() ? `${mention.trim()} ` : '';
  return `${mentionPrefix}🔴 **@${username} sedang LIVE di TikTok!**`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildEmbed(info: LiveInfo): DiscordEmbed {
  const username = normalizeUsername(info.username);
  const profileUrl = buildTikTokProfileUrl(username);
  const streamTitle = info.title?.trim() || `${username} sedang melakukan siaran langsung`;

  return {
    color: EMBED_COLOR,
    author: {
      name: `TikTok LIVE • @${username}`,
      url: profileUrl,
      ...(isHttpUrl(info.profilePicUrl) && { icon_url: info.profilePicUrl }),
    },
    title: truncate(streamTitle, 256),
    url: info.liveUrl,
    description: [
      '🔴 **LIVE SEKARANG**',
      '',
      `**@${username}** sedang melakukan siaran langsung.`,
      'Masuk sekarang sebelum live berakhir.',
      '',
      `👁️ **Penonton:** ${formatViewerCount(info.viewerCount)}`,
      `⏱️ **Dimulai:** ${formatDiscordTimestamp(info.startedAt)}`,
      '📱 **Platform:** TikTok Live',
    ].join('\n'),
    image: { url: 'attachment://live-preview.jpg' },
    footer: { text: 'PostNotify • TikTok Live Alert' },
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────────────

function buildComponents(info: LiveInfo): DiscordActionRow[] {
  const username = normalizeUsername(info.username);

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: 'Tonton Live',
          url: info.liveUrl,
          emoji: { name: '📺' },
        },
        {
          type: 2,
          style: 5,
          label: 'Lihat Profil',
          url: buildTikTokProfileUrl(username),
          emoji: { name: '👤' },
        },
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowed Mentions
// ─────────────────────────────────────────────────────────────────────────────

function buildAllowedMentions(mention?: string): DiscordAllowedMentions {
  if (!mention?.trim()) {
    return { parse: [], roles: [], users: [], replied_user: false };
  }

  const roleIds = Array.from(mention.matchAll(/<@&(\d+)>/g), (m) => m[1]!);
  const userIds = Array.from(mention.matchAll(/<@!?(\d+)>/g), (m) => m[1]!);
  const containsEveryone = mention.includes('@everyone') || mention.includes('@here');

  return {
    parse: containsEveryone ? ['everyone'] : [],
    roles: roleIds,
    users: userIds,
    replied_user: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '');
}

function buildTikTokProfileUrl(username: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
}

function formatViewerCount(viewerCount: number): string {
  if (!Number.isFinite(viewerCount) || viewerCount < 0) return 'Tidak diketahui';
  return new Intl.NumberFormat('id-ID').format(Math.floor(viewerCount));
}

function formatDiscordTimestamp(startedAt: string): string {
  const milliseconds = Date.parse(startedAt);
  if (!Number.isFinite(milliseconds)) return 'Tidak diketahui';
  const unixTimestamp = Math.floor(milliseconds / 1000);
  return `<t:${unixTimestamp}:R>`;
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return value.slice(0, maximumLength - 1) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateNotificationInput(botToken: string, channelId: string, info: LiveInfo): void {
  if (!botToken?.trim()) throw new Error('Discord bot token tidak boleh kosong.');
  if (!channelId?.trim()) throw new Error('Discord channel ID tidak boleh kosong.');
  if (!info.username?.trim()) throw new Error('LiveInfo.username tidak boleh kosong.');
  if (!isHttpUrl(info.liveUrl)) throw new Error('LiveInfo.liveUrl bukan URL HTTP/HTTPS yang valid.');
}

function isHttpUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discord API Types
// ─────────────────────────────────────────────────────────────────────────────

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  attachments?: DiscordAttachment[];
  allowed_mentions?: DiscordAllowedMentions;
}

interface DiscordAllowedMentions {
  parse?: Array<'everyone' | 'roles' | 'users'>;
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
}

interface DiscordAttachment {
  id: number;
  filename: string;
  description?: string;
}

interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string; url?: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: DiscordEmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordActionRow {
  type: 1;
  components: DiscordButton[];
}

interface DiscordButton {
  type: 2;
  style: 5;
  label: string;
  url: string;
  emoji?: { name: string };
}
