import { api } from './client';
import type { AgentRun } from './agentRuns';
import type { AgentRoadmapOperationGuardrail } from './agentRoadmap';

export interface EnterpriseSpecialist {
  id: string;
  name: string;
  title: string;
  runtimeAgentType: string;
  capabilityIds: readonly string[];
  responsibilities: readonly string[];
  state: 'available' | 'partial' | 'blocked';
  blockers: string[];
}

export interface EnterpriseTeam {
  generatedAt: string;
  ceo: { id: string; name: string; runtimeAgentType: 'PLANNER'; responsibilities: string[] };
  specialists: EnterpriseSpecialist[];
  operationSafety: {
    connectedStoreChannels: number;
    externalWriteAdapterConnected: boolean;
    highRiskActionMode: 'human_confirmation_required';
    approvalNotificationKind: string;
    actions: AgentRoadmapOperationGuardrail[];
  };
}

export const enterpriseTeamApi = {
  get: () => api.get<EnterpriseTeam>('/enterprise-team'),
  launch: (input: { goal: string; workspaceId?: string; specialistIds: string[] }) =>
    api.post<{ run: AgentRun; selectedSpecialists: string[]; blockedSpecialists: string[] }>('/enterprise-team/objectives', input),
};
