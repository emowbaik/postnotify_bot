/**
 * Discord notification sender.
 *
 * Sends a rich embed to a Discord channel via the Bot Token REST API.
 * The embed includes streamer info, live title, thumbnail, viewer count,
 * start time, and a direct link to the TikTok live stream.
 */

import type { LiveInfo } from '../types.js';

const DISCORD_API = 'https://discord.com/api/v10';

/** TikTok brand red */
const EMBED_COLOR = 0xff0050;

/**
 * Send a "streamer is live" embed notification to a Discord channel.
 * @param botToken - Discord Bot Token (the full "Bot MTIz..." string)
 * @param channelId - Target channel ID
 * @param liveInfo  - Live stream information from TikTok
 * @param mention   - Optional mention string (e.g. "@everyone" or "<@&ROLE_ID>")
 */
export async function sendLiveNotification(
  botToken: string,
  channelId: string,
  liveInfo: LiveInfo,
  mention?: string
): Promise<void> {
  const embed = buildEmbed(liveInfo);
  const content = mention ? `${mention} 🔴 **${liveInfo.username}** sedang LIVE!` : undefined;

  const payload: DiscordMessagePayload = {
    ...(content !== undefined && { content }),
    embeds: [embed],
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
    throw new Error(
      `Discord API error ${response.status}: ${body}`
    );
  }

  console.log(`[Discord] ✅ Notification sent for @${liveInfo.username}`);
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function buildEmbed(info: LiveInfo): DiscordEmbed {
  const fields: DiscordEmbedField[] = [
    {
      name: '📺 Judul',
      value: info.title || '—',
      inline: false,
    },
    {
      name: '👥 Viewers',
      value: info.viewerCount > 0 ? info.viewerCount.toLocaleString() : 'Tidak diketahui',
      inline: true,
    },
    {
      name: '🕐 Mulai Live',
      value: formatTimestamp(info.startedAt),
      inline: true,
    },
  ];

  const embed: DiscordEmbed = {
    title: `🔴 ${info.username} sedang LIVE di TikTok!`,
    url: info.liveUrl,
    color: EMBED_COLOR,
    fields,
    footer: {
      text: 'TikTok Live Notifier • postnotify_bot',
    },
    timestamp: new Date().toISOString(),
  };

  if (info.thumbnailUrl) {
    embed.image = { url: info.thumbnailUrl };
  }

  embed.author = {
    name: `@${info.username}`,
    url: `https://www.tiktok.com/@${info.username}`,
    icon_url: 'https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/favicon.ico',
  };

  return embed;
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    // Discord timestamp format: <t:UNIX:R> = relative time
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:R>`;
  } catch {
    return isoString;
  }
}

// ─── Discord API types ────────────────────────────────────────────────────────

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
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
