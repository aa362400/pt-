interface RunIssueInput {
  status: string;
  errorSummary: {
    code?: string;
    message?: string;
    requiredIndependentSources?: number;
    foundIndependentSources?: number;
  } | null;
}

interface BatchTelemetryInput {
  status: string;
  candidateLimit: number;
  errorSummary: {
    requestedCandidateCount?: number;
    processedCandidateCount?: number;
    shortfall?: number;
  } | null;
  _count?: { candidates: number };
}

interface SourceEvidenceInput {
  source: string;
  metadata: {
    realtime?: unknown;
    sourceKind?: unknown;
  } | null;
}

interface SourceExecutionInput {
  attempts?: number;
  metadata: Record<string, unknown> | null;
}

export interface SourceExecutionTelemetry {
  budgetExhausted: boolean | null;
  budgetSeconds: number | null;
  budgetElapsedMs: number | null;
  searchAttempts: number | null;
  searchSuccesses: number | null;
  requestedConceptCount: number | null;
  conceptCount: number | null;
  shortfall: number | null;
  sourcingLeadCount: number | null;
  excludedByLightSmallScreen: number | null;
  duplicateConceptCount: number | null;
  excludedByHistoryCount: number | null;
  duplicateSourcingOfferCount: number | null;
  sourcingSearchAttemptCount: number | null;
  sourcingUnmappedConceptCount: number | null;
  sourcingNoResultCount: number | null;
  sourcingInvalidUrlCount: number | null;
  sourcingTermMismatchCount: number | null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function researchBatchTelemetry(
  run: BatchTelemetryInput,
  loadedCandidateCount: number,
): { requested: number; processed: number; shortfall: number | null } {
  const requested =
    nonNegativeNumber(run.errorSummary?.requestedCandidateCount) ??
    nonNegativeNumber(run.candidateLimit) ??
    0;
  const processed =
    nonNegativeNumber(run.errorSummary?.processedCandidateCount) ??
    nonNegativeNumber(run._count?.candidates) ??
    nonNegativeNumber(loadedCandidateCount) ??
    0;
  const explicitShortfall = nonNegativeNumber(run.errorSummary?.shortfall);
  const shortfall =
    explicitShortfall ??
    (['PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)
      ? Math.max(0, requested - processed)
      : null);
  return { requested, processed, shortfall };
}

export function sourceEvidenceMode(source: SourceEvidenceInput): {
  label: string;
  detail: string;
  tone: 'cached' | 'live' | 'unknown';
} {
  const sourceKind = source.metadata?.sourceKind;
  if (
    source.metadata?.realtime === false ||
    sourceKind === 'previously_verified_evidence_cache'
  ) {
    return {
      label: '历史已验证缓存',
      detail: '非实时',
      tone: 'cached',
    };
  }
  if (source.metadata?.realtime === true) {
    return { label: '实时来源', detail: '实时', tone: 'live' };
  }
  return {
    label: '实时性未声明',
    detail: '不作实时推定',
    tone: 'unknown',
  };
}

export function sourceExecutionTelemetry(
  source: SourceExecutionInput,
): SourceExecutionTelemetry {
  const metadata = source.metadata ?? {};
  return {
    budgetExhausted:
      typeof metadata.budgetExhausted === 'boolean'
        ? metadata.budgetExhausted
        : null,
    budgetSeconds: nonNegativeNumber(metadata.budgetSeconds),
    budgetElapsedMs: nonNegativeNumber(metadata.budgetElapsedMs),
    searchAttempts: nonNegativeNumber(metadata.searchAttempts),
    searchSuccesses: nonNegativeNumber(metadata.searchSuccesses),
    requestedConceptCount: nonNegativeNumber(
      metadata.requestedConceptCount,
    ),
    conceptCount: nonNegativeNumber(metadata.conceptCount),
    shortfall: nonNegativeNumber(metadata.shortfall),
    sourcingLeadCount: nonNegativeNumber(metadata.sourcingLeadCount),
    excludedByLightSmallScreen: nonNegativeNumber(
      metadata.excludedByLightSmallScreen,
    ),
    duplicateConceptCount: nonNegativeNumber(metadata.duplicateConceptCount),
    excludedByHistoryCount: nonNegativeNumber(metadata.excludedByHistoryCount),
    duplicateSourcingOfferCount: nonNegativeNumber(
      metadata.duplicateSourcingOfferCount,
    ),
    sourcingSearchAttemptCount: nonNegativeNumber(
      metadata.sourcingSearchAttemptCount,
    ),
    sourcingUnmappedConceptCount: nonNegativeNumber(
      metadata.sourcingUnmappedConceptCount,
    ),
    sourcingNoResultCount: nonNegativeNumber(metadata.sourcingNoResultCount),
    sourcingInvalidUrlCount: nonNegativeNumber(
      metadata.sourcingInvalidUrlCount,
    ),
    sourcingTermMismatchCount: nonNegativeNumber(
      metadata.sourcingTermMismatchCount,
    ),
  };
}

export function runIssuePresentation(
  run: RunIssueInput,
): { title: string; tone: 'danger' | 'warning' } | null {
  if (!run.errorSummary) return null;
  if (run.status === 'FAILED') {
    return { title: '运行失败', tone: 'danger' };
  }
  if (run.errorSummary.code === 'EVIDENCE_INSUFFICIENT') {
    const required = run.errorSummary.requiredIndependentSources;
    const found = run.errorSummary.foundIndependentSources;
    return {
      title:
        typeof required === 'number' && typeof found === 'number'
          ? `证据不足 · 仅找到 ${found}/${required} 个独立来源`
          : '证据不足 · 已保留真实部分结果',
      tone: 'warning',
    };
  }
  return { title: '批次部分完成', tone: 'warning' };
}
