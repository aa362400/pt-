import { api } from "./client";

export interface AgentProxyPermission {
  allowed: boolean;
  level: number;
  requireConfirm: boolean;
}

export interface AgentProxyAction {
  name: string;
  permissionLevel: number;
  description: string;
  permission: AgentProxyPermission;
}

export interface AgentProxyActionsResponse {
  autonomyEnabled: boolean;
  actions: AgentProxyAction[];
}

export interface AgentProxyConsoleRequest {
  action: string;
  workspaceId?: string;
  params?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface AgentProxyConsoleResponse {
  dryRun?: boolean;
  status?: "executed" | "pending_confirmation" | string;
  action?: string;
  permission?: AgentProxyPermission;
  result?: unknown;
  notificationId?: string;
  requiresConfirmation?: boolean;
}

export interface McpToolRun {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  actorId: string;
  action: string;
  toolName: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface McpManifest {
  server: { name: string; version: string; protocolVersion: string };
  transport: "stdio";
  manifestHash: string;
  executableHash: string;
  discoveredAt: string;
  trust: {
    status: "trusted" | "blocked";
    integrityVerified: boolean;
    source: string;
    approvalType: string;
    approvedAt: string;
    expiresAt: string;
    signing: {
      algorithm: string;
      keyId: string;
      signatureVerified: boolean;
    };
    blockers: string[];
  };
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    action: string | null;
    permission: AgentProxyPermission | null;
    trust: {
      source: string;
      integrityVerified: boolean;
      manifestHash: string;
      executableHash: string;
      approvalType: string;
      approvalExpiresAt: string;
      signing: {
        algorithm: string;
        keyId: string;
        signatureVerified: boolean;
      };
      blockers: string[];
      outputInjectionPolicy: string;
    };
  }>;
}

export interface AgentCapabilityToken {
  id: string;
  workspaceId: string | null;
  actorId: string;
  actions: string[];
  description: string | null;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface IssuedAgentCapabilityToken extends AgentCapabilityToken {
  organizationId: string;
  token: string;
}

export const mcpToolsApi = {
  listActions: () => api.get<AgentProxyActionsResponse>("/agent-proxy/actions"),
  call: (body: AgentProxyConsoleRequest) =>
    api.post<AgentProxyConsoleResponse>("/agent-proxy/console", body),
  listRuns: (limit = 50) =>
    api.get<{ items: McpToolRun[]; total: number; limit: number }>(
      "/agent-proxy/mcp-runs",
      { params: { limit } },
    ),
  getManifest: () => api.get<McpManifest>("/agent-proxy/mcp-manifest"),
  listCapabilityTokens: () =>
    api.get<AgentCapabilityToken[]>("/agent-proxy/capability-tokens"),
  issueCapabilityToken: (body: {
    workspaceId?: string;
    actions: string[];
    ttlSeconds: number;
    description?: string;
  }) =>
    api.post<IssuedAgentCapabilityToken>(
      "/agent-proxy/capability-tokens",
      body,
    ),
  revokeCapabilityToken: (id: string) =>
    api.post<{ id: string; revoked: boolean }>(
      `/agent-proxy/capability-tokens/${id}/revoke`,
    ),
};
