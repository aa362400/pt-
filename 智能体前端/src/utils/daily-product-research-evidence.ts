interface EvidenceSummary {
  code?: string | null;
  foundIndependentSources?: number;
  requiredIndependentSources?: number;
}

interface CandidateEvidenceInput {
  errorCode?: string | null;
  errorSummary?: EvidenceSummary | null;
  rawSummary?: unknown;
}

export interface CandidateEvidencePresentation {
  insufficient: boolean;
  found: number;
  required: number;
  code: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteCount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function candidateEvidencePresentation(
  candidate: CandidateEvidenceInput,
): CandidateEvidencePresentation {
  const raw = record(candidate.rawSummary);
  const rawError = record(raw?.errorSummary);
  const errorSummary = candidate.errorSummary ?? null;
  const code = candidate.errorCode
    ?? errorSummary?.code
    ?? (typeof raw?.errorCode === 'string' ? raw.errorCode : null)
    ?? (typeof rawError?.code === 'string' ? rawError.code : null);
  const required = finiteCount(errorSummary?.requiredIndependentSources)
    ?? finiteCount(raw?.requiredIndependentSources)
    ?? finiteCount(rawError?.requiredIndependentSources)
    ?? 2;
  const found = finiteCount(errorSummary?.foundIndependentSources)
    ?? finiteCount(raw?.foundIndependentSources)
    ?? finiteCount(rawError?.foundIndependentSources)
    ?? 0;

  return {
    insufficient: code === 'EVIDENCE_INSUFFICIENT',
    found,
    required,
    code: code ?? null,
  };
}
