import { api } from './client';

export interface AgentAutonomyMode {
  suggestionsEnabled: boolean;
  autoResearchAndDraftEnabled: boolean;
  externalWrites: 'human_confirmation_required';
  allowedAutomaticActions: string[];
  blockedAutomaticActions: string[];
}

export function getAgentAutonomyMode(): Promise<AgentAutonomyMode> {
  return api.get<AgentAutonomyMode>('/agent-autonomy/mode');
}

export function updateAgentAutonomyMode(
  autoResearchAndDraftEnabled: boolean,
): Promise<AgentAutonomyMode> {
  return api.patch<AgentAutonomyMode>('/agent-autonomy/mode', {
    autoResearchAndDraftEnabled,
  });
}
