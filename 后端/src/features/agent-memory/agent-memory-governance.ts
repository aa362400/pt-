import { createHash } from 'node:crypto';

export type MemoryTrustStatus =
  'trusted' | 'quarantined' | 'superseded' | 'revoked';

export interface MemoryGovernanceMetadata {
  sourceType?: string;
  sourceId?: string | null;
  version?: number;
  contentHash?: string;
  trustStatus?: MemoryTrustStatus;
  validFrom?: string;
  validUntil?: string | null;
  reasons?: string[];
  redactions?: number;
  conflictWithId?: string | null;
  correctedBy?: string | null;
  revokedBy?: string | null;
  revokedReason?: string | null;
}

const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|prior) instructions/i,
  /reveal (the )?(system prompt|api key|secret|credentials)/i,
  /override (security|policy|permissions)/i,
  /execute (this )?(shell|command|powershell|bash)/i,
  /you are now (?:an?|the) /i,
];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function redactText(input: string): { value: string; redactions: number } {
  let value = input.slice(0, 20_000);
  let redactions = 0;
  const replace = (pattern: RegExp, replacement: string) => {
    value = value.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  };
  replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[redacted-api-key]');
  replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}\b/gi, 'Bearer [redacted]');
  replace(
    /\b(api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]{6,}/gi,
    '$1=[redacted]',
  );
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]');
  replace(/(?:\+?86[\s-]?)?1[3-9]\d{9}\b/g, '[redacted-phone]');
  return { value, redactions };
}

function sanitizeValue(
  value: unknown,
  state: { redactions: number; suspicious: boolean },
  depth = 0,
): unknown {
  if (depth > 8) return '[depth-limit]';
  if (typeof value === 'string') {
    if (INJECTION_PATTERNS.some((pattern) => pattern.test(value))) {
      state.suspicious = true;
    }
    const redacted = redactText(value);
    state.redactions += redacted.redactions;
    return redacted.value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((item) => sanitizeValue(item, state, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 200)
      .map(([key, item]) => [key, sanitizeValue(item, state, depth + 1)]),
  );
}

export function governMemoryPayload<T>(input: T): {
  value: T;
  contentHash: string;
  trustStatus: MemoryTrustStatus;
  reasons: string[];
  redactions: number;
} {
  const state = { redactions: 0, suspicious: false };
  const value = sanitizeValue(input, state) as T;
  const reasons = state.suspicious ? ['instruction_injection_detected'] : [];
  return {
    value,
    contentHash: createHash('sha256')
      .update(canonicalJson(value), 'utf8')
      .digest('hex'),
    trustStatus: state.suspicious ? 'quarantined' : 'trusted',
    reasons,
    redactions: state.redactions,
  };
}

export function isMemoryUsable(
  governance: MemoryGovernanceMetadata | undefined,
  now = new Date(),
): boolean {
  if (!governance) return false;
  if (governance.trustStatus && governance.trustStatus !== 'trusted') {
    return false;
  }
  if (governance.validUntil) {
    const validUntil = Date.parse(governance.validUntil);
    if (!Number.isFinite(validUntil) || validUntil <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function memoryGovernanceFrom(
  value: unknown,
): MemoryGovernanceMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const governance = (value as Record<string, unknown>).governance;
  if (
    !governance ||
    typeof governance !== 'object' ||
    Array.isArray(governance)
  ) {
    return undefined;
  }
  const source = governance as Record<string, unknown>;
  const result: MemoryGovernanceMetadata = {};
  if (typeof source.sourceType === 'string')
    result.sourceType = source.sourceType;
  if (typeof source.sourceId === 'string' || source.sourceId === null) {
    result.sourceId = source.sourceId;
  }
  if (typeof source.version === 'number') result.version = source.version;
  if (typeof source.contentHash === 'string')
    result.contentHash = source.contentHash;
  if (
    source.trustStatus === 'trusted' ||
    source.trustStatus === 'quarantined' ||
    source.trustStatus === 'superseded' ||
    source.trustStatus === 'revoked'
  ) {
    result.trustStatus = source.trustStatus;
  }
  if (typeof source.validFrom === 'string') result.validFrom = source.validFrom;
  if (typeof source.validUntil === 'string' || source.validUntil === null) {
    result.validUntil = source.validUntil;
  }
  if (
    Array.isArray(source.reasons) &&
    source.reasons.every((reason) => typeof reason === 'string')
  ) {
    result.reasons = source.reasons;
  }
  if (typeof source.redactions === 'number')
    result.redactions = source.redactions;
  if (
    typeof source.conflictWithId === 'string' ||
    source.conflictWithId === null
  ) {
    result.conflictWithId = source.conflictWithId;
  }
  if (typeof source.correctedBy === 'string' || source.correctedBy === null) {
    result.correctedBy = source.correctedBy;
  }
  if (typeof source.revokedBy === 'string' || source.revokedBy === null) {
    result.revokedBy = source.revokedBy;
  }
  if (
    typeof source.revokedReason === 'string' ||
    source.revokedReason === null
  ) {
    result.revokedReason = source.revokedReason;
  }
  return result;
}
