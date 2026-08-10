import assert from 'node:assert/strict';
import test from 'node:test';
import type { LookupAddress } from 'node:dns';
import type { IncomingHttpHeaders } from 'node:http';
import { downloadImage, isPublicIpAddress, resolvePublicImageTarget } from '../src/discord/thumbnail-generator.ts';

const PUBLIC_ADDRESS: LookupAddress = { address: '93.184.216.34', family: 4 };

class FakeImageResponse implements AsyncIterable<Uint8Array> {
  destroyed = false;
  resumed = false;
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  yieldedChunks = 0;
  private readonly chunks: readonly Uint8Array[];

  constructor(
    statusCode: number,
    headers: IncomingHttpHeaders,
    chunks: readonly Uint8Array[] = []
  ) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.chunks = chunks;
  }

  destroy(): void {
    this.destroyed = true;
  }

  resume(): void {
    this.resumed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    for (const chunk of this.chunks) {
      if (this.destroyed) return;
      this.yieldedChunks++;
      yield chunk;
    }
  }
}

test('remote image target rejects non-HTTPS, credentials, custom ports, and private DNS', async () => {
  const resolvePrivate = async (): Promise<LookupAddress[]> => [
    { address: '127.0.0.1', family: 4 },
  ];

  await assert.rejects(
    resolvePublicImageTarget(new URL('http://images.example/avatar.jpg'), resolvePrivate),
    /HTTPS/
  );
  await assert.rejects(
    resolvePublicImageTarget(new URL('https://user:secret@images.example/avatar.jpg'), resolvePrivate),
    /kredensial/
  );
  await assert.rejects(
    resolvePublicImageTarget(new URL('https://images.example:8443/avatar.jpg'), resolvePrivate),
    /port HTTPS standar/
  );
  await assert.rejects(
    resolvePublicImageTarget(new URL('https://images.example/avatar.jpg'), resolvePrivate),
    /jaringan nonpublik/
  );
});

test('public DNS answers pass and reserved IPv4/IPv6 ranges remain blocked', async () => {
  const resolved = await resolvePublicImageTarget(
    new URL('https://images.example/avatar.jpg'),
    async () => [PUBLIC_ADDRESS, { address: '2606:4700:4700::1111', family: 6 }]
  );

  assert.deepEqual(resolved, [PUBLIC_ADDRESS, { address: '2606:4700:4700::1111', family: 6 }]);
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '224.0.0.1',
    '::1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test('redirect target is re-resolved and blocked before second request', async () => {
  const requestedHosts: string[] = [];
  const response = new FakeImageResponse(302, {
    location: 'https://private.example/internal.png',
  });

  const result = await downloadImage('https://public.example/start.png', {
    resolveHostname: async (hostname) => hostname === 'public.example'
      ? [PUBLIC_ADDRESS]
      : [{ address: '10.0.0.2', family: 4 }],
    request: async (url) => {
      requestedHosts.push(url.hostname);
      return response;
    },
  });

  assert.equal(result, null);
  assert.deepEqual(requestedHosts, ['public.example']);
  assert.equal(response.resumed, true);
});

test('oversized chunked image is destroyed immediately after crossing byte limit', async () => {
  const oneMiB = new Uint8Array(1024 * 1024);
  const response = new FakeImageResponse(
    200,
    { 'content-type': 'image/png' },
    Array.from({ length: 100 }, () => oneMiB)
  );

  const result = await downloadImage('https://images.example/huge.png', {
    resolveHostname: async () => [PUBLIC_ADDRESS],
    request: async () => response,
  });

  assert.equal(result, null);
  assert.equal(response.destroyed, true);
  assert.equal(response.yieldedChunks, 16);
});

test('non-raster response is rejected before body consumption', async () => {
  let bodyStarted = false;
  const response = new FakeImageResponse(200, { 'content-type': 'image/svg+xml' });
  response[Symbol.asyncIterator] = async function* () {
    bodyStarted = true;
    yield Buffer.from('<svg/>');
  };

  const result = await downloadImage('https://images.example/vector.svg', {
    resolveHostname: async () => [PUBLIC_ADDRESS],
    request: async () => response,
  });

  assert.equal(result, null);
  assert.equal(response.destroyed, true);
  assert.equal(bodyStarted, false);
});