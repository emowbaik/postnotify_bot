/**
 * Environment variable configuration with validation.
 * All secrets are injected by GitHub Actions from repository secrets.
 */

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const DISCORD_SNOWFLAKE = /^\d{17,20}$/u;
const DISCORD_MENTION = /^(?:@everyone|@here|<@!?\d{17,20}>|<@&\d{17,20}>)$/u;
const TIKTOK_USERNAME = /^[A-Za-z0-9._]{2,24}$/u;
const YOUTUBE_CHANNEL_ID = /^UC[\w-]{20,}$/u;
const MAX_CONFIG_VALUE_LENGTH = 2_000;
const MAX_PLATFORM_TARGETS = 10;

type EnvSource = Readonly<Record<string, string | undefined>>;

function requiredOpaqueValue(source: EnvSource, key: string): string {
  const value = source[key];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function readValue(source: EnvSource, key: string): string | undefined {
  const value = source[key];
  if (!value) return undefined;
  if (value.length > MAX_CONFIG_VALUE_LENGTH || CONTROL_CHARACTERS.test(value)) {
    throw new Error(`Invalid environment variable: ${key}`);
  }
  return value;
}

function parseCsv(
  source: EnvSource,
  key: string,
  normalize: (value: string) => string,
  isValid: (value: string) => boolean
): string[] {
  const raw = readValue(source, key);
  if (!raw) return [];

  const values = [...new Set(raw.split(',').map((item) => normalize(item.trim())).filter(Boolean))];
  if (values.length > MAX_PLATFORM_TARGETS || values.some((value) => !isValid(value))) {
    throw new Error(`Invalid environment variable: ${key}`);
  }
  return values;
}

function discordSnowflake(source: EnvSource, key: string): string | undefined {
  const value = readValue(source, key)?.trim();
  if (value && !DISCORD_SNOWFLAKE.test(value)) {
    throw new Error(`Invalid environment variable: ${key}`);
  }
  return value;
}

function discordMention(source: EnvSource, key: string): string | undefined {
  const value = readValue(source, key)?.trim();
  if (value && !DISCORD_MENTION.test(value)) {
    throw new Error(`Invalid environment variable: ${key}`);
  }
  return value;
}

export function readEnv(source: EnvSource) {
  return {
    /** Discord Bot Token (Bot MTIz...) */
    discordBotToken: requiredOpaqueValue(source, 'DISCORD_BOT_TOKEN'),

    /** Optional Discord channel ID for TikTok notifications. */
    tiktokDiscordChannelId: discordSnowflake(source, 'TIKTOK_DISCORD_CHANNEL_ID'),

    /** Comma-separated TikTok usernames (without @). */
    tiktokUsernames: parseCsv(
      source,
      'TIKTOK_USERNAMES',
      (username) => username.replace(/^@/u, ''),
      (username) => TIKTOK_USERNAME.test(username)
    ),

    /** Optional single role/user/everyone mention for TikTok notifications. */
    tiktokDiscordMention: discordMention(source, 'TIKTOK_DISCORD_MENTION'),

    /** Comma-separated immutable YouTube channel IDs. */
    youtubeChannelIds: parseCsv(
      source,
      'YOUTUBE_CHANNEL_IDS',
      (channelId) => channelId,
      (channelId) => YOUTUBE_CHANNEL_ID.test(channelId)
    ),

    /** Official YouTube Data API v3 key. */
    youtubeApiKey: readValue(source, 'YOUTUBE_API_KEY'),

    /** Discord channel used only for YouTube live notifications. */
    youtubeDiscordChannelId: discordSnowflake(source, 'YOUTUBE_DISCORD_CHANNEL_ID'),

    /** Optional single role/user/everyone mention for YouTube notifications. */
    youtubeDiscordMention: discordMention(source, 'YOUTUBE_DISCORD_MENTION'),

    /** Required operational alert channel when either platform is active. */
    adminDiscordChannelId: discordSnowflake(source, 'ADMIN_DISCORD_CHANNEL_ID'),

    /** Optional single role/user/everyone mention for operational alerts. */
    adminDiscordMention: discordMention(source, 'ADMIN_DISCORD_MENTION'),
  } as const;
}
