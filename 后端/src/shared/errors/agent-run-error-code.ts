import { asOptionalString } from '../utils/coerce.js';

export const STABLE_AGENT_ERROR_CODES = [
  'MODEL_PROVIDER_UNAVAILABLE',
  'MODEL_PROVIDER_QUOTA_EXHAUSTED',
  'MODEL_PROVIDER_FALLBACK_EXHAUSTED',
  'IMAGE_PROVIDER_INVALID_KEY',
  'IMAGE_PROVIDER_QUOTA_EXHAUSTED',
  'IMAGE_PROVIDER_FALLBACK_EXHAUSTED',
  'EVIDENCE_INSUFFICIENT',
  'EVIDENCE_QUALITY_GATE_FAILED',
] as const;

export type StableAgentErrorCode = (typeof STABLE_AGENT_ERROR_CODES)[number];

const STABLE_CODES = new Set<string>(STABLE_AGENT_ERROR_CODES);

export function normalizeAgentRunErrorCode(error: unknown): string {
  const record = error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : {};
  const diagnostics = record.diagnostics && typeof record.diagnostics === 'object'
    ? (record.diagnostics as Record<string, unknown>)
    : {};
  const structuredCode = (
    asOptionalString(diagnostics.code) ??
    asOptionalString(record.code) ??
    ''
  ).trim().toUpperCase();
  if (STABLE_CODES.has(structuredCode)) return structuredCode;

  const message = error instanceof Error
    ? error.message
    : asOptionalString(record.message) ?? String(error ?? '');
  const normalized = `${structuredCode} ${message}`.toLowerCase();

  const orderedMarkers: Array<[string, StableAgentErrorCode]> = [
    ['model_provider_quota_exhausted', 'MODEL_PROVIDER_QUOTA_EXHAUSTED'],
    ['model_provider_fallback_exhausted', 'MODEL_PROVIDER_FALLBACK_EXHAUSTED'],
    ['model_provider_unavailable', 'MODEL_PROVIDER_UNAVAILABLE'],
    ['image_provider_invalid_key', 'IMAGE_PROVIDER_INVALID_KEY'],
    ['image_provider_quota_exhausted', 'IMAGE_PROVIDER_QUOTA_EXHAUSTED'],
    ['image_provider_fallback_exhausted', 'IMAGE_PROVIDER_FALLBACK_EXHAUSTED'],
    ['evidence_quality_gate_failed', 'EVIDENCE_QUALITY_GATE_FAILED'],
    ['evidence_insufficient', 'EVIDENCE_INSUFFICIENT'],
  ];
  for (const [marker, code] of orderedMarkers) {
    if (normalized.includes(marker)) return code;
  }

  const status = Number(record.status ?? record.statusCode);
  if (status === 403 && !normalized.includes('image')) {
    return 'MODEL_PROVIDER_QUOTA_EXHAUSTED';
  }
  if (
    status === 401 &&
    normalized.includes('image') &&
    (normalized.includes('invalid') || normalized.includes('unauthorized'))
  ) {
    return 'IMAGE_PROVIDER_INVALID_KEY';
  }
  if (
    normalized.includes('insufficient_user_quota') ||
    (normalized.includes('image') && normalized.includes('quota'))
  ) {
    return 'IMAGE_PROVIDER_QUOTA_EXHAUSTED';
  }
  if (
    normalized.includes('model') &&
    (normalized.includes('unavailable') ||
      normalized.includes('gateway') ||
      status >= 500)
  ) {
    return 'MODEL_PROVIDER_UNAVAILABLE';
  }
  return 'AGENT_ERROR';
}
