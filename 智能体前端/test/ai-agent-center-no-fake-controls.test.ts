import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages-v2/AIAgentCenterV2.tsx', import.meta.url),
  'utf8',
);
const shellSource = readFileSync(
  new URL('../src/figma-exact/AIAgentCenter.tsx', import.meta.url),
  'utf8',
);

test('health checks are not presented as controllable Agent instances', () => {
  assert.doesNotMatch(pageSource, /liveChecks\s*\?\? \[\]\)\.map/);
  assert.match(pageSource, /agents=\{\[\]\}/);
  assert.doesNotMatch(pageSource, /onOpenOperations=/);
});

test('unimplemented Agent controls are visibly disabled', () => {
  assert.match(shellSource, /disabled=\{!onOpenOperations\}/);
  assert.ok(shellSource.includes('\u521b\u5efa Agent\uff08\u672a\u63a5\u5165\uff09'));
  assert.ok(
    shellSource.includes(
      '\u5c1a\u672a\u63a5\u5165 Agent \u521b\u5efa\u4e0e\u63a7\u5236 API',
    ),
  );
});
