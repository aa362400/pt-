import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
  'utf8',
);

test('terminal selections keep a low-frequency run-list refresh alive', () => {
  assert.match(
    pageSource,
    /researchRunRefreshInterval\(selectedRun\?\.status \?\? null\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /if \(!selectedRun \|\| terminalStatuses\.has\(selectedRun\.status\)\) return;/,
  );
});

test('automatic selection follows newest runs while manual history selection is explicit', () => {
  assert.match(pageSource, /selectionModeRef\.current = ['"]MANUAL['"]/);
  assert.match(pageSource, /reconcileResearchRunSelection\(/);
});

test('refresh wiring rejects overlapping quiet loads and stale detail responses', () => {
  assert.match(
    pageSource,
    /if \(quiet && listLoadInFlightRef\.current\) return;/,
  );
  assert.match(
    pageSource,
    /if \(requestId !== listLoadRequestIdRef\.current\) return;/,
  );
  assert.match(pageSource, /shouldApplyRunDataResponse\(/);
});
