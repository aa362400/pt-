import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboardSource = readFileSync(
  new URL('../src/pages/Dashboard.tsx', import.meta.url),
  'utf8',
);

test('dashboard pending confirmation reads real pending review tasks', () => {
  assert.match(dashboardSource, /reviewApi\.list\(\{ status: 'PENDING', limit: 4 \}\)/);
  assert.match(dashboardSource, /pendingReviewsTotal/);
  assert.match(dashboardSource, /pendingReviewTasks/);
  assert.match(
    dashboardSource,
    /navigate\(`\/review\?task=\$\{encodeURIComponent\(task\.id\)\}`\)/,
  );
  assert.doesNotMatch(dashboardSource, /dashboardApi\.getOpportunities\(\)/);
  assert.doesNotMatch(dashboardSource, /opportunities\?\.items\.filter/);
});

test('dashboard does not invent progress percentages for binary runtime states', () => {
  assert.doesNotMatch(dashboardSource, /progress=\{/);
  assert.doesNotMatch(dashboardSource, /progress:\s*number/);
  assert.doesNotMatch(dashboardSource, /counts\.activeTasks\s*>\s*0\s*\?\s*64/);
  assert.match(dashboardSource, /暂无待确认任务/);
  assert.match(dashboardSource, /0 个动作等待确认/);
});
