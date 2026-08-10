import { api } from "./client";
import type { AgentType } from "./agentRuns";

export type EvidenceStatus = "COMPLETE" | "PARTIAL" | "NO_SAMPLE";
export type PromptVersionStatus =
  | "DRAFT"
  | "CHALLENGER"
  | "CHAMPION"
  | "RETIRED";

export interface RatioMetric {
  value: number | null;
  numerator: number;
  denominator: number;
  reason: "DENOMINATOR_ZERO" | null;
}

export interface AgentScorecardScores {
  version: string;
  sampleSize: number;
  coverage: number;
  status: EvidenceStatus;
  quality: {
    proposalAcceptRate: RatioMetric;
    sandboxBlockRate: RatioMetric;
    manualEditRate: RatioMetric;
    firstPassPublishSuccessRate: RatioMetric;
  };
  efficiency: {
    runCompletionSecondsP50: number | null;
    runCompletionSecondsP95: number | null;
  };
  stability: {
    completionRate: RatioMetric;
    failureRate: RatioMetric;
    retryRate: RatioMetric;
    toolFailureRate: RatioMetric;
  };
  attribution: {
    feedbackCoverage: RatioMetric;
    routeCoverage: RatioMetric;
    attributedRunCount: number;
    routeDecisionCount: number;
  };
}

export interface AgentEvalSnapshot {
  id: string;
  agentType: AgentType;
  windowStart: string;
  windowEnd: string;
  scores: AgentScorecardScores;
  sampleSize: number;
  coverage: number;
  version: string;
  createdAt: string;
}

export interface FeedbackSignal {
  id: string;
  runId?: string | null;
  approvalId?: string | null;
  listingId?: string | null;
  snapshotId?: string | null;
  agentType?: AgentType | null;
  signalType: string;
  source: string;
  externalReference: string;
  value: Record<string, unknown>;
  createdAt: string;
}

export interface PromptVersion {
  id: string;
  agentType: AgentType;
  version: string;
  templateRef: string;
  contentHash: string;
  routingWeight: number;
  status: PromptVersionStatus;
  activatedAt?: string | null;
  createdAt: string;
}

export interface RouterDecision {
  id: string;
  runId: string;
  agentType: AgentType;
  selectedModel: string;
  selectedPromptVersion?: string | null;
  latencyMs?: number | null;
  qualityScore?: number | null;
  reason: Record<string, unknown>;
  createdAt: string;
}

export const agentEvaluationApi = {
  listScorecards: (agentType?: AgentType) =>
    api.get<AgentEvalSnapshot[]>("/agent-evals/scorecards", {
      params: { agentType },
    }),

  aggregate: (agentType: AgentType, from: string, to: string) =>
    api.post<AgentEvalSnapshot>("/agent-evals/aggregate", {
      agentType,
      from,
      to,
    }),

  listFeedback: (agentType?: AgentType, limit = 50) =>
    api.get<FeedbackSignal[]>("/feedback-signals", {
      params: { agentType, limit },
    }),

  createCorrection: (input: {
    runId: string;
    listingId?: string;
    agentType: AgentType;
    field: string;
    reason: string;
    before?: string;
    after?: string;
  }) =>
    api.post<{ reused: boolean; signal: FeedbackSignal }>("/feedback-signals", {
      signalType: "USER_CORRECTION",
      source: "AGENT_QUALITY_UI",
      externalReference: `manual-correction:${input.runId}:${Date.now()}`,
      runId: input.runId,
      listingId: input.listingId || undefined,
      agentType: input.agentType,
      value: {
        field: input.field,
        reason: input.reason,
        before: input.before || null,
        after: input.after || null,
      },
    }),

  listPromptVersions: (agentType?: AgentType) =>
    api.get<PromptVersion[]>("/prompt-versions", {
      params: { agentType },
    }),

  updatePromptStatus: (
    id: string,
    status: PromptVersionStatus,
    reason: string,
    routingWeight?: number,
  ) =>
    api.post<PromptVersion>(`/prompt-versions/${id}/status`, {
      status,
      reason,
      routingWeight,
    }),

  listRouterDecisions: (agentType?: AgentType) =>
    api.get<RouterDecision[]>("/agent-evals/router-decisions", {
      params: { agentType },
    }),
};
