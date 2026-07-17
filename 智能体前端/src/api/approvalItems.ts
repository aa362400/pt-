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

async function listAllApprovalItems(params?: { status?: ApprovalItemStatus }) {
  const limit = 100;
  const items: ApprovalItem[] = [];
  for (let page = 1; page <= 1000; page += 1) {
    const batch = await api.get<ApprovalItem[]>('/approval-items', {
      params: { ...params, page, limit },
    });
    items.push(...batch);
    if (batch.length < limit) return items;
  }
  throw new Error('操作审批数量超过安全分页上限，未展示不完整统计。');
}

export const approvalItemsApi = {
  list: (params?: { status?: ApprovalItemStatus; page?: number; limit?: number }) =>
    api.get<ApprovalItem[]>('/approval-items', { params }),

  listAll: listAllApprovalItems,

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
