import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTikTokSignals } from '../src/tiktok/checkLive.ts';

const ROOM_ID = '7668117425632283412';
const USERNAME = 'kusugashiroo';

function room(status: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status,
    id_str: ROOM_ID,
    owner: { display_id: USERNAME },
    title: 'Live fixture',
    ...overrides,
  };
}

test('stale composite false is overridden by authoritative active room', () => {
  const result = classifyTikTokSignals(USERNAME, false, ROOM_ID, room(2));
  assert.equal(result.status, 'live');
  assert.equal(result.roomId, ROOM_ID);
});

test('connector error is overridden by authoritative active room', () => {
  assert.equal(classifyTikTokSignals(USERNAME, null, ROOM_ID, room(2)).status, 'live');
});

test('ended matching room confirms offline when composite is not positive', () => {
  assert.equal(classifyTikTokSignals(USERNAME, false, ROOM_ID, room(4)).status, 'offline');
  assert.equal(classifyTikTokSignals(USERNAME, null, ROOM_ID, room(4)).status, 'offline');
});

test('positive composite conflicting with ended room remains an error', () => {
  const result = classifyTikTokSignals(USERNAME, true, ROOM_ID, room(4));
  assert.equal(result.status, 'error');
  assert.equal(result.errorCode, 'TIKTOK_STATUS_CONFLICT');
});

test('stale room ID without valid detail is inconclusive, never live or offline', () => {
  for (const detail of [null, {}, room(3)]) {
    const result = classifyTikTokSignals(USERNAME, false, ROOM_ID, detail);
    assert.equal(result.status, 'error');
    assert.equal(result.errorCode, 'TIKTOK_STATUS_INCONCLUSIVE');
  }
});

test('owner mismatch and room ID mismatch cannot trigger live', () => {
  const wrongOwner = classifyTikTokSignals(
    USERNAME,
    false,
    ROOM_ID,
    room(2, { owner: { display_id: 'someone_else' } })
  );
  const wrongRoom = classifyTikTokSignals(
    USERNAME,
    false,
    ROOM_ID,
    room(2, { id_str: '9999999999999999999' })
  );
  assert.equal(wrongOwner.status, 'error');
  assert.equal(wrongRoom.status, 'error');
});

test('unsafe numeric room IDs are rejected instead of rounded', () => {
  const result = classifyTikTokSignals(
    USERNAME,
    false,
    ROOM_ID,
    room(2, { id_str: undefined, room_id: Number(ROOM_ID) })
  );
  assert.equal(result.status, 'error');
});

test('one active valid endpoint wins over malformed endpoint response', () => {
  const result = classifyTikTokSignals(USERNAME, false, ROOM_ID, [
    { status: 2, id_str: ROOM_ID, owner: { display_id: 'wrong' } },
    room(2),
  ]);
  assert.equal(result.status, 'live');
});

test('validated active and ended room details conflict instead of positive-wins', () => {
  const result = classifyTikTokSignals(USERNAME, false, ROOM_ID, [room(2), room(4)]);
  assert.equal(result.status, 'error');
  assert.equal(result.errorCode, 'TIKTOK_STATUS_CONFLICT');
});
