import assert from 'node:assert/strict';
import test from 'node:test';
import {
  researchBatchTelemetry,
  runIssuePresentation,
  sourceEvidenceMode,
  sourceExecutionTelemetry,
} from '../src/utils/daily-product-research-telemetry.ts';

test('partial candidate shortfall is presented as a warning instead of a failed run', () => {
  assert.deepEqual(
    runIssuePresentation({
      status: 'PARTIAL',
      errorSummary: {
        code: 'EVIDENCE_INSUFFICIENT',
        message: '仅找到 1/2 个独立需求来源，已保留真实部分证据且未补造价格。',
        requiredIndependentSources: 2,
        foundIndependentSources: 1,
      },
    }),
    {
      title: '证据不足 · 仅找到 1/2 个独立来源',
      tone: 'warning',
    },
  );
});

test('batch telemetry exposes requested, processed, and shortfall counts', () => {
  assert.deepEqual(
    researchBatchTelemetry(
      {
        status: 'PARTIAL',
        candidateLimit: 10,
        errorSummary: {
          requestedCandidateCount: 10,
          processedCandidateCount: 5,
          shortfall: 5,
        },
        _count: { candidates: 5 },
      },
      0,
    ),
    { requested: 10, processed: 5, shortfall: 5 },
  );
});

test('an active batch does not present unfinished work as a final shortfall', () => {
  assert.deepEqual(
    researchBatchTelemetry(
      {
        status: 'RUNNING',
        candidateLimit: 10,
        errorSummary: null,
        _count: { candidates: 3 },
      },
      3,
    ),
    { requested: 10, processed: 3, shortfall: null },
  );
});

test('cached Ozon evidence is explicitly presented as historical and non-realtime', () => {
  assert.deepEqual(
    sourceEvidenceMode({
      source: 'ozon_verified_evidence_cache',
      metadata: {
        realtime: false,
        sourceKind: 'previously_verified_evidence_cache',
      },
    }),
    {
      label: '历史已验证缓存',
      detail: '非实时',
      tone: 'cached',
    },
  );
});

test('source telemetry exposes budget, search, and concept progress without inventing values', () => {
  assert.deepEqual(
    sourceExecutionTelemetry({
      attempts: 19,
      metadata: {
        budgetExhausted: true,
        budgetSeconds: 60,
        budgetElapsedMs: 60007,
        searchAttempts: 19,
        searchSuccesses: 18,
        requestedConceptCount: 10,
        conceptCount: 0,
        shortfall: 10,
        sourcingLeadCount: 2,
        excludedByLightSmallScreen: 6,
        duplicateConceptCount: 1,
        excludedByHistoryCount: 3,
        duplicateSourcingOfferCount: 4,
        sourcingSearchAttemptCount: 8,
        sourcingUnmappedConceptCount: 2,
        sourcingNoResultCount: 1,
        sourcingInvalidUrlCount: 5,
        sourcingTermMismatchCount: 7,
      },
    }),
    {
      budgetExhausted: true,
      budgetSeconds: 60,
      budgetElapsedMs: 60007,
      searchAttempts: 19,
      searchSuccesses: 18,
      requestedConceptCount: 10,
      conceptCount: 0,
      shortfall: 10,
      sourcingLeadCount: 2,
      excludedByLightSmallScreen: 6,
      duplicateConceptCount: 1,
      excludedByHistoryCount: 3,
      duplicateSourcingOfferCount: 4,
      sourcingSearchAttemptCount: 8,
      sourcingUnmappedConceptCount: 2,
      sourcingNoResultCount: 1,
      sourcingInvalidUrlCount: 5,
      sourcingTermMismatchCount: 7,
    },
  );
});
