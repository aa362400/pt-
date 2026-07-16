import { api } from "./client";

export interface AgentToolDefinition {
  name: string;
  version: string;
  description: string;
  category: string;
  requiredLevel: number;
  riskLevel: "READ_ONLY" | "LOW" | "HIGH";
  requiresHumanApproval: boolean;
}

export interface AgentToolExecution {
  id: string;
  toolName: string;
  toolVersion: string;
  status: string;
  riskLevel: string;
  input: Record<string, unknown>;
  output: unknown;
  error: { message?: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentPlan {
  id: string;
  goal: string;
  status: string;
  createdAt: string;
  executions: AgentToolExecution[];
}

export interface AgentMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentConversation {
  id: string;
  title: string;
  contextType: string;
  autonomyLevel: number;
  allowedDomains: string[];
  createdAt: string;
  updatedAt: string;
  messages?: AgentMessage[];
  plans?: AgentPlan[];
  _count?: { messages: number };
}

export interface AgentAutonomyPolicy {
  id: string | null;
  scopeKey: string;
  level: number;
  allowedTools: string[];
  deniedTools: string[];
  highRiskApproval: boolean;
  source: "system_default" | "organization" | "user_override";
}

export const agentConsoleApi = {
  listConversations: () =>
    api.get<{ items: AgentConversation[]; total: number }>(
      "/agent-conversations",
      { params: { page: 1, limit: 50 } },
    ),
  getConversation: (id: string) =>
    api.get<AgentConversation>(`/agent-conversations/${id}`),
  createConversation: (body: {
    title: string;
    autonomyLevel: number;
    contextType?: string;
  }) => api.post<AgentConversation>("/agent-conversations", body),
  postMessage: (id: string, content: string) =>
    api.post<{ userMessage: AgentMessage; assistantMessage: AgentMessage }>(
      `/agent-conversations/${id}/messages`,
      { content },
    ),
  createPlan: (
    id: string,
    body: {
      goal: string;
      steps: Array<{ toolName: string; input: Record<string, unknown> }>;
    },
  ) => api.post<AgentPlan>(`/agent-conversations/${id}/plan`, body),
  executePlan: (id: string) =>
    api.post<AgentPlan>(`/agent-plans/${id}/execute`),
  pausePlan: (id: string) => api.post<AgentPlan>(`/agent-plans/${id}/pause`),
  resumePlan: (id: string) => api.post<AgentPlan>(`/agent-plans/${id}/resume`),
  cancelPlan: (id: string) => api.post<AgentPlan>(`/agent-plans/${id}/cancel`),
  retryExecution: (id: string) =>
    api.post<AgentPlan>(`/agent-tool-executions/${id}/retry`),
  listTools: () => api.get<{ items: AgentToolDefinition[] }>("/agent-tools"),
  getPolicy: () => api.get<AgentAutonomyPolicy>("/agent-autonomy/policy"),
};
