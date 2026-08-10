import { api } from './client';

export type WorkspaceChannelType =
  | 'AMAZON_US'
  | 'AMAZON_EU'
  | 'AMAZON_JP'
  | 'AMAZON_AU'
  | 'SHOPIFY'
  | 'WOOCOMMERCE'
  | 'OZON'
  | 'TEMU'
  | 'MANUAL';

export interface WorkspaceSummary {
  id: string;
  name: string;
  channelType: WorkspaceChannelType;
  marketplace?: string | null;
  currency: string;
  timezone: string;
  status: string;
  createdAt: string;
  _count?: {
    products?: number;
    agentRuns?: number;
    listingDrafts?: number;
  };
}

export interface CreateWorkspaceInput {
  name: string;
  channelType: WorkspaceChannelType;
  marketplace?: string;
  currency?: string;
  timezone?: string;
}

export const workspacesApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<{ items: WorkspaceSummary[]; total: number; page: number; limit: number }>(
      '/workspaces',
      { params },
    ),

  create: (data: CreateWorkspaceInput) =>
    api.post<WorkspaceSummary>('/workspaces', data),

  getById: (id: string) => api.get<WorkspaceSummary>(`/workspaces/${id}`),
};
