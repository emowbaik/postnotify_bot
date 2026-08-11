const DISCORD_SNOWFLAKE = /^\d{17,20}$/u;
const DISCORD_MENTION = /^(?:@everyone|@here|<@!?\d{17,20}>|<@&\d{17,20}>)$/u;

export function assertChannelId(channelId: string): void {
  if (!DISCORD_SNOWFLAKE.test(channelId)) throw new Error('Invalid Discord channel ID.');
}

export function assertMention(mention: string | undefined): void {
  if (mention && !DISCORD_MENTION.test(mention)) {
    throw new Error('Invalid Discord mention.');
  }
}
