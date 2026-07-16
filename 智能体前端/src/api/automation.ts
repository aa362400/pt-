import { api } from "./client";
import type { AutomationFlow, StatusType } from "../types";

export type AutomationFlowStatus =
  "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";

export type AutomationTriggerType =
  "SCHEDULE" | "WEBHOOK" | "CONDITION" | "EVENT" | "MANUAL";

interface BackendAutomationFlow {
  id: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  status: AutomationFlowStatus;
  triggerType: AutomationTriggerType;
  triggerConfig?: Record<string, unknown> | null;
  steps?: unknown;
  successRate?: number | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    runs?: number;
  };
  runs?: Array<{
    id?: string;
    status?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    error?: Record<string, unknown> | null;
  }>;
}

interface BackendAutomationFlowList {
  items: BackendAutomationFlow[];
  total: number;
  page?: number;
  limit?: number;
}

export interface CreateAutomationFlowInput {
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  triggerConfig?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  status?: AutomationFlowStatus;
  workspaceId?: string;
  nextRunAt?: string;
}

export interface UpdateAutomationFlowInput {
  name?: string;
  description?: string;
  triggerType?: AutomationTriggerType;
  status?: AutomationFlowStatus;
  triggerConfig?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  nextRunAt?: string;
  workspaceId?: string;
}

export interface AutomationFlowDetail extends AutomationFlow {
  triggers: string[];
  actions: string[];
  lastRunOutput?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  flowId: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  idempotencyKey?: string;
  triggerSource?: string;
  triggerReason?: string | null;
  requestedBy?: string | null;
  parentRunId?: string | null;
  jobSnapshot?: Record<string, unknown> | null;
  idempotent?: boolean;
}

export interface AutomationExecutionRequest {
  reason: string;
  idempotencyKey: string;
}

export interface AutomationExecutionResponse {
  status: "queued" | "already_queued" | "already_created";
  action?: "automation.recover";
  flowId: string;
  automationRunId: string;
  idempotencyKey?: string;
  externalStoreMutation: "not_executed";
}

const statusMap: Record<AutomationFlowStatus, StatusType> = {
  DRAFT: "pending",
  ACTIVE: "running",
  PAUSED: "paused",
  ERROR: "danger",
  ARCHIVED: "warning",
};

function formatDate(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatRunCount(flow: BackendAutomationFlow): string {
  const runs = flow._count?.runs;
  if (typeof runs !== "number") return "未返回运行次数";
  return `${runs} 次运行`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatRunError(
  error: Record<string, unknown> | null | undefined,
): string | null {
  if (!error) return null;
  return asString(error.message) ?? JSON.stringify(error);
}

function mapFlow(flow: BackendAutomationFlow): AutomationFlow {
  const latestRun = Array.isArray(flow.runs) ? flow.runs[0] : undefined;
  const triggerConfig = asRecord(flow.triggerConfig);
  const automationSteps = Array.isArray(flow.steps)
    ? (flow.steps as Array<Record<string, unknown>>)
    : [];
  const agentBackoffUntil = asString(triggerConfig.agentProviderBackoffUntil);
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description ?? "",
    icon: "FileText",
    status: statusMap[flow.status] ?? "pending",
    channel: flow.triggerType,
    channelIcon: "FileText",
    runDuration: formatRunCount(flow),
    successRate:
      typeof flow.successRate === "number"
        ? Math.round(flow.successRate * 10) / 10
        : null,
    nextRun: formatDate(flow.nextRunAt, "未排期"),
    lastRun: formatDate(flow.lastRunAt, "未运行"),
    isEnabled: flow.status === "ACTIVE",
    latestRunId: latestRun?.id ?? null,
    latestRunStatus: latestRun?.status ?? null,
    latestRunError:
      formatRunError(latestRun?.error) ??
      asString(triggerConfig.lastFailureMessage),
    latestRunStartedAt: latestRun?.startedAt ?? null,
    latestRunFinishedAt: latestRun?.finishedAt ?? null,
    agentFailureClass: asString(triggerConfig.lastFailureClass),
    agentFailureStreak: asNumber(triggerConfig.agentProviderFailureStreak),
    agentBackoffUntil: agentBackoffUntil
      ? formatDate(agentBackoffUntil, agentBackoffUntil)
      : null,
    automationSteps,
    triggerConfig,
    backendStatus: flow.status,
    workspaceId: flow.workspaceId ?? null,
  };
}

function mapFlowDetail(flow: BackendAutomationFlow): AutomationFlowDetail {
  const mapped = mapFlow(flow);
  const steps = Array.isArray(flow.steps)
    ? (flow.steps as Array<Record<string, unknown>>)
    : [];

  return {
    ...mapped,
    triggers: [flow.triggerType],
    actions: steps.map((step, index) =>
      typeof step.action === "string" ? step.action : `step-${index + 1}`,
    ),
    createdAt: flow.createdAt ?? "",
    updatedAt: flow.updatedAt ?? flow.createdAt ?? "",
  };
}

export const automationApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: AutomationFlowStatus;
  }) => {
    const res = await api.get<BackendAutomationFlowList>("/automation/flows", {
      params,
    });
    return {
      ...res,
      items: res.items.map(mapFlow),
    };
  },

  getById: async (id: string) => {
    const flow = await api.get<BackendAutomationFlow>(
      `/automation/flows/${id}`,
    );
    return mapFlowDetail(flow);
  },

  create: async (data: CreateAutomationFlowInput) => {
    const flow = await api.post<BackendAutomationFlow>(
      "/automation/flows",
      data,
    );
    return mapFlow(flow);
  },

  update: async (id: string, data: UpdateAutomationFlowInput) => {
    const flow = await api.patch<BackendAutomationFlow>(
      `/automation/flows/${id}`,
      data,
    );
    return mapFlow(flow);
  },

  delete: (id: string) => api.delete<{ id: string }>(`/automation/flows/${id}`),

  triggerRun: (id: string, input: AutomationExecutionRequest) =>
    api.post<AutomationRun>(`/automation/flows/${id}/trigger`, input),

  recover: (
    id: string,
    input: AutomationExecutionRequest & { failedRunId: string },
  ) =>
    api.post<AutomationExecutionResponse>(
      `/automation/flows/${id}/recover`,
      input,
    ),

  listRuns: (id: string, params?: { page?: number; limit?: number }) =>
    api.get<{
      items: AutomationRun[];
      total: number;
      page?: number;
      limit?: number;
    }>(`/automation/flows/${id}/runs`, { params }),

  toggleEnabled: (id: string, isEnabled: boolean) =>
    automationApi.update(id, { status: isEnabled ? "ACTIVE" : "PAUSED" }),
};
