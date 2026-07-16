/**
 * Discord notification sender.
 *
 * Sends a NotifyMe-style embed to a Discord channel via the Bot Token REST API.
 * Layout: mention + live URL in content, embed with streamer author, stream title,
 * viewer count, thumbnail image, and a "Watch Stream" button.
 */

import type { LiveInfo } from '../types.js';

const DISCORD_API = 'https://discord.com/api/v10';

/** Red accent (left border) — matches TikTok brand */
const EMBED_COLOR = 0xe74c3c;

/**
 * Send a "streamer is live" notification to a Discord channel.
 */
export async function sendLiveNotification(
  botToken: string,
  channelId: string,
  liveInfo: LiveInfo,
  mention?: string
): Promise<void> {
  const embed = buildEmbed(liveInfo);
  const components = buildComponents(liveInfo);

  // Content: mention + live URL (visible link like NotifyMe)
  const lines: string[] = [];
  if (mention) lines.push(mention);
  lines.push(liveInfo.liveUrl);
  const content = lines.join('\n');

  const payload: DiscordMessagePayload = {
    content,
    embeds: [embed],
    components,
  };

  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PostNotifyBot/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API error ${response.status}: ${body}`);
  }

  console.log(`[Discord] ✅ Notification sent for @${liveInfo.username}`);
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function buildEmbed(info: LiveInfo): DiscordEmbed {
  const embed: DiscordEmbed = {
    color: EMBED_COLOR,
    author: {
      name: info.username,
      url: `https://www.tiktok.com/@${info.username}`,
    },
    title: info.title || info.username,
    url: info.liveUrl,
    fields: [
      {
        name: 'Viewers',
        value: info.viewerCount > 0 ? info.viewerCount.toLocaleString() : '—',
        inline: false,
      },
    ],
    footer: {
      text: `postnotify_bot • ${formatTime(info.startedAt)}`,
    },
  };

  if (info.thumbnailUrl) {
    embed.image = { url: info.thumbnailUrl };
  }

  return embed;
}

function buildComponents(info: LiveInfo): DiscordActionRow[] {
  return [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2,    // BUTTON
          style: 5,   // LINK
          label: 'Watch Stream',
          url: info.liveUrl,
          emoji: { name: '📺' },
        },
      ],
    },
  ];
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return isoString;
  }
}

// ─── Discord API types ────────────────────────────────────────────────────────

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];
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
  style: number;
  label: string;
  url?: string;
  emoji?: { name: string };
}
