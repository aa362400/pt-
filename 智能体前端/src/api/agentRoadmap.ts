import { api } from './client';

export type AgentRoadmapStatus = 'passed' | 'partial' | 'backend' | 'missing';
export type AgentRoadmapCheckStatus = 'ok' | 'warn' | 'down';

export interface AgentRoadmapLiveCheck {
  key: string;
  label: string;
  status: AgentRoadmapCheckStatus;
  detail: string;
}

export type AgentRoadmapApprovalStatus = 'notification_center_ready';
export type AgentRoadmapExternalExecutionStatus =
  | 'guarded_adapter_connected'
  | 'not_connected';

export interface AgentRoadmapOperationGuardrail {
  key: string;
  label: string;
  action: string;
  approvalStatus: AgentRoadmapApprovalStatus;
  externalExecutionStatus: AgentRoadmapExternalExecutionStatus;
  notificationKind: string;
  detail: string;
}

export interface AgentRoadmapPhase {
  id: number;
  title: string;
  wave: string;
  priority: 'P0' | 'P1';
  status: AgentRoadmapStatus;
  visibleSurface: string;
  strictFinding: string;
  nextAction: string;
  evidence: string[];
  blockers: string[];
  linkedSurfaces: string[];
}

export interface AgentRoadmapReport {
  generatedAt: string;
  source: 'backend-live' | 'frontend-fallback';
  organizationId: string;
  contract: {
    version: string;
    taskTypes: string[];
    providerTaskTypes: string[];
  };
  summary: {
    totals: Record<AgentRoadmapStatus, number>;
    completionScore: number;
  };
  operationSafety: {
    connectedStoreChannels: number;
    externalWriteAdapterConnected: boolean;
    highRiskActionMode: 'human_confirmation_required';
    approvalNotificationKind: string;
    actions: AgentRoadmapOperationGuardrail[];
  };
  metrics: {
    agentRunTotal: number;
    agentRunCompleted: number;
    agentRunFailed: number;
    agentRunRunning: number;
    agentRunSuccessRate: number | null;
    scoredWorkMemories: number;
    qualityPassRate: number | null;
    workMemories: number;
    experienceCards: number;
    readinessSamples: number;
    readinessPassedSamples: number;
    readinessConsecutivePassedDays: number;
    readinessLatestPassedDate: string | null;
    suggestionsCreated: number;
    suggestionsScheduled: number;
    unauthorizedAgentActions: number;
    deadLetterJobs: number;
    unresolvedDeadLetterJobs: number;
    reviewScoredTasks: number;
    reviewAutoApprovedTasks: number;
    reviewRegenerationTasks: number;
    toolRegistryActions: number;
    toolRegistryPermissionLevels: number;
    agentProxyCoveredActions: number;
    agentProxyUncoveredActions: string[];
    capacityReportAvailable: boolean;
    capacityReportSummary: string;
  };
  liveChecks: AgentRoadmapLiveCheck[];
  phases: AgentRoadmapPhase[];
}

export interface AgentRoadmapAcceptanceRun {
  mutationPerformed: false;
  message: string;
  report: AgentRoadmapReport;
}

export function getAgentRoadmap(): Promise<AgentRoadmapReport> {
  return api.get<AgentRoadmapReport>('/agent-roadmap');
}

export function runAgentRoadmapAcceptanceEvidence(): Promise<AgentRoadmapAcceptanceRun> {
  return api.post<AgentRoadmapAcceptanceRun>('/agent-roadmap/acceptance-run');
}
