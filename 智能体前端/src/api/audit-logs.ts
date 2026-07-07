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
  createdAt: string;
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
};
