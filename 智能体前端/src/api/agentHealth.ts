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

export type AiChannelStatus =
  | 'available'
  | 'degraded'
  | 'quota_exhausted'
  | 'unavailable'
  | 'unconfigured'
  | 'unknown';

export interface AiChannelSnapshot {
  status: AiChannelStatus;
  provider: string | null;
  model?: string | null;
  errorCode: string | null;
  message: string | null;
  latencyMs: number | null;
}

export interface AgentChannelHealthSnapshot {
  agentConnection: 'connected' | 'unavailable' | 'unconfigured';
  overall: 'available' | 'degraded' | 'unavailable';
  checkedAt: string;
  cacheTtlSeconds: number;
  errorCode: string | null;
  llm: AiChannelSnapshot;
  image: AiChannelSnapshot;
  search: AiChannelSnapshot;
}

export const agentHealthApi = {
  get: () => api.get<AgentHealthSnapshot>('/agent-proxy/health'),
  getChannels: () =>
    api.get<AgentChannelHealthSnapshot>('/agent-console/channel-health'),
};
