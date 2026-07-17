import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const router = readFileSync(new URL('../src/AppRouter.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages-v2/WorkbenchV2.tsx', import.meta.url), 'utf8');
const dailyPage = readFileSync(new URL('../src/pages/DailyProductResearch.tsx', import.meta.url), 'utf8');
const zhLocale = readFileSync(new URL('../src/i18n/locales/zh-CN.json', import.meta.url), 'utf8');
const enLocale = readFileSync(new URL('../src/i18n/locales/en-US.json', import.meta.url), 'utf8');

test('signed-in root opens the real workbench while the operations dashboard remains available', () => {
  assert.match(router, /path="\/" element=\{<Navigate to="\/workbench"/);
  assert.match(router, /path="\/workbench" element=\{<WorkbenchV2/);
  assert.match(router, /path="\/assistant" element=\{<Dashboard/);
});

test('workbench loads the real pipeline and channel health without placeholder counts', () => {
  assert.match(page, /pipelineApi\.get\(\)/);
  assert.match(page, /agentHealthApi\.getChannels\(\)/);
  assert.match(page, /pipeline\?\.summary\.needsAttention \?\? 0/);
  assert.match(page, /dailyProductResearchApi\.retryRun\(item\.entityId\)/);
  assert.doesNotMatch(page, /待你处理（92）|value:\s*92/);
  assert.match(zhLocale, /"actionableTitle": "待你处理（\{count\}）"/);
  assert.match(enLocale, /"actionableTitle": "Needs your action \(\{count\}\)"/);
  assert.doesNotMatch(zhLocale, /\{\{count\}\}/);
});

test('workbench deep links select review, launch, and research records', () => {
  assert.match(page, /navigate\(action\.href\)/);
  assert.match(dailyPage, /searchParams\.get\("run"\)/);
  assert.match(dailyPage, /selectRun\(requestedRunId\)/);
});
