import { api } from './client';

export type SopStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Sop {
  id: string;
  title: string;
  description?: string | null;
  status: SopStatus;
  steps: Array<Record<string, unknown>>;
  createdBy: string;
  publishedAt?: string | null;
  createdAt: string;
  creator?: {
    id: string;
    name: string | null;
  };
}

export const sopsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: SopStatus;
    search?: string;
  }) =>
    api.get<{ items: Sop[]; total: number; page: number; limit: number }>(
      '/sops',
      { params },
    ),
};
