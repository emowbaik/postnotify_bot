import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadState, saveState } from '../src/state.ts';
import type { BotState } from '../src/types.ts';

function withTemporaryState(run: (directory: string, stateFile: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'postnotify-state-'));
  try {
    run(directory, path.join(directory, 'state.json'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('missing state starts with empty backward-compatible defaults', () => {
  withTemporaryState((_directory, stateFile) => {
    assert.deepEqual(loadState(stateFile), {
      activeLiveSessions: [],
      youtubeActiveVideos: {},
      platformErrors: {},
    });
  });
});

test('corrupt state throws and preserves original bytes', () => {
  withTemporaryState((_directory, stateFile) => {
    const corrupt = '{"activeLiveSessions": [';
    writeFileSync(stateFile, corrupt, 'utf8');

    assert.throws(
      () => loadState(stateFile),
      /existing state was preserved/
    );
    assert.equal(readFileSync(stateFile, 'utf8'), corrupt);
  });
});

test('empty persisted state is treated as corruption', () => {
  withTemporaryState((_directory, stateFile) => {
    writeFileSync(stateFile, '', 'utf8');
    assert.throws(() => loadState(stateFile), /existing state was preserved/);
  });
});

test('save atomically replaces state and removes temporary file', () => {
  withTemporaryState((directory, stateFile) => {
    writeFileSync(stateFile, '{"old":true}\n', 'utf8');
    const expected: BotState = {
      activeLiveSessions: ['youtube:channel:video'],
      youtubeActiveVideos: { channel: 'video' },
      platformErrors: {},
    };

    saveState(expected, stateFile);

    assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')), expected);
    assert.deepEqual(readdirSync(directory), ['state.json']);
  });
});
