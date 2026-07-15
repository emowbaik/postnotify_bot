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

export const env = {
  /** Discord Bot Token (Bot MTIz...) */
  discordBotToken: requireEnv('DISCORD_BOT_TOKEN'),

  /** Discord channel ID where notifications are sent */
  discordChannelId: requireEnv('DISCORD_CHANNEL_ID'),

  /**
   * Comma-separated list of TikTok usernames to monitor (without @).
   * Example: "streamer1,streamer2,streamer3"
   */
  tiktokUsernames: requireEnv('TIKTOK_USERNAMES')
    .split(',')
    .map((u) => u.trim().replace(/^@/, ''))
    .filter(Boolean),

  /**
   * Optional: Discord role/user mention prepended to the notification.
   * Example: "<@&123456789>" or "@everyone"
   */
  discordMention: optionalEnv('DISCORD_MENTION'),

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
