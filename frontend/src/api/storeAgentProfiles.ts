import { api } from './client';

export interface StoreAgentProfile {
  workspaceId: string;
  targetCategories: string[];
  forbiddenTerms: string[];
  minimumProfitMargin: number | null;
  notes: string | null;
}

export interface UpdateStoreAgentProfileInput {
  targetCategories: string[];
  forbiddenTerms: string[];
  minimumProfitMargin: number | null;
  notes: string | null;
}

export const storeAgentProfilesApi = {
  get: (workspaceId: string) =>
    api.get<StoreAgentProfile>(`/store-agent-profiles/${workspaceId}`),
  update: (workspaceId: string, input: UpdateStoreAgentProfileInput) =>
    api.put<StoreAgentProfile>(`/store-agent-profiles/${workspaceId}`, input),
};
