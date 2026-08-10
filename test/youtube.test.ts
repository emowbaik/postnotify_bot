import assert from 'node:assert/strict';
import test from 'node:test';
import { checkYouTubeLive } from '../src/youtube/checkLive.ts';

const CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const VIDEO_ID = 'abcdefghijk';
const API_KEY = 'test-api-key';
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('YouTube discovers active broadcast and normalizes metadata', async () => {
  const requestedResources: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const resource = url.pathname.split('/').pop() ?? '';
    requestedResources.push(resource);

    if (resource === 'playlistItems') {
      assert.equal(url.searchParams.get('playlistId'), `UU${CHANNEL_ID.slice(2)}`);
      assert.equal(url.searchParams.get('maxResults'), '20');
      return jsonResponse({ items: [{ contentDetails: { videoId: VIDEO_ID } }] });
    }
    if (resource === 'videos') {
      return jsonResponse({ items: [{
        id: VIDEO_ID,
        snippet: {
          liveBroadcastContent: 'live',
          title: 'Ranked stream',
          channelTitle: 'Fallback channel',
          thumbnails: { high: { url: 'https://cdn.example/live.jpg' } },
        },
        liveStreamingDetails: {
          actualStartTime: '2026-08-10T07:00:00.000Z',
          concurrentViewers: '123.9',
        },
      }] });
    }
    if (resource === 'channels') {
      return jsonResponse({ items: [{ snippet: {
        title: 'Canonical Channel',
        thumbnails: { default: { url: 'https://cdn.example/avatar.jpg' } },
      } }] });
    }
    throw new Error(`Unexpected resource: ${resource}`);
  };

  const result = await checkYouTubeLive(CHANNEL_ID, API_KEY);

  assert.equal(result.status, 'live');
  if (result.status !== 'live') return;
  assert.equal(result.roomId, VIDEO_ID);
  assert.equal(result.displayName, 'Canonical Channel');
  assert.equal(result.title, 'Ranked stream');
  assert.equal(result.viewerCount, 123);
  assert.equal(result.thumbnailUrl, 'https://cdn.example/live.jpg');
  assert.equal(result.profilePicUrl, 'https://cdn.example/avatar.jpg');
  assert.deepEqual(requestedResources, ['playlistItems', 'videos', 'channels']);
});

test('scheduled broadcast remains offline before actual start', async () => {
  globalThis.fetch = async (input) => {
    const resource = new URL(String(input)).pathname.split('/').pop();
    if (resource === 'playlistItems') {
      return jsonResponse({ items: [{ contentDetails: { videoId: VIDEO_ID } }] });
    }
    if (resource === 'videos') {
      return jsonResponse({ items: [{
        id: VIDEO_ID,
        snippet: { liveBroadcastContent: 'upcoming', title: 'Premiere' },
        liveStreamingDetails: { scheduledStartTime: '2099-01-01T00:00:00.000Z' },
      }] });
    }
    throw new Error(`Unexpected resource: ${resource}`);
  };

  const result = await checkYouTubeLive(CHANNEL_ID, API_KEY);

  assert.deepEqual(result, {
    status: 'offline',
    isLive: false,
    platform: 'youtube',
    username: CHANNEL_ID,
  });
});

test('known active video skips upload playlist scan', async () => {
  const requestedResources: string[] = [];
  globalThis.fetch = async (input) => {
    const resource = new URL(String(input)).pathname.split('/').pop() ?? '';
    requestedResources.push(resource);
    if (resource === 'videos') {
      return jsonResponse({ items: [{
        id: VIDEO_ID,
        snippet: { liveBroadcastContent: 'live', title: 'Cached live' },
        liveStreamingDetails: { actualStartTime: '2026-08-10T07:00:00.000Z' },
      }] });
    }
    if (resource === 'channels') return jsonResponse({ items: [] });
    throw new Error(`Unexpected resource: ${resource}`);
  };

  const result = await checkYouTubeLive(CHANNEL_ID, API_KEY, VIDEO_ID);

  assert.equal(result.status, 'live');
  assert.deepEqual(requestedResources, ['videos', 'channels']);
});

test('quota error is normalized without leaking API key', async () => {
  globalThis.fetch = async () => jsonResponse({
    error: { errors: [{ reason: 'quotaExceeded' }] },
  }, 403);

  const result = await checkYouTubeLive(CHANNEL_ID, API_KEY);

  assert.equal(result.status, 'error');
  if (result.status !== 'error') return;
  assert.equal(result.errorCode, 'YOUTUBE_QUOTA_EXCEEDED');
  assert.equal(result.message, 'YouTube API quota exceeded.');
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});
