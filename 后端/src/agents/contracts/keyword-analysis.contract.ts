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

export interface KeywordAnalysisItem {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  metricStatus: KeywordMetricStatus;
  metricEvidence: KeywordMetricEvidence | null;
}

export interface KeywordAnalysisResult {
  keywords: KeywordAnalysisItem[];
  dataStatus: KeywordMetricStatus;
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

function validSourceUrl(value: unknown): string | null {
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

function validObservedAt(value: unknown): string | null {
  const normalized = nonEmptyString(value, 64);
  if (
    !normalized ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      normalized,
    ) ||
    Number.isNaN(Date.parse(normalized))
  ) {
    return null;
  }
  return normalized;
}

export function normalizeKeywordMetricEvidence(
  value: unknown,
): KeywordMetricEvidence | null {
  const payload = asRecord(value);
  const provider = nonEmptyString(payload.provider, 128);
  const sourceUrl = validSourceUrl(payload.sourceUrl);
  const sourceReference = nonEmptyString(payload.sourceReference, 512);
  const observedAt = validObservedAt(payload.observedAt);
  const method = nonEmptyString(payload.method, 256);
  const sourceKind = KEYWORD_METRIC_SOURCE_KINDS.find(
    (candidate) => candidate === payload.sourceKind,
  );

  if (
    !provider ||
    (!sourceUrl && !sourceReference) ||
    !observedAt ||
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

function volumeOrNull(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function difficultyOrNull(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

/**
 * Treats every remote keyword metric as untrusted. Numeric values survive only
 * when the same item carries complete, auditable provenance.
 */
export function normalizeKeywordAnalysisResult(
  value: unknown,
): KeywordAnalysisResult {
  const payload = asRecord(value);
  const rawKeywords = Array.isArray(payload.keywords) ? payload.keywords : [];
  const seen = new Set<string>();
  const keywords: KeywordAnalysisItem[] = [];

  for (const rawItem of rawKeywords) {
    const item = asRecord(rawItem);
    const keyword = nonEmptyString(item.keyword, 256);
    if (!keyword) continue;
    const dedupeKey = keyword.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const metricEvidence = normalizeKeywordMetricEvidence(item.metricEvidence);
    const volume = metricEvidence ? volumeOrNull(item.volume) : null;
    const difficulty = metricEvidence
      ? difficultyOrNull(item.difficulty)
      : null;
    const evidenceBacked =
      metricEvidence !== null && (volume !== null || difficulty !== null);

    keywords.push({
      keyword,
      volume: evidenceBacked ? volume : null,
      difficulty: evidenceBacked ? difficulty : null,
      metricStatus: evidenceBacked ? 'EVIDENCE_BACKED' : 'DATA_INSUFFICIENT',
      metricEvidence: evidenceBacked ? metricEvidence : null,
    });
  }

  return {
    keywords,
    dataStatus: keywords.some((item) => item.metricStatus === 'EVIDENCE_BACKED')
      ? 'EVIDENCE_BACKED'
      : 'DATA_INSUFFICIENT',
  };
}
