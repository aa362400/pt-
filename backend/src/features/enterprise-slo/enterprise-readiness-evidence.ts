import { readFile, stat } from 'node:fs/promises';

export const enterpriseReadinessGateNames = [
  'kms',
  'objectLock',
  'penetrationTest',
  'slo14Day',
  'nonMockAgent',
  'mcpTrust',
  'memoryGovernance',
  'judgeCalibration',
  'ozonReadOnly',
  'stripeLive',
] as const;

export type EnterpriseReadinessGateName =
  (typeof enterpriseReadinessGateNames)[number];
export type EnterpriseReadinessGateStatus =
  'passed' | 'failed' | 'not_configured';

export interface EnterpriseReadinessGate {
  status: EnterpriseReadinessGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface EnterpriseReadinessEvidence {
  status: 'passed' | 'failed' | 'not_verified';
  checkedAt: string | null;
  stale: boolean;
  claimAllowed: boolean;
  gates: Partial<Record<EnterpriseReadinessGateName, EnterpriseReadinessGate>>;
  failures: string[];
  message: string;
}

const MAX_EVIDENCE_BYTES = 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function notVerified(message: string): EnterpriseReadinessEvidence {
  return {
    status: 'not_verified',
    checkedAt: null,
    stale: true,
    claimAllowed: false,
    gates: {},
    failures: [],
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGate(value: unknown): EnterpriseReadinessGate | null {
  if (!isRecord(value)) return null;
  if (
    value.status !== 'passed' &&
    value.status !== 'failed' &&
    value.status !== 'not_configured'
  ) {
    return null;
  }
  if (typeof value.message !== 'string' || value.message.trim().length === 0) {
    return null;
  }
  if (value.details !== undefined && !isRecord(value.details)) return null;
  return {
    status: value.status,
    message: value.message,
    ...(value.details ? { details: value.details } : {}),
  };
}

export async function readEnterpriseReadinessEvidence(
  path: string,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): Promise<EnterpriseReadinessEvidence> {
  try {
    const file = await stat(path);
    if (!file.isFile() || file.size > MAX_EVIDENCE_BYTES) {
      return notVerified('textacceptanceevidencefilenoneenglish_text。');
    }
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (
      !isRecord(raw) ||
      (raw.status !== 'passed' && raw.status !== 'failed')
    ) {
      return notVerified('textacceptanceevidencetextnonetext。');
    }
    if (typeof raw.checkedAt !== 'string') {
      return notVerified('textacceptanceevidenceenglish_text。');
    }
    const checkedAtMs = Date.parse(raw.checkedAt);
    if (!Number.isFinite(checkedAtMs) || !isRecord(raw.gates)) {
      return notVerified('textacceptanceevidenceenglish_textnonetext。');
    }
    const gates = {} as Record<
      EnterpriseReadinessGateName,
      EnterpriseReadinessGate
    >;
    for (const name of enterpriseReadinessGateNames) {
      const gate = parseGate(raw.gates[name]);
      if (!gate) return notVerified(`textacceptanceevidencetextyesenglish_text：${name}。`);
      gates[name] = gate;
    }
    const failures = Array.isArray(raw.failures)
      ? raw.failures.filter((item): item is string => typeof item === 'string')
      : [];
    const stale =
      checkedAtMs > now.getTime() + 5 * 60 * 1000 ||
      now.getTime() - checkedAtMs > maxAgeMs;
    const allPassed = enterpriseReadinessGateNames.every(
      (name) => gates[name].status === 'passed',
    );
    const claimAllowed = raw.status === 'passed' && allPassed && !stale;
    return {
      status: claimAllowed ? 'passed' : 'failed',
      checkedAt: new Date(checkedAtMs).toISOString(),
      stale,
      claimAllowed,
      gates,
      failures,
      message: stale
        ? 'english_textacceptanceevidenceenglish_text 24 text，english_textacceptance。'
        : claimAllowed
          ? 'allenglish_textacceptanceevidencetextpassed。'
          : 'textyesenglish_textpassed，english_textplatformtextcompletedenglish_textacceptance。',
    };
  } catch {
    return notVerified('textgenerationyesenglish_textacceptanceevidence。');
  }
}
