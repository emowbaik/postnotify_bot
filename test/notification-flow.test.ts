import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotState, LiveInfo } from '../src/types.ts';
import { deliverLiveSession } from '../src/liveDelivery.ts';
import { getDeliveryError, setDeliveryError } from '../src/state.ts';

const info: LiveInfo = {
  status: 'live',
  isLive: true,
  platform: 'tiktok',
  username: 'kusugashiroo',
  displayName: 'kusugashiroo',
  roomId: 'new-room',
  title: 'Live',
  viewerCount: 1,
  thumbnailUrl: null,
  profilePicUrl: null,
  liveUrl: 'https://www.tiktok.com/@kusugashiroo/live',
  profileUrl: 'https://www.tiktok.com/@kusugashiroo',
  startedAt: '2026-08-12T00:00:00.000Z',
};

function state(): BotState {
  return {
    activeLiveSessions: [],
    youtubeActiveVideos: {},
    platformErrors: {},
    detectorDiagnostics: {},
    deliveryErrors: {},
  };
}

test('live succeeds before recovery and marks session', async () => {
  const value = state();
  const calls: string[] = [];
  await deliverLiveSession(value, info, {
    sendLive: async () => { calls.push('live'); },
    sendRecovery: async () => { calls.push('recovery'); },
    now: () => '2026-08-12T00:00:00.000Z',
  });
  assert.deepEqual(calls, ['live', 'recovery']);
  assert.deepEqual(value.activeLiveSessions, ['tiktok:kusugashiroo:new-room']);
});

test('recovery failure cannot turn successful live delivery into retry', async () => {
  const value = state();
  const outcome = await deliverLiveSession(value, info, {
    sendLive: async () => undefined,
    sendRecovery: async () => { throw new Error('admin unavailable'); },
  });

  assert.equal(outcome.status, 'sent');
  assert.deepEqual(value.activeLiveSessions, ['tiktok:kusugashiroo:new-room']);
  assert.deepEqual(value.deliveryErrors, {});
});

test('successor consumes notified session without duplicate live embed', async () => {
  const value = state();
  value.activeLiveSessions.push('tiktok:kusugashiroo:new-room');
  let liveCalls = 0;
  const outcome = await deliverLiveSession(value, info, {
    sendLive: async () => { liveCalls++; },
    sendRecovery: async () => { throw new Error('admin unavailable'); },
  });

  assert.equal(outcome.status, 'already-notified');
  assert.equal(liveCalls, 0);
  assert.deepEqual(value.activeLiveSessions, ['tiktok:kusugashiroo:new-room']);
});

test('failed live persists retry evidence and does not send recovery or mark session', async () => {
  const value = state();
  let recoveryCalls = 0;
  const error = Object.assign(new Error('secret raw error'), {
    stage: 'discord' as const,
    errorCode: 'LIVE_DISCORD_HTTP_403',
  });
  await deliverLiveSession(value, info, {
    sendLive: async () => { throw error; },
    sendRecovery: async () => { recoveryCalls++; },
    now: () => '2026-08-12T00:00:00.000Z',
  });
  assert.deepEqual(value.activeLiveSessions, []);
  assert.equal(recoveryCalls, 0);
  assert.deepEqual(value.deliveryErrors['tiktok:kusugashiroo:new-room'], {
    platform: 'tiktok',
    target: 'kusugashiroo',
    sessionKey: 'tiktok:kusugashiroo:new-room',
    stage: 'discord',
    errorCode: 'LIVE_DISCORD_HTTP_403',
    firstSeenAt: '2026-08-12T00:00:00.000Z',
    lastSeenAt: '2026-08-12T00:00:00.000Z',
    attemptCount: 1,
  });
  assert.equal(JSON.stringify(value).includes('secret raw error'), false);
});

test('successful retry clears delivery error and marks session once', async () => {
  const value = state();
  setDeliveryError(value, {
    platform: 'tiktok',
    target: 'kusugashiroo',
    sessionKey: 'tiktok:kusugashiroo:new-room',
    stage: 'discord',
    errorCode: 'LIVE_DISCORD_REQUEST_ERROR',
    firstSeenAt: '2026-08-12T00:00:00.000Z',
    lastSeenAt: '2026-08-12T00:05:00.000Z',
    attemptCount: 2,
  });
  await deliverLiveSession(value, info, {
    sendLive: async () => undefined,
    sendRecovery: async () => undefined,
    now: () => '2026-08-12T00:10:00.000Z',
  });
  assert.equal(getDeliveryError(value, 'tiktok:kusugashiroo:new-room'), undefined);
  assert.deepEqual(value.activeLiveSessions, ['tiktok:kusugashiroo:new-room']);
});