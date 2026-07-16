import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  keywordMetricEvidenceIsAuditable,
  keywordMetricsForDisplay,
} from '../src/utils/keyword-evidence.ts';

const pageSource = readFileSync(
  new URL('../src/pages/KeywordAnalysis.tsx', import.meta.url),
  'utf8',
);

test('keyword metrics remain unavailable without complete auditable evidence', () => {
  assert.deepEqual(
    keywordMetricsForDisplay({
      volume: 9000,
      difficulty: 12,
      metricStatus: 'EVIDENCE_BACKED',
      metricEvidence: {
        provider: 'provider-name-only',
        observedAt: '2026-07-16T04:00:00.000Z',
        method: 'unknown source export',
        sourceKind: 'KEYWORD_PROVIDER_API',
      },
    }),
    { volume: null, difficulty: null },
  );
});

test('keyword metrics display only with source URL or reference plus provenance', () => {
  const evidence = {
    provider: 'documented-keyword-provider',
    sourceUrl: 'https://provider.example.test/reports/keyword-42',
    observedAt: '2026-07-16T04:00:00.000Z',
    method: 'provider monthly search report',
    sourceKind: 'KEYWORD_PROVIDER_API' as const,
  };

  assert.equal(keywordMetricEvidenceIsAuditable(evidence), true);
  assert.deepEqual(
    keywordMetricsForDisplay({
      volume: 4321,
      difficulty: 46,
      metricStatus: 'EVIDENCE_BACKED',
      metricEvidence: evidence,
    }),
    { volume: 4321, difficulty: 46 },
  );
  assert.deepEqual(
    keywordMetricsForDisplay({
      volume: '4321',
      difficulty: '46',
      metricStatus: 'EVIDENCE_BACKED',
      metricEvidence: evidence,
    }),
    { volume: null, difficulty: null },
  );
});

test('keyword page labels LLM terms as suggestions and never exports them as real data', () => {
  assert.match(pageSource, /关键词建议/);
  assert.match(pageSource, /无可核验证据/);
  assert.doesNotMatch(pageSource, /真实关键词数据/);
  assert.match(pageSource, /metricStatus/);
  assert.match(pageSource, /sourceReference/);
});
