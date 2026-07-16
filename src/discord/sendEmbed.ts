/**
 * Discord notification sender.
 *
 * Sends a styled embed to a Discord channel via the Bot Token REST API.
 * Layout matches the user's requested design with profile pic, title,
 * inline viewers/start time, thumbnail image, and Watch Stream button.
 */

import type { LiveInfo } from '../types.js';

const DISCORD_API = 'https://discord.com/api/v10';

/** Bright red — matches the accent line in the user's reference */
const EMBED_COLOR = 0xff0000;

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

  // Content: mention + "🔴 username sedang LIVE!" (above embed)
  const content = mention
    ? `${mention} 🔴 **${liveInfo.username}** sedang LIVE!`
    : `🔴 **${liveInfo.username}** sedang LIVE!`;

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

// ─── Embed Builder ───────────────────────────────────────────────────────────

function buildEmbed(info: LiveInfo): DiscordEmbed {
  const embed: DiscordEmbed = {
    color: EMBED_COLOR,

    // Author: profile pic + @username
    author: {
      name: `@${info.username}`,
      url: `https://www.tiktok.com/@${info.username}`,
      ...(info.profilePicUrl && { icon_url: info.profilePicUrl }),
    },

    // Title: 🔴 + stream title (clickable link to live)
    title: `🔴 ${info.title || info.username}`,
    url: info.liveUrl,

    // Inline fields: Viewers + Mulai Live side by side
    fields: [
      {
        name: '👥 Viewers',
        value: info.viewerCount > 0 ? info.viewerCount.toLocaleString() : '—',
        inline: true,
      },
      {
        name: '🕐 Mulai Live',
        value: formatDiscordTimestamp(info.startedAt),
        inline: true,
      },
    ],

    // Footer
    footer: {
      text: 'TikTok Live Notifier • postnotify_bot',
    },
    timestamp: new Date().toISOString(),
  };

  // Large thumbnail image
  if (info.thumbnailUrl) {
    embed.image = { url: info.thumbnailUrl };
  }

  return embed;
}

function buildComponents(info: LiveInfo): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5, // LINK button
          label: 'Watch Stream',
          url: info.liveUrl,
          emoji: { name: '📺' },
        },
      ],
    },
  ];
}

/** Discord relative timestamp format: <t:UNIX:R> → "14 minutes ago" */
function formatDiscordTimestamp(isoString: string): string {
  try {
    const unix = Math.floor(new Date(isoString).getTime() / 1000);
    return `<t:${unix}:R>`;
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
