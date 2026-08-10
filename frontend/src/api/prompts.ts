import { api } from './client';
import type { PromptItem } from '../types';

export interface PromptTemplate extends PromptItem {
  variables?: string[];
  updatedAt: string;
  createdAt: string;
}

export const promptsApi = {
  /** 提示词模板列表 */
  list: (params?: { page?: number; limit?: number; category?: string; starred?: boolean }) =>
    api.get<{ items: PromptTemplate[]; total: number }>('/prompts', { params }),

  /** 模板详情 */
  getById: (id: string) => api.get<PromptTemplate>(`/prompts/${id}`),

  /** 创建模板 */
  create: (data: Partial<PromptTemplate>) =>
    api.post<PromptTemplate>('/prompts', data),

  /** 更新模板 */
  update: (id: string, data: Partial<PromptTemplate>) =>
    api.patch<PromptTemplate>(`/prompts/${id}`, data),

  /** 删除模板 */
  delete: (id: string) => api.delete(`/prompts/${id}`),
};
