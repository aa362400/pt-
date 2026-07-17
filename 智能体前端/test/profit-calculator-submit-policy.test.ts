import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/ProfitCalculator.tsx', import.meta.url),
  'utf8',
);

test('profit calculator mount and input changes never persist a calculation', () => {
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*(?:void\s+)?(?:fetchCalculation|submitCalculation)\(\);\s*\},\s*\[(?:fetchCalculation|submitCalculation)\]\s*\)/s,
  );
});

test('profit calculator starts without fictional monetary values', () => {
  assert.match(
    source,
    /useState<Partial<Record<CostLabel, number>>>\(\{\}\)/,
    'cost fields must start absent so missing evidence is distinct from explicit zero',
  );

  assert.match(
    source,
    /const \[salePrice, setSalePrice\] = useState\(0\)/,
    'sale price must start empty/zero',
  );
  assert.doesNotMatch(source, /useState\(24\.99\)/);
});

test('profit calculation is persisted only from an explicit submit control', () => {
  assert.match(source, /const handleSubmitCalculation\s*=\s*async\s*\(\)\s*=>/);
  assert.match(source, /data-testid="profit-calculate-submit"/);
  assert.match(
    source,
    /data-testid="profit-calculate-submit"[\s\S]{0,500}onClick=\{\(\) => void handleSubmitCalculation\(\)\}/,
  );
});
