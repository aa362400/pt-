import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { listingPricingForDisplay } from '../src/utils/listing-pricing-evidence.ts';

const pageSource = readFileSync(
  new URL('../src/pages/ListingGenerator.tsx', import.meta.url),
  'utf8',
);

test('listing UI hides a legacy suggested price without its economics binding', () => {
  assert.deepEqual(
    listingPricingForDisplay({ suggestedPrice: 29.99 }),
    {
      price: null,
      currency: null,
      status: 'DATA_INSUFFICIENT',
      economicsEvaluationId: null,
    },
  );
});

test('listing UI preserves a verified RUB price and its evaluation reference', () => {
  assert.deepEqual(
    listingPricingForDisplay({
      suggestedPrice: 1299,
      priceCurrency: 'RUB',
      pricingStatus: 'EVIDENCE_BACKED',
      economicsEvaluationId: 'economics-evaluation-1',
    }),
    {
      price: 1299,
      currency: 'RUB',
      status: 'EVIDENCE_BACKED',
      economicsEvaluationId: 'economics-evaluation-1',
    },
  );
});

test('listing preview labels evidence pricing and never hardcodes a dollar sign', () => {
  assert.match(pageSource, /证据定价/);
  assert.match(pageSource, /priceCurrency/);
  assert.match(pageSource, /economicsEvaluationId/);
  assert.doesNotMatch(pageSource, /\$\{previewData\.price\}/);
});
