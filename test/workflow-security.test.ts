import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/live-monitor.yml', import.meta.url),
  'utf8'
);

test('monitor loads and persists state only through postnotify-state', () => {
  assert.match(workflow, /STATE_BRANCH: postnotify-state/u);
  assert.match(workflow, /git\/ref\/heads\/\$STATE_BRANCH" --jq '\.object\.sha'/u);
  assert.match(workflow, /STATE_BASE_SHA=%s/u);
  assert.match(workflow, /contents\/state\.json\?ref=\$state_base_sha/u);
  assert.match(workflow, /base64 --decode > state\.json/u);
  assert.match(workflow, /git worktree add --detach "\$STATE_WORKTREE" "\$remote_sha"/u);
  assert.match(workflow, /git -C "\$STATE_WORKTREE" push origin "HEAD:\$STATE_BRANCH"/u);
  assert.doesNotMatch(workflow, /git push origin "HEAD:\$DEFAULT_BRANCH"/u);
  assert.doesNotMatch(workflow, /DEFAULT_BRANCH:/u);
});

test('state branch never supplies executable repository content', () => {
  assert.doesNotMatch(workflow, /checkout@[\s\S]*?ref:\s*postnotify-state/u);
  assert.doesNotMatch(workflow, /git checkout[^\n]*postnotify-state/u);
  assert.doesNotMatch(workflow, /git (?:show|restore)[^\n]*(?:src\/|\.github\/)/u);
  assert.match(workflow, /cp state\.json "\$STATE_WORKTREE\/state\.json"/u);

  const appIndex = workflow.indexOf('run: bun run src/app.ts');
  const gitAuthIndex = workflow.indexOf('gh auth setup-git');
  assert.ok(appIndex >= 0 && gitAuthIndex > appIndex);
});

test('stale state cannot overwrite a newer state commit', () => {
  assert.match(workflow, /if \[ "\$remote_sha" != "\$STATE_BASE_SHA" \]; then/u);
  assert.match(workflow, /cmp -s state\.json "\$RUNNER_TEMP\/postnotify-remote-state\.json"/u);
  assert.match(workflow, /refusing to overwrite newer state/u);
});

test('permission and secret boundaries remain isolated', () => {
  assert.match(workflow, /check-and-notify:[\s\S]*?permissions:\s*\n\s+contents: write/u);
  assert.match(workflow, /cleanup-completed-runs:[\s\S]*?permissions:\s*\n\s+actions: write/u);
  assert.match(workflow, /workflow-keepalive:[\s\S]*?permissions:\s*\n\s+actions: write/u);

  const cleanup = workflow.slice(workflow.indexOf('  cleanup-completed-runs:'), workflow.indexOf('  workflow-keepalive:'));
  assert.doesNotMatch(cleanup, /secrets\./u);
  assert.doesNotMatch(cleanup, /actions\/checkout/u);
  assert.doesNotMatch(cleanup, /contents: write/u);
});

test('external Actions remain pinned to full commit SHAs', () => {
  const references = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)].map((match) => match[1]);
  assert.ok(references.length >= 3);
  for (const reference of references) assert.match(reference, /^[0-9a-f]{40}$/u);
});
