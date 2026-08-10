import { api } from "./client";

export type AgentRunStatus =
  | "PENDING"
  | "ENQUEUING"
  | "QUEUED"
  | "RUNNING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | "DEAD_LETTERED";

export type AgentLifecycleStatus =
  | "CREATED"
  | "PLANNING"
  | "WAITING_TOOL"
  | "WAITING_APPROVAL"
  | "EXECUTING"
  | "VERIFYING"
  | "RETRY_SCHEDULED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const AGENT_LIFECYCLE_STATUS_LABELS: Record<
  AgentLifecycleStatus,
  string
> = {
  CREATED: "english_text",
  PLANNING: "english_text",
  WAITING_TOOL: "english_text",
  WAITING_APPROVAL: "texthumantext",
  EXECUTING: "english_text",
  VERIFYING: "english_text",
  RETRY_SCHEDULED: "english_text",
  COMPLETED: "textcompleted",
  FAILED: "textfailed",
  CANCELLED: "english_text",
};

export type AgentType =
  | "PRODUCT_RESEARCHER"
  | "LISTING_OPTIMIZER"
  | "ADVERTISING_STRATEGIST"
  | "PROFIT_ANALYST"
  | "CUSTOMER_INSIGHT"
  | "CONTENT_WRITER"
  | "KEYWORD_EXPLORER"
  | "GENERAL_ASSISTANT"
  | "IMAGE_CREATIVE"
  | "PLANNER";

export interface GeneratedImage {
  sceneId: string;
  filename: string;
  url: string;
  background?: string;
  props?: string[];
  lighting?: string;
  emotion?: string;
  composition?: string;
  prompt?: string;
}

export interface SceneDesignCard {
  sceneId: string;
  background: string;
  props: string[];
  lighting: string;
  emotion: string;
  composition: string;
}

export interface ImageGenerationOutput {
  sessionId: string;
  mockMode: boolean;
  supervisionApproved: boolean;
  publishable: boolean;
  images: GeneratedImage[];
  consistencyScore?: number | null;
  downloadUrl?: string;
  profile?: {
    scenePlan: SceneDesignCard[];
  } | null;
  scenePlan?: SceneDesignCard[];
}

export interface AgentRunProgress {
  status?: string;
  stage?: string | null;
  message?: string | null;
  at?: string;
}

export interface AgentRun<TOutput = ImageGenerationOutput> {
  id: string;
  agentType: string;
  status: AgentRunStatus;
  lifecycleStatus: AgentLifecycleStatus;
  version: number;
  currentStep?: string | null;
  traceId?: string | null;
  input: Record<string, unknown>;
  output: TOutput | null;
  /** agent webhook english_text（none webhook text null） */
  progress?: AgentRunProgress | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface AgentTransition {
  id: string;
  fromStatus: AgentLifecycleStatus | null;
  toStatus: AgentLifecycleStatus;
  eventType: string;
  eventKey: string;
  payload: Record<string, unknown>;
  attempt: number;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  stepKey: string;
  status: string;
  attempt: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface AgentRunTimeline<TOutput = Record<string, unknown>> {
  run: AgentRun<TOutput>;
  transitions: AgentTransition[];
  steps: AgentStep[];
}

export interface AgentRunPage<TOutput = Record<string, unknown>> {
  items: AgentRun<TOutput>[];
  total: number;
  page: number;
  limit: number;
}

const AGENT_RUN_ERROR_LABELS: Record<string, string> = {
  MODEL_PROVIDER_QUOTA_EXHAUSTED:
    "textyestextsecretenglish_text，english_textconfigurationtextsecret。",
  MODEL_PROVIDER_FALLBACK_EXHAUSTED:
    "english_text，textsecretenglish_text。",
  IMAGE_PROVIDER_QUOTA_EXHAUSTED:
    "textyesimagetextsecretenglish_text，english_textconfigurationtextsecret。",
  IMAGE_PROVIDER_FALLBACK_EXHAUSTED:
    "textimageenglish_text，textsecretenglish_textimageenglish_text。",
  AGENT_RETRYING: "agentenglish_text，english_text。",
};

export function agentRunFailureMessage(
  run: Pick<AgentRun, "errorCode" | "errorMessage">,
  fallback = "Agent tasktextfailed",
): string {
  if (run.errorCode && AGENT_RUN_ERROR_LABELS[run.errorCode]) {
    return AGENT_RUN_ERROR_LABELS[run.errorCode];
  }
  return run.errorMessage || fallback;
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
  return api.post<AgentRun>("/agent-runs", {
    agentType: "IMAGE_CREATIVE",
    input,
  });
}

export function createAgentRun<TOutput = Record<string, unknown>>(
  agentType: AgentType,
  input: Record<string, unknown>,
): Promise<AgentRun<TOutput>> {
  return api.post<AgentRun<TOutput>>("/agent-runs", {
    agentType,
    input,
  });
}

export function getAgentRun<TOutput = ImageGenerationOutput>(
  id: string,
): Promise<AgentRun<TOutput>> {
  return api.get<AgentRun<TOutput>>(`/agent-runs/${id}`);
}

export function listAgentRuns<TOutput = Record<string, unknown>>(
  page = 1,
  limit = 10,
): Promise<AgentRunPage<TOutput>> {
  return api.get<AgentRunPage<TOutput>>(
    `/agent-runs?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`,
  );
}

export function getAgentRunTimeline<TOutput = Record<string, unknown>>(
  id: string,
): Promise<AgentRunTimeline<TOutput>> {
  return api.get<AgentRunTimeline<TOutput>>(`/agent-runs/${id}/timeline`);
}

export function cancelAgentRun(
  id: string,
  requestId: string,
): Promise<unknown> {
  return api.post(`/agent-runs/${id}/cancel`, { requestId });
}

export function retryAgentRun<TOutput = Record<string, unknown>>(
  id: string,
  requestId: string,
): Promise<AgentRun<TOutput>> {
  return api.post<AgentRun<TOutput>>(`/agent-runs/${id}/retry`, {
    requestId,
  });
}

export async function waitForAgentRun<TOutput = Record<string, unknown>>(
  id: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<AgentRun<TOutput>> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const run = await getAgentRun<TOutput>(id);
    if (
      run.status === "COMPLETED" ||
      run.lifecycleStatus === "COMPLETED"
    ) {
      return run;
    }
    if (
      ["FAILED", "CANCELLED", "TIMEOUT", "DEAD_LETTERED"].includes(
        run.status,
      ) ||
      ["FAILED", "CANCELLED"].includes(run.lifecycleStatus)
    ) {
      throw new Error(agentRunFailureMessage(run));
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  throw new Error("Agent run timed out");
}
