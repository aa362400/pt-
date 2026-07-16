import { api } from "./client";

export type MemoryTrustStatus =
  "trusted" | "quarantined" | "superseded" | "revoked";

export interface MemoryGovernanceMetadata {
  sourceType?: string;
  sourceId?: string | null;
  version?: number;
  contentHash?: string;
  trustStatus?: MemoryTrustStatus;
  validFrom?: string;
  validUntil?: string | null;
  reasons?: string[];
  redactions?: number;
}

export interface GovernedMemoryItem {
  id: string;
  memoryType: "work" | "experience";
  workspaceId?: string | null;
  taskType?: string | null;
  productName?: string | null;
  status?: string;
  category?: string;
  title?: string;
  lesson?: string;
  reviewNotes?: string | null;
  createdAt: string;
  governance: MemoryGovernanceMetadata | null;
}

export interface MemoryGovernanceResponse {
  items: GovernedMemoryItem[];
  summary: {
    total: number;
    trusted: number;
    unverified: number;
    quarantined: number;
    superseded: number;
    revoked: number;
  };
}

export const memoryGovernanceApi = {
  list: (workspaceId?: string) =>
    api.get<MemoryGovernanceResponse>("/agent-memory-governance", {
      params: { workspaceId, limit: 100 },
    }),
  correctExperience: (id: string, body: { notes: string; reason: string }) =>
    api.patch<GovernedMemoryItem>(
      `/agent-memory-governance/experiences/${id}/correct`,
      body,
    ),
  revoke: (type: "work" | "experience", id: string, body: { reason: string }) =>
    api.delete<{ id: string; type: string; revoked: boolean }>(
      `/agent-memory-governance/${type}/${id}`,
      body,
    ),
};
