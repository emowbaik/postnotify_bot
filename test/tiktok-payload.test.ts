import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTikTokRoomData } from '../src/tiktok/checkLive.ts';

test('malformed TikTok fields fall back to safe LiveInfo values', () => {
  const before = Date.now();
  const room = normalizeTikTokRoomData({
    title: 123,
    user_count: 'not-a-number',
    cover: { url_list: [false, 'javascript:alert(1)'] },
    owner: { avatar_thumb: { url_list: 'not-an-array' } },
    create_time: Number.POSITIVE_INFINITY,
  }, 'creator');
  const after = Date.now();

  assert.equal(room.title, 'creator');
  assert.equal(room.viewerCount, 0);
  assert.equal(room.thumbnailUrl, null);
  assert.equal(room.profilePicUrl, null);
  assert.ok(Date.parse(room.startedAt) >= before);
  assert.ok(Date.parse(room.startedAt) <= after);
});

test('valid TikTok fields are normalized at API boundary', () => {
  const room = normalizeTikTokRoomData({
    title: '  Ranked stream  ',
    user_count_str: '42.9',
    cover: { url_list: [null, 'https://cdn.example/cover.jpg'] },
    owner: { avatar_thumb: { url_list: ['http://cdn.example/avatar.jpg'] } },
    start_time: 1_700_000_000,
  }, 'creator');

  assert.deepEqual(room, {
    title: 'Ranked stream',
    viewerCount: 42,
    thumbnailUrl: 'https://cdn.example/cover.jpg',
    profilePicUrl: 'http://cdn.example/avatar.jpg',
    startedAt: '2023-11-14T22:13:20.000Z',
  });
});

test('non-object TikTok payload remains safe', () => {
  const room = normalizeTikTokRoomData(null, 'creator');

  assert.equal(room.title, 'creator');
  assert.equal(room.viewerCount, 0);
  assert.equal(room.thumbnailUrl, null);
  assert.equal(room.profilePicUrl, null);
  assert.ok(Number.isFinite(Date.parse(room.startedAt)));
});
