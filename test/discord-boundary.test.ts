import assert from 'node:assert/strict';
import test from 'node:test';
import { assertChannelId, assertMention } from '../src/discord/validation.ts';

const ID = '123456789012345678';

test('Discord boundary accepts one valid channel and mention', () => {
  assert.doesNotThrow(() => assertChannelId(ID));
  for (const mention of [undefined, '@everyone', '@here', `<@${ID}>`, `<@!${ID}>`, `<@&${ID}>`]) {
    assert.doesNotThrow(() => assertMention(mention));
  }
});

test('Discord boundary rejects malformed routes and oversized or multiple mentions', () => {
  for (const channelId of ['', '123', `1/${ID}`, `${ID}\n`]) {
    assert.throws(() => assertChannelId(channelId), /^Error: Invalid Discord channel ID\.$/u);
  }
  for (const mention of [`<@&${ID}> @everyone`, '@everyone\n::warning::x', 'x'.repeat(2_001)]) {
    assert.throws(() => assertMention(mention), /^Error: Invalid Discord mention\.$/u);
  }
});
