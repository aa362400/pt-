import { api } from './client';
import type { ApprovalExecutionResponse } from './approval-execution';

export type ApprovalItemStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'UNKNOWN'
  | 'APPROVED'
  | 'EXECUTED'
  | 'DISMISSED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'FAILED'
  | 'EXPIRED';

export interface ApprovalDecision {
  id: string;
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'OVERRIDE';
  actorId: string;
  actorRole: string;
  reason?: string | null;
  payloadHash: string;
  sandboxReportId?: string | null;
  createdAt: string;
}

export interface ApprovalItem {
  id: string;
  organizationId: string;
  notificationId: string;
  requestedBy: string;
  approverId: string;
  source: string;
  action: string;
  params: Record<string, unknown>;
  context: Record<string, unknown>;
  payloadHash: string;
  status: ApprovalItemStatus;
  result?: unknown;
  error?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  notification: {
    id: string;
    title: string;
    body?: string | null;
    metadata?: unknown;
    readAt?: string | null;
  };
  decisions: ApprovalDecision[];
}

export const approvalItemsApi = {
  list: (params?: { status?: ApprovalItemStatus; page?: number; limit?: number }) =>
    api.get<ApprovalItem[]>('/approval-items', { params }),

  getById: (id: string) => api.get<ApprovalItem>(`/approval-items/${id}`),

  approve: (id: string, data: { reason?: string; sandboxReportId?: string } = {}) =>
    api.post<ApprovalExecutionResponse>(`/approval-items/${id}/approve`, data),

  reject: (id: string, data: { reason: string; sandboxReportId?: string }) =>
    api.post<ApprovalItem>(`/approval-items/${id}/reject`, data),

  requestChanges: (id: string, data: { reason: string; sandboxReportId?: string }) =>
    api.post<ApprovalItem>(`/approval-items/${id}/request-changes`, data),

  override: (id: string, data: { reason: string; sandboxReportId: string }) =>
    api.post<ApprovalItem>(`/approval-items/${id}/override`, data),
};
