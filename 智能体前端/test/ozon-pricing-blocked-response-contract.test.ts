import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(
  new URL('../src/api/profit-calculator.ts', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/pages/OzonPricingCalculator.tsx', import.meta.url),
  'utf8',
);

test('Ozon pricing contract represents fail-closed rule and input evidence', () => {
  assert.match(apiSource, /result:\s*\{[\s\S]*?\}\s*\|\s*null;/);
  assert.match(apiSource, /decision:[^;]*'DATA_INSUFFICIENT'/);
  assert.match(apiSource, /usableForPricing:\s*boolean/);
  assert.match(apiSource, /ruleSourceBlockers:\s*string\[\]/);
});

test('Ozon pricing UI never dereferences or presents a blocked null result as a price', () => {
  assert.match(pageSource, /if\s*\(!result\.result\)/);
  assert.ok(pageSource.includes('\u5b9a\u4ef7\u8bc1\u636e\u4e0d\u8db3'));
  assert.match(pageSource, /catalog\?\.usableForPricing\s*===\s*false/);
  assert.match(pageSource, /item\.result\?\.result/);
});
