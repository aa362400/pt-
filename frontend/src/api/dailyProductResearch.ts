import { api } from "./client";

export type DailyResearchStatus =
  "PENDING" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface DailyResearchRun {
  id: string;
  businessDate: string;
  scheduleTimezone: string;
  trigger: string;
  status: DailyResearchStatus;
  currentStage: string | null;
  partialData: boolean;
  candidateLimit: number;
  topLimit: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorSummary: { code?: string; message?: string } | null;
  scoringVersion?: { id: string; version: string };
  _count?: { candidates: number; artifacts: number; scores?: number };
  stages?: Array<{
    id: string;
    stage: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    metrics: { durationMs?: number | null } | null;
  }>;
}

export interface CandidateScore {
  id: string;
  decision: "TEST_NOW" | "WATCH" | "HOLD" | "REJECT";
  finalScore: string | number;
  rank: number | null;
  componentScores: Record<string, number | null>;
  hardGateReasons: string[];
  missingComponents: string[];
}

export interface CandidateSignal {
  id: string;
  source: string;
  provider: string;
  externalId: string | null;
  url: string | null;
  market: string | null;
  metricName: string;
  metricValue: string | number | null;
  unit: string | null;
  observedAt: string;
  fetchedAt: string;
  quality: string;
}

export interface DailyCandidate {
  id: string;
  canonicalName: string;
  productType: string;
  material: string | null;
  primaryUse: string | null;
  customizationMethod: string | null;
  targetAudience: string | null;
  status: string;
  signalStrength: string;
  confidenceScore: number;
  rawSummary: Record<string, unknown>;
  scores: CandidateScore[];
  risks: Array<{
    id: string;
    riskType: string;
    severity: string;
    evidence: Record<string, unknown>;
  }>;
  signals?: CandidateSignal[];
  _count?: { signals: number };
  capabilities: {
    allowedActions: string[];
    blockedActions: Array<{ action: string; reason: string }>;
    externalStoreMutation: false;
  };
}

export interface DailyCandidateDetail extends DailyCandidate {
  signals: CandidateSignal[];
}

export interface RatioMetric {
  value: number | null;
  numerator: number;
  denominator: number;
  reason: "DENOMINATOR_ZERO" | "REFUND_WINDOW_NOT_MATURE" | null;
}

export interface ProductPerformance {
  candidateId: string;
  asOf: string;
  coverage: "COMPLETE" | "PARTIAL" | "SYNCING" | "FAILED" | "NOT_AVAILABLE";
  sampleSize: number;
  cohort: {
    startedAt: string;
    ageDays: number;
    refundMaturityDays: number;
    refundMature: boolean;
  };
  funnel: {
    impressions: number;
    clicks: number;
    favorites: number;
    carts: number;
    orders: number;
    refundedOrders: number;
    clickThroughRate: RatioMetric;
    favoriteRate: RatioMetric;
    addToCartRate: RatioMetric;
    orderRate: RatioMetric;
    refundRate: RatioMetric;
  };
  financials: {
    actualKnownRevenueByCurrency: Record<string, number>;
    actualKnownProfitByCurrency: Record<string, number>;
    adSpendByCurrency: Record<string, number>;
    costAdjustmentsByCurrency: Record<string, number>;
    estimatedFullyLoadedProfit: null;
    estimatedProfitReason: string;
  };
}

export interface SourceHealth {
  id: string;
  source: string;
  status: string;
  attempts: number;
  requestedAt: string | null;
  finishedAt: string | null;
  lastSuccessAt: string | null;
  itemCount: number;
  latencyMs: number | null;
  dataFreshnessSeconds: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ResearchArtifact {
  id: string;
  artifactType: string;
  schemaVersion: string;
  contentHash: string;
  byteSize: number;
  createdAt: string;
}

export interface ScoringVersion {
  id: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  weights: Record<string, number>;
  thresholds: Record<string, number | string>;
  reason: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface DailyResearchSchedule {
  enabled: boolean;
  flowId: string | null;
  nextRunAt: string | null;
  runtime: {
    mode: "DISABLED" | "DRY_RUN" | "SHADOW" | "PILOT" | "GENERAL";
    schedulerAllowed: boolean;
    realConnectorsAllowed: boolean;
    internalActionsAllowed: boolean;
    visibleToMembers: boolean;
    externalStoreMutation: false;
  };
  triggerConfig: { dailyAt?: string; timezone?: string; source?: string };
}

interface PageResponse<T> {
  schemaVersion: string;
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const dailyProductResearchApi = {
  listRuns: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<PageResponse<DailyResearchRun>>("/daily-product-research/runs", {
      params,
    }),
  getRun: (id: string) =>
    api.get<{ schemaVersion: string; run: DailyResearchRun }>(
      `/daily-product-research/runs/${encodeURIComponent(id)}`,
    ),
  startManual: (
    input: {
      businessDate?: string;
      timezone?: string;
      candidateLimit?: number;
      topLimit?: number;
      inputCandidates?: unknown[];
    } = {},
  ) =>
    api.post<{ schemaVersion: string; run: DailyResearchRun; reused: boolean }>(
      "/daily-product-research/runs/manual",
      input,
    ),
  cancelRun: (id: string) =>
    api.post<DailyResearchRun>(
      `/daily-product-research/runs/${encodeURIComponent(id)}/cancel`,
      {},
    ),
  listCandidates: (
    runId: string,
    params?: {
      page?: number;
      limit?: number;
      decision?: string;
      search?: string;
    },
  ) =>
    api.get<PageResponse<DailyCandidate>>(
      `/daily-product-research/runs/${encodeURIComponent(runId)}/candidates`,
      { params },
    ),
  getCandidate: (id: string) =>
    api.get<{
      schemaVersion: string;
      candidate: DailyCandidateDetail;
      capabilities: DailyCandidate["capabilities"];
    }>(`/daily-product-research/candidates/${encodeURIComponent(id)}`),
  candidatePerformance: (id: string) =>
    api.get<ProductPerformance>(
      `/daily-product-research/candidates/${encodeURIComponent(id)}/performance`,
    ),
  sourceHealth: (runId: string) =>
    api.get<{ schemaVersion: string; items: SourceHealth[] }>(
      `/daily-product-research/runs/${encodeURIComponent(runId)}/source-health`,
    ),
  artifacts: (runId: string) =>
    api.get<{ schemaVersion: string; items: ResearchArtifact[] }>(
      `/daily-product-research/runs/${encodeURIComponent(runId)}/artifacts`,
    ),
  artifactContent: (runId: string, artifactId: string) =>
    api.get<{
      schemaVersion: string;
      artifact: ResearchArtifact & { content: string };
    }>(
      `/daily-product-research/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`,
    ),
  listScoringVersions: () =>
    api.get<{ schemaVersion: string; items: ScoringVersion[] }>(
      "/daily-product-research/scoring-versions",
    ),
  getSchedule: () =>
    api.get<DailyResearchSchedule>("/daily-product-research/schedule"),
  updateSchedule: (input: {
    enabled: boolean;
    localTime: string;
    timezone: string;
  }) =>
    api.put<DailyResearchSchedule>("/daily-product-research/schedule", input),
  approveDevelopment: (candidateId: string, reason: string) =>
    api.post(
      `/daily-product-research/candidates/${encodeURIComponent(candidateId)}/approve-development`,
      { reason },
    ),
  rejectCandidate: (candidateId: string, reason: string) =>
    api.post(
      `/daily-product-research/candidates/${encodeURIComponent(candidateId)}/reject`,
      { reason },
    ),
};
