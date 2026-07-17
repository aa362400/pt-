import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { candidateEvidencePresentation } from '../src/utils/daily-product-research-evidence.ts';

test('EVIDENCE_INSUFFICIENT candidate exposes a fail-closed evidence count', () => {
  assert.deepEqual(
    candidateEvidencePresentation({
      errorCode: 'EVIDENCE_INSUFFICIENT',
      errorSummary: {
        foundIndependentSources: 1,
        requiredIndependentSources: 2,
      },
    }),
    {
      insufficient: true,
      found: 1,
      required: 2,
      code: 'EVIDENCE_INSUFFICIENT',
    },
  );
});

test('unknown candidate errors retain their diagnostic code without inventing evidence', () => {
  assert.deepEqual(
    candidateEvidencePresentation({ rawSummary: { errorCode: 'NEW_PROVIDER_ERROR' } }),
    {
      insufficient: false,
      found: 0,
      required: 2,
      code: 'NEW_PROVIDER_ERROR',
    },
  );
});

test('daily selection page exposes the three-step real-run wizard and evidence retry action', () => {
  const page = readFileSync(
    new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
    'utf8',
  );
  const api = readFileSync(
    new URL('../src/api/dailyProductResearch.ts', import.meta.url),
    'utf8',
  );

  assert.match(page, /setRunWizardStep/);
  assert.match(page, /dailyResearchWizard\.steps\.\$\{step\}/);
  assert.match(page, /seedQueries:/);
  assert.match(page, /candidateEvidencePresentation\(candidate\)/);
  assert.match(page, /dailyResearchEvidence\.priceUnverified/);
  assert.match(page, /dailyResearchEvidence\.retry/);
  assert.match(page, /to=\{to\}/);
  assert.match(api, /seedQueries\?: string\[\]/);
});
