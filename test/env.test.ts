import assert from 'node:assert/strict';
import test from 'node:test';
import { readEnv } from '../src/config/readEnv.ts';

const DISCORD_ID = '123456789012345678';
const YOUTUBE_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa';

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DISCORD_BOT_TOKEN: 'opaque-test-token',
    ...overrides,
  };
}

test('valid dual-platform configuration is normalized and deduplicated', () => {
  const parsed = readEnv(baseEnv({
    TIKTOK_USERNAMES: ' @creator.one, creator_two,creator.one ',
    TIKTOK_DISCORD_CHANNEL_ID: ` ${DISCORD_ID} `,
    TIKTOK_DISCORD_MENTION: `<@&${DISCORD_ID}>`,
    YOUTUBE_CHANNEL_IDS: ` ${YOUTUBE_ID},${YOUTUBE_ID} `,
    YOUTUBE_DISCORD_CHANNEL_ID: DISCORD_ID,
    YOUTUBE_DISCORD_MENTION: '@here',
    ADMIN_DISCORD_CHANNEL_ID: DISCORD_ID,
    ADMIN_DISCORD_MENTION: `<@!${DISCORD_ID}>`,
  }));

  assert.deepEqual(parsed.tiktokUsernames, ['creator.one', 'creator_two']);
  assert.deepEqual(parsed.youtubeChannelIds, [YOUTUBE_ID]);
  assert.equal(parsed.tiktokDiscordChannelId, DISCORD_ID);
  assert.equal(parsed.tiktokDiscordMention, `<@&${DISCORD_ID}>`);
  assert.equal(parsed.youtubeDiscordMention, '@here');
  assert.equal(parsed.adminDiscordMention, `<@!${DISCORD_ID}>`);
});

test('token remains opaque while non-token controls are rejected', () => {
  const token = 'line-one\nline-two';
  assert.equal(readEnv(baseEnv({ DISCORD_BOT_TOKEN: token })).discordBotToken, token);
  assert.throws(
    () => readEnv(baseEnv({ TIKTOK_USERNAMES: 'creator\n::warning::forged' })),
    /^Error: Invalid environment variable: TIKTOK_USERNAMES$/u
  );
});

test('invalid values fail without echoing supplied secret text', () => {
  const cases: Array<[string, string]> = [
    ['TIKTOK_USERNAMES', 'bad/name'],
    ['TIKTOK_DISCORD_CHANNEL_ID', 'not-a-snowflake'],
    ['TIKTOK_DISCORD_MENTION', `<@&${DISCORD_ID}> @everyone`],
    ['YOUTUBE_CHANNEL_IDS', 'not-a-youtube-channel'],
    ['YOUTUBE_DISCORD_CHANNEL_ID', '123'],
    ['ADMIN_DISCORD_MENTION', 'x'.repeat(2_001)],
  ];

  for (const [key, value] of cases) {
    assert.throws(
      () => readEnv(baseEnv({ [key]: value })),
      (error: unknown) => error instanceof Error
        && error.message === `Invalid environment variable: ${key}`
        && !error.message.includes(value)
    );
  }
});

test('platform target lists allow at most ten unique values', () => {
  const usernames = Array.from({ length: 11 }, (_, index) => `creator${index}`).join(',');
  const channels = Array.from({ length: 11 }, (_, index) => `UC${String(index).padStart(20, 'a')}`).join(',');

  assert.throws(
    () => readEnv(baseEnv({ TIKTOK_USERNAMES: usernames })),
    /^Error: Invalid environment variable: TIKTOK_USERNAMES$/u
  );
  assert.throws(
    () => readEnv(baseEnv({ YOUTUBE_CHANNEL_IDS: channels })),
    /^Error: Invalid environment variable: YOUTUBE_CHANNEL_IDS$/u
  );
});

test('missing token error names variable only', () => {
  assert.throws(
    () => readEnv({}),
    /^Error: Missing required environment variable: DISCORD_BOT_TOKEN$/u
  );
});
