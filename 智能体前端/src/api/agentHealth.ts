import { api } from './client';

export type AgentLlmStatus =
  | 'available'
  | 'degraded'
  | 'quota_exhausted'
  | 'unavailable'
  | 'unknown';

export interface AgentHealthSnapshot {
  connection: 'connected' | 'unavailable' | 'unconfigured';
  integration: 'enabled' | 'disabled' | 'unknown';
  mockMode: boolean | null;
  checkedAt: string;
  latencyMs: number | null;
  llm: {
    status: AgentLlmStatus;
    model: string | null;
    keyRole: string | null;
    fallbackActive: boolean;
    lastSuccessAt?: string | null;
    lastFailureAt?: string | null;
    lastErrorCode?: string | null;
  };
}

export const agentHealthApi = {
  get: () => api.get<AgentHealthSnapshot>('/agent-proxy/health'),
};
