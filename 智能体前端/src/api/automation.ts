import { api } from './client';
import type { AutomationFlow } from '../types';

export interface AutomationFlowDetail extends AutomationFlow {
  triggers: string[];
  actions: string[];
  lastRunOutput?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const automationApi = {
  /** 自动化流程列表 */
  list: (params?: { page?: number; limit?: number; status?: string; channel?: string }) =>
    api.get<{ items: AutomationFlow[]; total: number }>('/automation/flows', { params }),

  /** 流程详情 */
  getById: (id: string) =>
    api.get<AutomationFlowDetail>(`/automation/flows/${id}`),

  /** 创建流程 */
  create: (data: Partial<AutomationFlow>) =>
    api.post<AutomationFlow>('/automation/flows', data),

  /** 更新流程 */
  update: (id: string, data: Partial<AutomationFlow>) =>
    api.patch<AutomationFlow>(`/automation/flows/${id}`, data),

  /** 删除流程 */
  delete: (id: string) => api.delete(`/automation/flows/${id}`),

  /** 触发立即运行 */
  triggerRun: (id: string) =>
    api.post<{ runId: string; status: string }>(`/automation/flows/${id}/trigger`),

  /** 切换启用/停用 */
  toggleEnabled: (id: string, isEnabled: boolean) =>
    api.patch<AutomationFlow>(`/automation/flows/${id}`, { isEnabled }),
};
