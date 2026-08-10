import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { generateLivePreview } from '../src/discord/thumbnail-generator.ts';
import type { LiveInfo } from '../src/types.ts';

const previewInfo: LiveInfo = {
  status: 'live',
  isLive: true,
  platform: 'youtube',
  username: 'UCaaaaaaaaaaaaaaaaaaaaaa',
  displayName: 'Multilingual 超長い配信者频道 이름 Канал ' + 'W'.repeat(80),
  roomId: 'abcdefghijk',
  title: 'WIN ONLY PRED RANK W/ ANYA & PACHI プレマス！やる！ 中文 한국어 Русский 🎮🔥 ' + 'W'.repeat(100),
  viewerCount: 12345,
  thumbnailUrl: null,
  profilePicUrl: null,
  liveUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  profileUrl: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',
  startedAt: new Date(Date.now() - 65 * 60_000).toISOString(),
};

test('multilingual long title renders bounded 1280x720 JPEG', async () => {
  const preview = await generateLivePreview(previewInfo);
  const metadata = await sharp(preview).metadata();

  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert.ok(preview.byteLength > 10_000);
  assert.ok(preview.byteLength < 8 * 1024 * 1024);
});
