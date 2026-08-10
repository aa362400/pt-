import { api } from './client';
import type { PromptItem } from '../types';

export interface PromptTemplate extends PromptItem {
  variables?: string[];
  updatedAt: string;
  createdAt: string;
}

export const promptsApi = {
  /** english_texttemplatetext */
  list: (params?: { page?: number; limit?: number; category?: string; starred?: boolean }) =>
    api.get<{ items: PromptTemplate[]; total: number }>('/prompts', { params }),

  /** templatetext */
  getById: (id: string) => api.get<PromptTemplate>(`/prompts/${id}`),

  /** texttemplate */
  create: (data: Partial<PromptTemplate>) =>
    api.post<PromptTemplate>('/prompts', data),

  /** texttemplate */
  update: (id: string, data: Partial<PromptTemplate>) =>
    api.patch<PromptTemplate>(`/prompts/${id}`, data),

  /** texttemplate */
  delete: (id: string) => api.delete(`/prompts/${id}`),
};
