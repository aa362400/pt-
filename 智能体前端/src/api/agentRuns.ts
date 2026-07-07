import { api } from './client';

export type AgentRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMEOUT';

export interface GeneratedImage {
  sceneId: string;
  filename: string;
  url: string;
}

export interface ImageGenerationOutput {
  sessionId: string;
  mockMode: boolean;
  images: GeneratedImage[];
  consistencyScore?: number | null;
  downloadUrl?: string;
}

export interface AgentRunProgress {
  status?: string;
  stage?: string | null;
  message?: string | null;
  at?: string;
}

export interface AgentRun {
  id: string;
  agentType: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: ImageGenerationOutput | null;
  /** 智能体 webhook 推送的实时进度快照（无 webhook 时为 null） */
  progress?: AgentRunProgress | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ImageGenerationInput {
  productName: string;
  imageBase64?: string;
  imageUrl?: string;
  sceneCount?: number;
  platforms?: string[];
  message?: string;
}

export function createImageGenerationRun(
  input: ImageGenerationInput,
): Promise<AgentRun> {
  return api.post<AgentRun>('/agent-runs', {
    agentType: 'IMAGE_CREATIVE',
    input,
  });
}

export function getAgentRun(id: string): Promise<AgentRun> {
  return api.get<AgentRun>(`/agent-runs/${id}`);
}
