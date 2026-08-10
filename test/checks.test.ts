import assert from 'node:assert/strict';
import test from 'node:test';
import { settleLiveChecks, type LiveCheckRequest } from '../src/checks.ts';

const youtubeTarget = 'UCaaaaaaaaaaaaaaaaaaaaaa';

test('unexpected rejection keeps descriptor platform and target', async () => {
  const checks: LiveCheckRequest[] = [{
    platform: 'youtube',
    target: youtubeTarget,
    promise: Promise.reject(new Error('network failed')),
  }];

  const [result] = await settleLiveChecks(checks);

  assert.deepEqual(result, {
    status: 'error',
    isLive: false,
    platform: 'youtube',
    username: youtubeTarget,
    errorCode: 'YOUTUBE_UNEXPECTED_ERROR',
    message: 'Unexpected youtube check failure.',
  });
});

test('fulfilled detector result passes through unchanged', async () => {
  const expected = {
    status: 'offline' as const,
    isLive: false as const,
    platform: 'youtube' as const,
    username: youtubeTarget,
  };
  const checks: LiveCheckRequest[] = [{
    platform: 'youtube',
    target: youtubeTarget,
    promise: Promise.resolve(expected),
  }];

  const [result] = await settleLiveChecks(checks);

  assert.equal(result, expected);
});
