import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchDiscord } from '../src/discord/request.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('Discord request succeeds before deadline', async () => {
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.signal);
    return new Response(null, { status: 204 });
  };

  const response = await fetchDiscord('https://discord.com/api/v10/test', {}, 100);

  assert.equal(response.status, 204);
});

test('Discord request aborts with stable timeout error', async () => {
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('timed out', 'TimeoutError'));
    }, { once: true });
  });

  await assert.rejects(
    fetchDiscord('https://discord.com/api/v10/test', {}, 5),
    /Discord API request timed out after 5ms/
  );
});

test('non-timeout network errors retain original failure', async () => {
  const expected = new TypeError('socket closed');
  globalThis.fetch = async () => { throw expected; };

  await assert.rejects(
    fetchDiscord('https://discord.com/api/v10/test', {}, 100),
    (error) => error === expected
  );
});
