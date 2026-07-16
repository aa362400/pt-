import { createHash, randomBytes } from 'node:crypto';

const TRACEPARENT_PATTERN =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ParsedTraceparent {
  version: string;
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
  traceparent: string;
}

export interface ResolvedTraceContext {
  traceId: string;
  traceparent: string;
}

function isNonZero(value: string): boolean {
  return value !== '0'.repeat(value.length);
}

export function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return TRACE_ID_PATTERN.test(normalized) && isNonZero(normalized)
    ? normalized
    : undefined;
}

export function normalizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return REQUEST_ID_PATTERN.test(normalized) ? normalized : undefined;
}

export function parseTraceparent(
  value: unknown,
): ParsedTraceparent | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  const match = TRACEPARENT_PATTERN.exec(normalized);
  if (!match || match[1] === 'ff') return undefined;

  const traceId = normalizeTraceId(match[2]);
  const parentSpanId = match[3];
  if (
    !traceId ||
    !SPAN_ID_PATTERN.test(parentSpanId) ||
    !isNonZero(parentSpanId)
  ) {
    return undefined;
  }

  return {
    version: match[1],
    traceId,
    parentSpanId,
    traceFlags: match[4],
    traceparent: normalized,
  };
}

export function ensureTraceId(value?: unknown): string {
  const normalized = normalizeTraceId(value);
  if (normalized) return normalized;
  if (typeof value === 'string' && value.trim()) {
    return createHash('sha256').update(value.trim()).digest('hex').slice(0, 32);
  }
  return randomBytes(16).toString('hex');
}

export function formatTraceparent(
  traceIdValue: unknown,
  spanIdValue: unknown,
  traceFlagsValue: unknown = '01',
): string | undefined {
  const traceId = normalizeTraceId(traceIdValue);
  const spanId =
    typeof spanIdValue === 'string' ? spanIdValue.trim().toLowerCase() : '';
  const traceFlags =
    typeof traceFlagsValue === 'string'
      ? traceFlagsValue.trim().toLowerCase()
      : '';
  if (
    !traceId ||
    !SPAN_ID_PATTERN.test(spanId) ||
    !isNonZero(spanId) ||
    !/^[0-9a-f]{2}$/.test(traceFlags)
  ) {
    return undefined;
  }
  return `00-${traceId}-${spanId}-${traceFlags}`;
}

export function traceparentForTraceId(
  traceIdValue: unknown,
  traceFlags = '01',
): string {
  const traceId = ensureTraceId(traceIdValue);
  return `00-${traceId}-${randomBytes(8).toString('hex')}-${traceFlags}`;
}

export function resolveTraceContext(
  input: { traceparent?: unknown; traceId?: unknown } = {},
): ResolvedTraceContext {
  const parsed = parseTraceparent(input.traceparent);
  const traceId =
    parsed?.traceId ?? normalizeTraceId(input.traceId) ?? ensureTraceId();
  return {
    traceId,
    traceparent: traceparentForTraceId(traceId, parsed?.traceFlags ?? '01'),
  };
}
