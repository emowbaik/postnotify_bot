/**
 * Environment variable configuration with validation.
 * All secrets are injected by GitHub Actions from repository secrets.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

function splitCsv(value?: string): string[] {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

export const env = {
  /** Discord Bot Token (Bot MTIz...) */
  discordBotToken: requireEnv('DISCORD_BOT_TOKEN'),

  /** Optional Discord channel ID for TikTok notifications. */
  tiktokDiscordChannelId: optionalEnv('TIKTOK_DISCORD_CHANNEL_ID'),

  /**
   * Comma-separated TikTok usernames (without @).
   * Empty or absent disables TikTok monitoring.
   */
  tiktokUsernames: splitCsv(optionalEnv('TIKTOK_USERNAMES'))
    .map((username) => username.replace(/^@/, '')),

  /**
   * Optional: Discord role/user mention prepended to TikTok notifications.
   * Example: "<@&123456789>" or "@everyone"
   */
  tiktokDiscordMention: optionalEnv('TIKTOK_DISCORD_MENTION'),

  /**
   * Comma-separated list of YouTube channel IDs (`UC...`) to monitor.
   * Empty or absent disables YouTube monitoring.
   */
  youtubeChannelIds: splitCsv(optionalEnv('YOUTUBE_CHANNEL_IDS')),

  /** Discord channel used only for YouTube live notifications. */
  youtubeDiscordChannelId: optionalEnv('YOUTUBE_DISCORD_CHANNEL_ID'),

  /** Optional role/user/everyone mention for YouTube notifications. */
  youtubeDiscordMention: optionalEnv('YOUTUBE_DISCORD_MENTION'),

  /**
   * GitHub PAT used to self-trigger the workflow loop.
   * Required scope: repo
   */
  loopToken: optionalEnv('LOOP_TOKEN'),

  /**
   * GitHub repository in the format "owner/repo".
   * Automatically injected by GitHub Actions as GITHUB_REPOSITORY.
   */
  githubRepository: optionalEnv('GITHUB_REPOSITORY'),
} as const;
