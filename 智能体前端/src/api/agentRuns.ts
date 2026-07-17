import { api } from "./client";
import { customerErrorPresentation } from "../utils/customer-facing-language";

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
  CREATED: "已创建",
  PLANNING: "正在规划",
  WAITING_TOOL: "等待工具返回",
  WAITING_APPROVAL: "等待人工批准",
  EXECUTING: "正在执行",
  VERIFYING: "正在核验结果",
  RETRY_SCHEDULED: "已安排重试",
  COMPLETED: "已完成",
  FAILED: "执行失败",
  CANCELLED: "已取消",
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
  /** 智能体 webhook 推送的实时进度快照（无 webhook 时为 null） */
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
    "所有模型密钥额度不足，请充值或配置可用密钥。",
  MODEL_PROVIDER_FALLBACK_EXHAUSTED:
    "主模型额度不足，备用密钥或备用模型也不可用。",
  IMAGE_PROVIDER_QUOTA_EXHAUSTED:
    "所有图片模型密钥额度不足，请充值或配置可用密钥。",
  IMAGE_PROVIDER_FALLBACK_EXHAUSTED:
    "主图片模型额度不足，备用密钥或备用图片模型也不可用。",
  DATA_INSUFFICIENT: "任务缺少可核验的数据，已安全停止。",
  PRICING_DATA_INSUFFICIENT: "核价所需的成本或费用证据不足，已安全停止。",
  EVIDENCE_INSUFFICIENT: "任务缺少完整来源证据，已安全停止。",
  AGENT_RETRYING: "智能体正在重试，请稍候。",
};

export function agentRunFailureMessage(
  run: Pick<AgentRun, "errorCode" | "errorMessage">,
  fallback = "Agent 任务执行失败",
): string {
  if (run.errorCode && AGENT_RUN_ERROR_LABELS[run.errorCode]) {
    return AGENT_RUN_ERROR_LABELS[run.errorCode];
  }
  if (run.errorCode) {
    const presentation = customerErrorPresentation(run.errorCode, run.errorMessage);
    return `${presentation.title}：${presentation.reason} ${presentation.action}`;
  }
  if (run.errorMessage && /[\u3400-\u9fff]/u.test(run.errorMessage) && !/\n\s*at\s/u.test(run.errorMessage)) {
    return run.errorMessage.slice(0, 240);
  }
  return fallback;
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
