import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages-v2/PlatformConnectionV2.tsx', import.meta.url),
  'utf8',
);
const viewSource = readFileSync(
  new URL('../src/figma-exact/PlatformConnection.tsx', import.meta.url),
  'utf8',
);

test('platform connect actions preserve the selected provider instead of always opening Ozon', () => {
  assert.match(viewSource, /onConnectPlatform\?: \(platformId: string\) => void/);
  assert.match(viewSource, /onConnectPlatform\?\.\(platform\.id\)/);
  assert.match(pageSource, /if \(platformId !== 'OZON'\)/);
  assert.match(pageSource, /setConnectionOpen\(true\)/);
});

test('TEMU is visibly unavailable and cannot open a credential form before its backend exists', () => {
  assert.match(pageSource, /connectionEnabled: false/);
  assert.match(pageSource, /TEMU 后端授权与同步能力暂未配置，当前不可连接/);
  assert.match(viewSource, /disabled=\{!platform\.connectionEnabled\}/);
  assert.match(viewSource, /platform\.connectionEnabled \? '立即连接' : '暂未配置'/);
  assert.match(viewSource, /platform\.connectionBlockedReason/);
  assert.doesNotMatch(pageSource, /onConnectPlatform=\{\(\) => setConnectionOpen\(true\)\}/);
});

test('connection statistics never count unverified TEMU records as real connections', () => {
  assert.match(
    pageSource,
    /channel\.provider === 'OZON'[\s\S]{0,200}channel\.syncStatus !== 'DISCONNECTED'/,
  );
});
