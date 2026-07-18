/**
 * Discord TikTok Live Notification
 *
 * Struktur desain:
 * - Content hanya untuk mention
 * - Author sebagai identitas streamer
 * - Judul sebagai judul live
 * - Status live pada description
 * - Statistik dalam tiga field
 * - Foto profil sebagai thumbnail
 * - Preview live sebagai image
 * - Dua tombol: tonton live dan buka profil
 */

import type { LiveInfo } from '../types.js';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Warna resmi yang menyerupai aksen TikTok.
 * Decimal dari hexadecimal #FE2C55.
 */
const EMBED_COLOR = 0xfe2c55;

export async function sendLiveNotification(
  botToken: string,
  channelId: string,
  liveInfo: LiveInfo,
  mention?: string
): Promise<void> {
  validateLiveInfo(liveInfo);

  const payload: DiscordMessagePayload = {
    content: buildContent(liveInfo, mention),
    allowed_mentions: buildAllowedMentions(mention),
    embeds: [buildEmbed(liveInfo)],
    components: buildComponents(liveInfo),
  };

  const response = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PostNotifyBot/2.0',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      `Discord API error ${response.status}: ${responseBody}`
    );
  }

  console.log(
    `[Discord] Live notification sent for @${normalizeUsername(
      liveInfo.username
    )}`
  );
}

// ─── Message Content ─────────────────────────────────────────────────────────

function buildContent(info: LiveInfo, mention?: string): string {
  const username = normalizeUsername(info.username);
  const mentionPrefix = mention?.trim() ? `${mention.trim()} ` : '';

  return `${mentionPrefix}🔴 **@${username} sedang LIVE di TikTok!**`;
}

// ─── Embed ───────────────────────────────────────────────────────────────────

function buildEmbed(info: LiveInfo): DiscordEmbed {
  const username = normalizeUsername(info.username);
  const profileUrl = buildTikTokProfileUrl(username);

  const streamTitle =
    info.title?.trim() || `${username} sedang melakukan siaran langsung`;

  const embed: DiscordEmbed = {
    color: EMBED_COLOR,

    author: {
      name: `TikTok LIVE • @${username}`,
      url: profileUrl,
      ...(info.profilePicUrl
        ? { icon_url: info.profilePicUrl }
        : {}),
    },

    title: truncate(streamTitle, 256),
    url: info.liveUrl,

    description: [
      '### 🔴 LIVE SEKARANG',
      '',
      `**@${username}** sedang melakukan siaran langsung.`,
      'Masuk sekarang sebelum live berakhir.',
    ].join('\n'),

    fields: [
      {
        name: '👁️ PENONTON',
        value: `**${formatViewerCount(info.viewerCount)}**`,
        inline: true,
      },
      {
        name: '⏱️ DIMULAI',
        value: formatDiscordTimestamp(info.startedAt),
        inline: true,
      },
      {
        name: '📱 PLATFORM',
        value: '**TikTok Live**',
        inline: true,
      },
    ],

    footer: {
      text: 'PostNotify • TikTok Live Alert',
      ...(info.profilePicUrl
        ? { icon_url: info.profilePicUrl }
        : {}),
    },

    timestamp: new Date().toISOString(),
  };

  /*
   * Foto profil ditempatkan di kanan atas agar identitas streamer
   * langsung terlihat tanpa mengambil banyak ruang.
   */
  if (info.profilePicUrl) {
    embed.thumbnail = {
      url: info.profilePicUrl,
    };
  }

  /*
   * Preview live ditempatkan sebagai gambar utama.
   * Hasil terbaik menggunakan gambar landscape 16:9.
   */
  if (info.thumbnailUrl) {
    embed.image = {
      url: info.thumbnailUrl,
    };
  }

  return embed;
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function buildComponents(info: LiveInfo): DiscordActionRow[] {
  const username = normalizeUsername(info.username);
  const profileUrl = buildTikTokProfileUrl(username);

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: 'Tonton Live',
          url: info.liveUrl,
          emoji: {
            name: '📺',
          },
        },
        {
          type: 2,
          style: 5,
          label: 'Lihat Profil',
          url: profileUrl,
          emoji: {
            name: '👤',
          },
        },
      ],
    },
  ];
}

// ─── Allowed Mentions ────────────────────────────────────────────────────────

function buildAllowedMentions(
  mention?: string
): DiscordAllowedMentions {
  if (!mention) {
    return {
      parse: [],
      roles: [],
      users: [],
    };
  }

  const roleIds = Array.from(
    mention.matchAll(/<@&(\d+)>/g),
    (match) => match[1]
  );

  const userIds = Array.from(
    mention.matchAll(/<@!?(\d+)>/g),
    (match) => match[1]
  );

  const containsEveryone =
    mention.includes('@everyone') || mention.includes('@here');

  return {
    parse: containsEveryone ? ['everyone'] : [],
    roles: roleIds,
    users: userIds,
  };
}

// ─── Formatting Utilities ────────────────────────────────────────────────────

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '');
}

function buildTikTokProfileUrl(username: string): string {
  return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
}

function formatViewerCount(viewerCount: number): string {
  if (!Number.isFinite(viewerCount) || viewerCount < 0) {
    return 'Tidak diketahui';
  }

  return new Intl.NumberFormat('id-ID').format(
    Math.floor(viewerCount)
  );
}

/**
 * Menghasilkan timestamp relatif Discord.
 *
 * Contoh:
 * <t:1750000000:R> → "8 menit yang lalu"
 */
function formatDiscordTimestamp(isoString: string): string {
  const milliseconds = Date.parse(isoString);

  if (!Number.isFinite(milliseconds)) {
    return 'Tidak diketahui';
  }

  const unixTimestamp = Math.floor(milliseconds / 1000);

  return `<t:${unixTimestamp}:R>`;
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value;
  }

  return `${value.slice(0, maximumLength - 1)}…`;
}

function validateLiveInfo(info: LiveInfo): void {
  if (!info.username?.trim()) {
    throw new Error('LiveInfo.username tidak boleh kosong.');
  }

  if (!isValidHttpUrl(info.liveUrl)) {
    throw new Error('LiveInfo.liveUrl bukan URL HTTP/HTTPS yang valid.');
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Discord Types ───────────────────────────────────────────────────────────

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
  allowed_mentions?: DiscordAllowedMentions;
}

interface DiscordAllowedMentions {
  parse?: Array<'everyone' | 'roles' | 'users'>;
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
}

interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;

  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };

  thumbnail?: {
    url: string;
  };

  image?: {
    url: string;
  };

  fields?: DiscordEmbedField[];

  footer?: {
    text: string;
    icon_url?: string;
  };

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

  emoji?: {
    name: string;
  };
}
