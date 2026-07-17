import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(
  new URL('../src/api/dailyProductResearch.ts', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
  'utf8',
);

test('每日选品 API 提供失败运行的一键重试接口', () => {
  assert.match(apiSource, /retryRun: \(id: string\) =>/);
  assert.match(
    apiSource,
    /`\/daily-product-research\/runs\/\$\{encodeURIComponent\(id\)\}\/retry`/,
  );
});

test('失败运行显示中文重试按钮并阻止重复提交', () => {
  assert.match(pageSource, /const retryRunInFlightRef = useRef\(false\)/);
  assert.match(
    pageSource,
    /selectedRun\.status === ['"]FAILED['"][\s\S]{0,1200}onClick=\{\(\) => void retryRun\(\)\}/,
  );
  assert.match(pageSource, /disabled=\{runningAction !== null\}/);
  assert.match(pageSource, /一键重试本次选品/);
  assert.match(pageSource, /正在重新排队/);
});

test('重试成功后刷新当前运行与运行数据，失败时给出中文提示', () => {
  const handler = pageSource.match(
    /const retryRun = async \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? '';

  assert.match(handler, /retryRunInFlightRef\.current/);
  assert.match(handler, /dailyProductResearchApi\.retryRun\(run\.id\)/);
  assert.match(handler, /setSelectedRun/);
  assert.match(handler, /await load\(\)/);
  assert.match(handler, /已提交重试/);
  assert.match(handler, /重试失败/);
});
