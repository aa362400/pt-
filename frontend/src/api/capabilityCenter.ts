import { api } from './client';
import type { AgentRoadmapOperationGuardrail, AgentRoadmapStatus } from './agentRoadmap';

export type CapabilityRisk = 'read_only' | 'local_write' | 'human_confirmation' | 'not_connected';

export interface PlatformCapability {
  id: string;
  label: string;
  category: 'text' | 'product' | 'text' | 'store' | 'Agent' | 'text';
  summary: string;
  frontendPath: string;
  operationPath?: string;
  backendEndpoints: string[];
  agentPhaseIds: number[];
  risk: CapabilityRisk;
  frontendState: 'connected';
  backendState: 'connected' | 'not_connected';
  agentState: AgentRoadmapStatus;
  overallState: AgentRoadmapStatus;
  evidence: string[];
  blockers: string[];
}

export interface CapabilityCenterReport {
  generatedAt: string;
  source: 'backend-live';
  operationSafety: {
    connectedStoreChannels: number;
    externalWriteAdapterConnected: boolean;
    highRiskActionMode: 'human_confirmation_required';
    approvalNotificationKind: string;
    actions: AgentRoadmapOperationGuardrail[];
  };
  summary: {
    total: number;
    passed: number;
    partial: number;
    backendOnly: number;
    missing: number;
  };
  items: PlatformCapability[];
}

export const capabilityCenterApi = {
  get: () => api.get<CapabilityCenterReport>('/capability-center'),
};
