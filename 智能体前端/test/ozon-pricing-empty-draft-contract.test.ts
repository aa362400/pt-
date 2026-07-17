import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/OzonPricingCalculator.tsx', import.meta.url),
  'utf8',
);

test('Ozon pricing starts with an empty business draft and never auto-selects catalog assumptions', () => {
  assert.doesNotMatch(source, /itemId:\s*`SKU-/);
  assert.doesNotMatch(source, /purchaseCost:\s*20\b/);
  assert.doesNotMatch(source, /weightGram:\s*300\b/);
  assert.doesNotMatch(source, /observedSalePriceCny:\s*100\b/);
  assert.doesNotMatch(source, /exchangeRate:\s*11\.2793\b/);
  assert.doesNotMatch(source, /lengthCm:\s*20\b/);
  assert.doesNotMatch(source, /widthCm:\s*10\b/);
  assert.doesNotMatch(source, /heightCm:\s*5\b/);
  assert.doesNotMatch(source, /const firstCategory/);
  assert.match(source, /value=\{value \?\? ["']{2}\}/);
  assert.match(source, /请填写真实采购成本/);
  assert.match(source, /请选择已验证类目/);
});
