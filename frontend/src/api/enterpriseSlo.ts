import { api } from "./client";

export type EnterpriseSloStatus = "observing" | "passed" | "failed";

export interface EnterpriseSloDay {
  id: string;
  date: string;
  totalTasks: number;
  successfulTasks: number;
  taskSuccessRate: number | null;
  qualitySamples: number;
  qualityPassed: number;
  qualityPassRate: number | null;
  autonomousCompletions: number;
  autonomousCompletionRate: number | null;
  totalSuggestions: number;
  acceptedSuggestions: number;
  suggestionAdoptionRate: number | null;
  unauthorizedActionCount: number;
  blockedUnauthorizedAttemptCount: number;
  p95LatencyMs: number | null;
  queueBacklog: number;
  queueEvidenceAvailable: boolean;
  unresolvedDeadLetters: number;
  totalCostAmount: string;
  costSampleCount: number;
  averageCostPerTask: string | null;
  errorBudgetConsumed: number | null;
  dataComplete: boolean;
  missingEvidence: string[];
  passed: boolean;
  updatedAt: string;
}

export interface EnterpriseSloReport {
  status: EnterpriseSloStatus;
  claimAllowed: boolean;
  requiredDays: number;
  observedDays: number;
  consecutiveObservedDays: number;
  consecutivePassedDays: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  thresholds: {
    taskSuccessRate: number;
    qualityPassRate: number;
    autonomousCompletionRate: number;
    suggestionAdoptionRate: number;
    unauthorizedActionCount: number;
    unresolvedDeadLetters: number;
    errorBudgetConsumedMax: number;
  };
  message: string;
  currentDay: EnterpriseSloDay | null;
  days: EnterpriseSloDay[];
}

export type EnterpriseReadinessGateName =
  | "kms"
  | "objectLock"
  | "penetrationTest"
  | "slo14Day"
  | "nonMockAgent"
  | "mcpTrust"
  | "memoryGovernance"
  | "judgeCalibration"
  | "ozonReadOnly"
  | "stripeLive";

export type EnterpriseReadinessGateStatus =
  "passed" | "failed" | "not_configured";

export interface EnterpriseReadinessGate {
  status: EnterpriseReadinessGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface EnterpriseReadinessEvidence {
  status: "passed" | "failed" | "not_verified";
  checkedAt: string | null;
  stale: boolean;
  claimAllowed: boolean;
  gates: Partial<Record<EnterpriseReadinessGateName, EnterpriseReadinessGate>>;
  failures: string[];
  message: string;
}

export interface JudgeGoldCase {
  id: string;
  category: string;
  input: Record<string, unknown>;
  expectedDecision: string;
}

export interface JudgeGoldStatus {
  approvable: boolean;
  signerConfigured: boolean;
  datasetVersion?: string;
  labelPolicy?: string;
  datasetHash?: string;
  reportHash?: string;
  cases: JudgeGoldCase[];
  gate: EnterpriseReadinessGate;
  approval?: {
    organizationId: string;
    reviewerId: string;
    reviewedAt: string;
    decision: "approved" | "revoked";
    reason: string;
    reviewedCaseCount: number;
    revokedAt: string | null;
    revokedBy: string | null;
    revokeReason: string | null;
    keyId: string;
    nonce: string;
  } | null;
}

export const enterpriseSloApi = {
  getReport: () => api.get<EnterpriseSloReport>("/enterprise-slo"),
  getReadinessGates: () =>
    api.get<EnterpriseReadinessEvidence>("/enterprise-slo/readiness-gates"),
  getJudgeGold: () =>
    api.get<JudgeGoldStatus>("/enterprise-slo/judge-gold"),
  approveJudgeGold: (payload: {
    datasetHash: string;
    reportHash: string;
    reviewedCaseIds: string[];
    reason: string;
    confirmation: string;
  }) => api.post<JudgeGoldStatus>("/enterprise-slo/judge-gold/approve", payload),
  revokeJudgeGold: (payload: { reason: string; confirmation: string }) =>
    api.post<JudgeGoldStatus>("/enterprise-slo/judge-gold/revoke", payload),
  collect: () => api.post<EnterpriseSloReport>("/enterprise-slo/collect"),
};
