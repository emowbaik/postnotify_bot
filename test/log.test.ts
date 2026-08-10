import assert from 'node:assert/strict';
import test from 'node:test';
import { safeLogValue } from '../src/log.ts';

test('untrusted platform text becomes one bounded physical log value', () => {
  const value = `legit title\r\n::warning title=forged::message\u001b[31m${'x'.repeat(500)}`;
  const sanitized = safeLogValue(value);
  const decoded = JSON.parse(sanitized) as string;

  assert.equal(/[\r\n\u001b]/u.test(sanitized), false);
  assert.equal(sanitized.startsWith('::'), false);
  assert.equal(decoded.includes('legit title ::warning title=forged::message [31m'), true);
  assert.equal(decoded.length, 300);
  assert.equal(decoded.endsWith('…'), true);
});

test('sanitizer preserves ordinary multilingual text', () => {
  assert.equal(safeLogValue('直播 сейчас 라이브'), '"直播 сейчас 라이브"');
});