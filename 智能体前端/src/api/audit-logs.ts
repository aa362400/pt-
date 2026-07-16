import { api } from './client';

export interface AuditLog {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: unknown;
  after?: unknown;
  sequence: string | null;
  previousHash?: string | null;
  entryHash?: string | null;
  hashAlgorithm?: string | null;
  createdAt: string;
}

export interface AuditIntegrityReport {
  valid: boolean;
  algorithm: string;
  totalEntries: number;
  chainedEntries: number;
  unchainedEntries: number;
  headMatches: boolean;
  lastSequence: string;
  lastHash: string;
  breaks: Array<{ id: string; sequence: string; reason: string }>;
  verifiedAt: string;
}

export type IncidentTimelineSelector =
  | { agentRunId: string }
  | { automationRunId: string }
  | { externalSubmissionId: string }
  | { productLaunchId: string }
  | { traceId: string };

export interface IncidentTimelineEvent {
  id: string;
  source: 'AGENT' | 'AUTOMATION' | 'OZON_SUBMISSION' | 'AUDIT';
  title: string;
  detail: string;
  status: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  occurredAt: string;
  correlation: Record<string, string>;
}

export interface IncidentTimeline {
  selector: IncidentTimelineSelector;
  summary: {
    status: 'STABLE' | 'NEEDS_ATTENTION';
    eventCount: number;
    sources: IncidentTimelineEvent['source'][];
    needsAttention: boolean;
    hasExternalWrite: boolean;
    generatedAt: string;
  };
  events: IncidentTimelineEvent[];
}

export const auditLogsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) =>
    api.get<{ items: AuditLog[]; total: number; page: number; limit: number }>('/audit-logs', { params }),

  getById: (id: string) => api.get<AuditLog>(`/audit-logs/${id}`),
  verifyIntegrity: () => api.get<AuditIntegrityReport>('/audit-logs/integrity'),
  incidentTimeline: (params: IncidentTimelineSelector) =>
    api.get<IncidentTimeline>('/audit-logs/incidents/timeline', { params }),
};
