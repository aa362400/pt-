export const KEYWORD_METRIC_SOURCE_KINDS = [
  'MARKETPLACE_API',
  'KEYWORD_PROVIDER_API',
  'FIRST_PARTY_ANALYTICS',
  'PUBLIC_DATASET',
] as const;

export type KeywordMetricSourceKind =
  (typeof KEYWORD_METRIC_SOURCE_KINDS)[number];
export type KeywordMetricStatus = 'EVIDENCE_BACKED' | 'DATA_INSUFFICIENT';

export interface KeywordMetricEvidence {
  provider: string;
  sourceUrl?: string;
  sourceReference?: string;
  observedAt: string;
  method: string;
  sourceKind: KeywordMetricSourceKind;
}

interface KeywordMetricPayload {
  volume?: unknown;
  difficulty?: unknown;
  metricStatus?: unknown;
  metricEvidence?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

function httpUrl(value: unknown): string | null {
  const normalized = nonEmptyString(value, 2048);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function keywordMetricEvidenceForDisplay(
  value: unknown,
): KeywordMetricEvidence | null {
  const payload = asRecord(value);
  const provider = nonEmptyString(payload.provider, 128);
  const sourceUrl = httpUrl(payload.sourceUrl);
  const sourceReference = nonEmptyString(payload.sourceReference, 512);
  const observedAt = nonEmptyString(payload.observedAt, 64);
  const method = nonEmptyString(payload.method, 256);
  const sourceKind = KEYWORD_METRIC_SOURCE_KINDS.find(
    (candidate) => candidate === payload.sourceKind,
  );

  if (
    !provider ||
    (!sourceUrl && !sourceReference) ||
    !observedAt ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      observedAt,
    ) ||
    Number.isNaN(Date.parse(observedAt)) ||
    !method ||
    !sourceKind
  ) {
    return null;
  }

  return {
    provider,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceReference ? { sourceReference } : {}),
    observedAt,
    method,
    sourceKind,
  };
}

export function keywordMetricEvidenceIsAuditable(value: unknown): boolean {
  return keywordMetricEvidenceForDisplay(value) !== null;
}

export function keywordMetricsForDisplay(payload: KeywordMetricPayload): {
  volume: number | null;
  difficulty: number | null;
} {
  if (
    payload.metricStatus !== 'EVIDENCE_BACKED' ||
    !keywordMetricEvidenceIsAuditable(payload.metricEvidence)
  ) {
    return { volume: null, difficulty: null };
  }

  const volume =
    typeof payload.volume === 'number' &&
    Number.isFinite(payload.volume) &&
    Number.isInteger(payload.volume) &&
    payload.volume >= 0
      ? payload.volume
      : null;
  const difficulty =
    typeof payload.difficulty === 'number' &&
    Number.isFinite(payload.difficulty) &&
    payload.difficulty >= 0 &&
    payload.difficulty <= 100
      ? payload.difficulty
      : null;

  return { volume, difficulty };
}
