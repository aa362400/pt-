import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Clock, Play, Workflow } from "lucide-react";
import {
  automationApi,
  type AutomationFlowDetail,
  type AutomationFlowStatus,
  type AutomationTriggerType,
  type CreateAutomationFlowInput,
} from "../api/automation";
import type { AutomationFlow as ApiAutomationFlow } from "../types";
import {
  AutomationFlow,
  type AutomationFlowItem,
  type AutomationTemplate,
} from "../figma-exact/AutomationFlow";
import Modal from "../components/ui/Modal";
import { useToast } from "../components/ui/use-toast";
import { workspacesApi } from "../api/workspaces";
import {
  automationWorkspaceReducer,
  createDefaultFlowForm,
  createInitialAutomationWorkspaceState,
  selectAutomationDetail,
  selectAutomationRuns,
  type FlowFormState,
  type SupportedAutomationAction as SupportedAction,
} from "../state/automation-workspace-state";
import {
  automationActionLabel,
  automationBackendStatusLabel,
  automationCardStatus,
  automationEnableBlockReason,
  automationExecutionBlockReason,
  automationFlowText,
  automationProviderLabel,
  automationRunBlockReason,
  automationRunSourceLabel,
  automationRunStatusLabel,
  automationTriggerLabel,
} from "../utils/automation-presentation";

const actionOptions: Array<{
  value: SupportedAction;
  label: string;
  description: string;
}> = [
  {
    value: "product.research",
    label: "真实选品调研",
    description: "读取公开证据，证据不足时阻断报告。",
  },
  {
    value: "listing.draft",
    label: "创建本地刊登草稿",
    description: "只创建本地草稿，不直接写入 Ozon。",
  },
  {
    value: "profit.calculate",
    label: "利润核算",
    description: "按售价和成本计算本地利润结果。",
  },
  {
    value: "task.create",
    label: "创建本地任务",
    description: "创建待办任务，不执行外部平台动作。",
  },
  {
    value: "image.prompt",
    label: "生成图片方案",
    description: "生成图片提示词，出图与发布仍需人工确认。",
  },
];

const automationTemplates: AutomationTemplate[] = [
  {
    id: "daily-research",
    name: "每日 Ozon 选品调研",
    description: "定时读取公开证据，证据不足时自动阻断报告。",
    safety: "只读调研",
  },
  {
    id: "research-to-draft",
    name: "选品后创建本地草稿",
    description: "先完成真实调研，再创建本地刊登草稿并进入人工审核。",
    safety: "不自动上架",
  },
  {
    id: "image-review",
    name: "商品图片方案审核",
    description: "生成图片方案和提示词，图片生成与发布仍需人工确认。",
    safety: "人工确认",
  },
];

const runStatusTones: Record<string, string> = {
  PENDING: "text-amber-700",
  RUNNING: "text-blue-700",
  COMPLETED: "text-emerald-700",
  PARTIAL: "text-amber-700",
  FAILED: "text-red-700",
};

type RunIntent = {
  flowId: string;
  flowName: string;
  mode: "run" | "recover";
  failedRunId: string | null;
  reason: string;
  idempotencyKey: string;
};

function createIdempotencyKey(scope: string): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${randomPart}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumberString(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

function validUiTrigger(value: string | undefined): AutomationTriggerType {
  return value === "SCHEDULE" || value === "MANUAL" ? value : "MANUAL";
}

function supportedAction(value: string | undefined): SupportedAction {
  return actionOptions.some((option) => option.value === value)
    ? (value as SupportedAction)
    : "product.research";
}

function formatError(error: unknown): string {
  const record = asRecord(error);
  return asString(record.message) || "后端未返回详细失败原因";
}

function mapFlow(flow: ApiAutomationFlow): AutomationFlowItem {
  const status = automationCardStatus(flow.backendStatus, flow.latestRunStatus);
  const failed = status === "error";
  const presentation = automationFlowText({
    source: asString(flow.triggerConfig?.source),
    name: flow.name,
    description: flow.description,
  });
  const steps = (flow.automationSteps ?? []).map((step) => {
    const action = asString(step.action);
    return {
      name: automationActionLabel(action || null),
      type:
        step.requiresConfirmation === true ||
        step.mode === "manual_confirmation"
          ? ("approval" as const)
          : ("action" as const),
      status: failed
        ? "waiting"
        : flow.latestRunStatus === "COMPLETED"
          ? "success"
          : "pending",
    };
  });
  const provider = asString(flow.triggerConfig?.provider);
  const executionConfiguration = {
    triggerType: flow.channel,
    triggerConfig: flow.triggerConfig,
    steps: flow.automationSteps,
    workspaceId: flow.workspaceId,
  };
  return {
    id: flow.id,
    name: presentation.name,
    description: presentation.description,
    status,
    trigger: flow.channel,
    platform: provider
      ? `${automationProviderLabel(provider)} / 本地执行器`
      : "本地执行器",
    executionCount: flow.runDuration,
    successRate:
      flow.successRate === null ? "暂无样本" : `${flow.successRate}%`,
    lastRun: flow.lastRun,
    steps,
    createdBy: "后端记录",
    createdAt: flow.lastRun,
    enableBlockedReason: automationEnableBlockReason(executionConfiguration),
    runBlockedReason: automationRunBlockReason({
      ...executionConfiguration,
      backendStatus: flow.backendStatus,
      latestRunStatus: flow.latestRunStatus,
      latestRunId: flow.latestRunId,
    }),
  };
}

function buildStep(form: FlowFormState): Record<string, unknown> {
  const base = { action: form.action, platform: "OZON" };
  if (form.action === "product.research") {
    return {
      ...base,
      query: form.query.trim() || "Ozon 高潜商品机会",
      targets: [form.query.trim() || "Ozon 高潜商品机会"],
    };
  }
  if (form.action === "listing.draft") {
    return {
      ...base,
      productName: form.productName.trim(),
      requiresConfirmation: true,
    };
  }
  if (form.action === "profit.calculate") {
    return {
      ...base,
      salePrice: Number(form.salePrice),
      productCost: Number(form.productCost),
    };
  }
  if (form.action === "task.create") {
    return { ...base, title: form.query.trim() || form.name.trim() };
  }
  return {
    ...base,
    productName: form.productName.trim(),
    prompt: form.query.trim() || undefined,
    requiresConfirmation: true,
  };
}

function buildSteps(form: FlowFormState): Array<Record<string, unknown>> {
  if (form.templateId === "research-to-draft") {
    return [
      {
        key: "research",
        action: "product.research",
        platform: "OZON",
        workspaceId: form.workspaceId || undefined,
        query: form.query.trim() || "Ozon 高潜商品机会",
        targets: [form.query.trim() || "Ozon 高潜商品机会"],
      },
      {
        key: "draft",
        dependsOn: ["research"],
        action: "listing.draft",
        platform: "OZON",
        workspaceId: form.workspaceId,
        productName:
          form.productName.trim() ||
          `${form.query.trim() || "Ozon 高潜"}候选商品`,
      },
    ];
  }

  const nextStep = {
    ...buildStep(form),
    ...(form.workspaceId ? { workspaceId: form.workspaceId } : {}),
  };
  if (form.existingSteps.length === 0) return [nextStep];

  const first = form.existingSteps[0];
  return [
    {
      ...(typeof first.key === "string" ? { key: first.key } : {}),
      ...(Array.isArray(first.dependsOn) ? { dependsOn: first.dependsOn } : {}),
      ...nextStep,
    },
    ...form.existingSteps.slice(1),
  ];
}

function validateActivation(detail: AutomationFlowDetail): string | null {
  return automationEnableBlockReason({
    triggerType: detail.triggers[0],
    triggerConfig: detail.triggerConfig,
    steps: detail.automationSteps,
    workspaceId: detail.workspaceId,
  });
}

function validateExecution(detail: AutomationFlowDetail): string | null {
  return automationExecutionBlockReason({
    triggerType: detail.triggers[0],
    steps: detail.automationSteps,
    workspaceId: detail.workspaceId,
  });
}

export default function AutomationFlowV2() {
  const { addToast } = useToast();
  const [state, dispatch] = useReducer(
    automationWorkspaceReducer,
    createInitialAutomationWorkspaceState(),
  );
  const flowListRequestId = useRef(0);
  const workspaceRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const delayedRefreshTimer = useRef<number | null>(null);
  const sourceFlows = state.server.flows;
  const workspaces = state.server.workspaces;
  const loading = state.server.listLoading;
  const busyAction =
    state.optimistic.pending?.key ??
    (state.server.detailLoading
      ? `${state.server.detailLoading.intent}:${state.server.detailLoading.flowId}`
      : null);
  const { form, editingId } = state.draft;
  const { formOpen } = state.view;
  const detail = selectAutomationDetail(state);
  const runCollection = selectAutomationRuns(state);
  const runs = runCollection.items;
  const runTotal = runCollection.total;
  const [runIntent, setRunIntent] = useState<RunIntent | null>(null);
  const detailPresentation = useMemo(
    () =>
      detail
        ? automationFlowText({
            source: asString(detail.triggerConfig?.source),
            name: detail.name,
            description: detail.description,
          })
        : null,
    [detail],
  );

  const load = useCallback(async () => {
    const requestId = ++flowListRequestId.current;
    dispatch({ type: "flows-requested", requestId });
    try {
      const response = await automationApi.list({ limit: 100 });
      dispatch({ type: "flows-succeeded", requestId, flows: response.items });
    } catch (error) {
      if (requestId !== flowListRequestId.current) return;
      const message =
        error instanceof Error ? error.message : "自动化流程读取失败";
      dispatch({ type: "flows-failed", requestId, error: message });
      addToast(message, "error");
    }
  }, [addToast]);

  useEffect(() => {
    void load();
    return () => {
      flowListRequestId.current += 1;
      detailRequestId.current += 1;
      if (delayedRefreshTimer.current !== null) {
        window.clearTimeout(delayedRefreshTimer.current);
      }
    };
  }, [load]);

  useEffect(() => {
    const requestId = ++workspaceRequestId.current;
    dispatch({ type: "workspaces-requested", requestId });
    void workspacesApi.list({ limit: 100 }).then(
      (response) =>
        dispatch({
          type: "workspaces-succeeded",
          requestId,
          workspaces: response.items,
        }),
      (error: unknown) =>
        dispatch({
          type: "workspaces-failed",
          requestId,
          error: error instanceof Error ? error.message : "工作区读取失败",
        }),
    );
    return () => {
      workspaceRequestId.current += 1;
    };
  }, []);

  const automationFlows = useMemo(
    () => sourceFlows.map(mapFlow),
    [sourceFlows],
  );
  const rates = sourceFlows
    .map((flow) => flow.successRate)
    .filter((value): value is number => typeof value === "number");
  const averageRate = rates.length
    ? rates.reduce((sum, value) => sum + value, 0) / rates.length
    : null;
  const stats = [
    {
      label: "已启用流程",
      value: String(sourceFlows.filter((flow) => flow.isEnabled).length),
      icon: Workflow,
      color: "text-blue-600",
    },
    {
      label: "真实流程总数",
      value: String(sourceFlows.length),
      icon: Play,
      color: "text-emerald-600",
    },
    {
      label: "平均成功率",
      value: averageRate === null ? "暂无样本" : `${averageRate.toFixed(1)}%`,
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    {
      label: "失败待恢复",
      value: String(
        sourceFlows.filter((flow) => flow.latestRunStatus === "FAILED").length,
      ),
      icon: Clock,
      color: "text-amber-600",
    },
  ];

  const openCreate = () => {
    const ozonWorkspace = workspaces.find(
      (workspace) =>
        workspace.channelType === "OZON" || workspace.marketplace === "OZON",
    );
    dispatch({
      type: "editor-opened",
      editingId: null,
      form: {
        ...createDefaultFlowForm(),
        workspaceId: ozonWorkspace?.id ?? "",
      },
    });
  };

  const handleTemplate = (template: AutomationTemplate) => {
    const ozonWorkspace = workspaces.find(
      (workspace) =>
        workspace.channelType === "OZON" || workspace.marketplace === "OZON",
    );
    dispatch({
      type: "editor-opened",
      editingId: null,
      form: {
        ...createDefaultFlowForm(),
        name: template.name,
        description: template.description,
        triggerType: template.id === "daily-research" ? "SCHEDULE" : "MANUAL",
        action:
          template.id === "image-review" ? "image.prompt" : "product.research",
        query: template.id === "image-review" ? "" : "Ozon 高潜商品机会",
        workspaceId: ozonWorkspace?.id ?? "",
        templateId: template.id,
      },
    });
  };

  const handleView = async (id: string) => {
    const requestId = ++detailRequestId.current;
    dispatch({
      type: "detail-requested",
      requestId,
      flowId: id,
      intent: "view",
    });
    try {
      const [nextDetail, runResponse] = await Promise.all([
        automationApi.getById(id),
        automationApi.listRuns(id, { limit: 10 }),
      ]);
      dispatch({
        type: "detail-succeeded",
        requestId,
        flowId: id,
        intent: "view",
        detail: nextDetail,
        runs: { items: runResponse.items, total: runResponse.total },
      });
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      const message =
        error instanceof Error ? error.message : "流程详情读取失败";
      dispatch({ type: "detail-failed", requestId, error: message });
      addToast(message, "error");
    }
  };

  const handleEdit = async (id: string) => {
    const requestId = ++detailRequestId.current;
    dispatch({
      type: "detail-requested",
      requestId,
      flowId: id,
      intent: "edit",
    });
    try {
      const nextDetail = await automationApi.getById(id);
      const step = nextDetail.automationSteps?.[0] ?? {};
      const triggerConfig = nextDetail.triggerConfig ?? {};
      const editablePresentation = automationFlowText({
        source: asString(triggerConfig.source),
        name: nextDetail.name,
        description: nextDetail.description,
      });
      const editForm: FlowFormState = {
        name: editablePresentation.name,
        description: editablePresentation.description,
        triggerType: validUiTrigger(nextDetail.triggers[0]),
        status:
          nextDetail.backendStatus === "DRAFT" ||
          nextDetail.backendStatus === "ACTIVE" ||
          nextDetail.backendStatus === "PAUSED"
            ? nextDetail.backendStatus
            : nextDetail.isEnabled
              ? "ACTIVE"
              : "PAUSED",
        intervalMinutes:
          typeof triggerConfig.intervalMinutes === "number"
            ? String(triggerConfig.intervalMinutes)
            : "1440",
        action: supportedAction(asString(step.action)),
        query:
          asString(step.query) ||
          asString(step.prompt) ||
          asString(triggerConfig.defaultResearchQuery),
        productName: asString(step.productName),
        salePrice: asNumberString(step.salePrice),
        productCost: asNumberString(step.productCost),
        workspaceId: nextDetail.workspaceId ?? asString(step.workspaceId),
        triggerConfig,
        existingSteps: nextDetail.automationSteps ?? [],
        templateId: null,
      };
      dispatch({
        type: "detail-succeeded",
        requestId,
        flowId: id,
        intent: "edit",
        detail: nextDetail,
        editForm,
      });
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      const message =
        error instanceof Error ? error.message : "流程编辑数据读取失败";
      dispatch({ type: "detail-failed", requestId, error: message });
      addToast(message, "error");
    }
  };

  const handleCopy = async (id: string) => {
    const operationKey = `copy:${id}`;
    dispatch({
      type: "operation-started",
      pending: {
        key: operationKey,
        flowId: id,
        operation: "copy",
        startedAt: Date.now(),
      },
    });
    try {
      const source = await automationApi.getById(id);
      const sourcePresentation = automationFlowText({
        source: asString(source.triggerConfig?.source),
        name: source.name,
        description: source.description,
      });
      const created = await automationApi.create({
        name: `${sourcePresentation.name} - 副本`,
        description: sourcePresentation.description,
        triggerType: validUiTrigger(source.triggers[0]),
        status: "DRAFT",
        ...(source.workspaceId ? { workspaceId: source.workspaceId } : {}),
        triggerConfig: {
          ...(source.triggerConfig ?? {}),
          source: "copied_flow",
          copiedFrom: id,
        },
        steps: source.automationSteps ?? [],
      });
      dispatch({ type: "server-flow-received", flow: created });
      addToast("流程已复制为新草稿，不会自动运行。", "success");
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "流程复制失败",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const operationKey = `toggle:${id}`;
    dispatch({
      type: "operation-started",
      pending: {
        key: operationKey,
        flowId: id,
        operation: active ? "enable" : "pause",
        startedAt: Date.now(),
      },
    });
    try {
      let flowDetail: AutomationFlowDetail | null = null;
      if (active) {
        flowDetail = await automationApi.getById(id);
        const activationError = validateActivation(flowDetail);
        if (activationError) {
          addToast(activationError, "error");
          return;
        }
      }
      const updated =
        active && flowDetail?.triggers[0] === "SCHEDULE"
          ? await automationApi.update(id, {
              status: "ACTIVE",
              nextRunAt: new Date().toISOString(),
            })
          : await automationApi.toggleEnabled(id, active);
      dispatch({ type: "server-flow-received", flow: updated });
      addToast(
        active ? "流程已启用。" : "流程已停用，运行与审计记录已保留。",
        "success",
      );
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "流程状态更新失败",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const handleRun = (id: string) => {
    const flow = sourceFlows.find((item) => item.id === id);
    const presentedFlow = automationFlows.find((item) => item.id === id);
    if (!flow) return;
    if (presentedFlow?.runBlockedReason) {
      addToast(`暂不可运行：${presentedFlow.runBlockedReason}`, "error");
      return;
    }
    const mode = flow.latestRunStatus === "FAILED" ? "recover" : "run";
    if (mode === "recover" && !flow.latestRunId) {
      addToast("后端没有返回可恢复的失败运行编号，不能创建恢复任务。", "error");
      return;
    }
    setRunIntent({
      flowId: id,
      flowName:
        presentedFlow?.name ??
        automationFlowText({
          source: asString(flow.triggerConfig?.source),
          name: flow.name,
          description: flow.description,
        }).name,
      mode,
      failedRunId: flow.latestRunId ?? null,
      reason: "",
      idempotencyKey: createIdempotencyKey(`${mode}-${id}`),
    });
  };

  const submitRunIntent = async () => {
    if (!runIntent) return;
    const reason = runIntent.reason.trim();
    if (reason.length < 8) {
      addToast("请填写至少 8 个字的运行原因。", "error");
      return;
    }
    const operationKey = `run:${runIntent.flowId}`;
    dispatch({
      type: "operation-started",
      pending: {
        key: operationKey,
        flowId: runIntent.flowId,
        operation: runIntent.mode,
        startedAt: Date.now(),
      },
    });
    try {
      const flowDetail = await automationApi.getById(runIntent.flowId);
      const activationError = validateExecution(flowDetail);
      if (activationError) {
        addToast(`无法运行：${activationError}`, "error");
        return;
      }
      if (runIntent.mode === "recover") {
        if (!runIntent.failedRunId) {
          addToast("缺少失败运行编号，恢复操作已阻断。", "error");
          return;
        }
        const recovery = await automationApi.recover(runIntent.flowId, {
          failedRunId: runIntent.failedRunId,
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          recovery.status === "already_queued"
            ? "恢复任务已在队列中，没有重复创建。"
            : recovery.status === "already_created"
              ? "相同恢复申请已存在，没有重复创建。"
              : "已创建新的恢复运行，原失败记录继续保留。",
          "success",
        );
      } else {
        const run = await automationApi.triggerRun(runIntent.flowId, {
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          run.idempotent
            ? "相同运行申请已存在，没有重复入队。"
            : "已提交真实运行，正在等待本地执行器处理。",
          "success",
        );
      }
      setRunIntent(null);
      await load();
      if (delayedRefreshTimer.current !== null) {
        window.clearTimeout(delayedRefreshTimer.current);
      }
      delayedRefreshTimer.current = window.setTimeout(() => {
        delayedRefreshTimer.current = null;
        void load();
      }, 2000);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "流程运行失败",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const validateForm = (): string | null => {
    if (!form.name.trim()) return "请填写流程名称。";
    if (form.triggerType === "SCHEDULE") {
      const interval = Number(form.intervalMinutes);
      if (!Number.isFinite(interval) || interval < 5)
        return "自动排期间隔不能少于 5 分钟。";
    }
    if (form.action === "listing.draft" || form.action === "image.prompt") {
      if (!form.productName.trim()) return "该执行步骤必须填写商品名称。";
    }
    if (
      (form.action === "listing.draft" ||
        form.templateId === "research-to-draft") &&
      !form.workspaceId
    ) {
      return "创建刊登草稿必须选择一个工作区。";
    }
    if (form.action === "profit.calculate") {
      const salePrice = Number(form.salePrice);
      const productCost = Number(form.productCost);
      if (
        !form.salePrice.trim() ||
        !form.productCost.trim() ||
        !Number.isFinite(salePrice) ||
        salePrice <= 0 ||
        !Number.isFinite(productCost) ||
        productCost < 0
      ) {
        return "利润核算必须填写大于 0 的售价和不小于 0 的成本。";
      }
    }
    return null;
  };

  const submitForm = async () => {
    const validationError = validateForm();
    if (validationError) {
      addToast(validationError, "error");
      return;
    }
    const operationKey = "form:page";
    dispatch({
      type: "operation-started",
      pending: {
        key: operationKey,
        flowId: editingId,
        operation: editingId ? "update" : "create",
        startedAt: Date.now(),
      },
    });
    const intervalMinutes = Number(form.intervalMinutes);
    const payload: CreateAutomationFlowInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      triggerType: form.triggerType,
      status: form.status,
      ...(form.workspaceId ? { workspaceId: form.workspaceId } : {}),
      triggerConfig: {
        ...form.triggerConfig,
        source: "automation_v2_ui",
        provider: "OZON",
        ...(form.triggerType === "SCHEDULE" ? { intervalMinutes } : {}),
        ...(form.query.trim()
          ? { defaultResearchQuery: form.query.trim() }
          : {}),
      },
      steps: buildSteps(form),
      ...(form.triggerType === "SCHEDULE" && form.status === "ACTIVE"
        ? { nextRunAt: new Date().toISOString() }
        : {}),
    };
    try {
      if (editingId) {
        const updated = await automationApi.update(editingId, payload);
        dispatch({ type: "server-flow-received", flow: updated });
        addToast("流程已真实更新到后端。", "success");
      } else {
        const created = await automationApi.create(payload);
        dispatch({ type: "server-flow-received", flow: created });
        addToast("流程已真实创建。", "success");
      }
      dispatch({ type: "editor-closed" });
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "流程保存失败",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  return (
    <>
      <div>
        <div
          role="note"
          aria-label="流程数据保留说明"
          className="mx-auto mb-3 max-w-7xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          <span className="font-semibold">停用并保留记录：</span>
          需要停止流程时，请使用流程卡片的暂停按钮。运行与审计记录会继续保留，客户页面不提供删除历史记录的普通入口。
        </div>
        <AutomationFlow
          automationFlows={automationFlows}
          stats={stats}
          templates={automationTemplates}
          loading={loading}
          busyAction={busyAction}
          onCreate={openCreate}
          onCreateTemplate={(template) => void handleTemplate(template)}
          onRefresh={() => void load()}
          onView={(id) => void handleView(id)}
          onEdit={(id) => void handleEdit(id)}
          onCopy={(id) => void handleCopy(id)}
          onRun={handleRun}
          onToggle={(id, active) => void handleToggle(id, active)}
        />
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          if (busyAction !== "form:page") dispatch({ type: "editor-closed" });
        }}
        title={editingId ? "编辑自动化流程" : "创建自动化流程"}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
            当前只允许配置本地执行器
            已注册步骤。发布、改价、库存和退款不会在这里自动执行。
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                流程名称
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: { name: event.target.value },
                  })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                placeholder="例如：每日 Ozon 选品调研"
              />
            </label>
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                流程说明
              </span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: { description: event.target.value },
                  })
                }
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="说明这个流程解决什么问题"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-gray-700">
                触发方式
              </span>
              <select
                value={form.triggerType}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: {
                      triggerType: event.target.value as AutomationTriggerType,
                    },
                  })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="MANUAL">手动运行</option>
                <option value="SCHEDULE">自动排期</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-gray-700">
                流程状态
              </span>
              <select
                value={form.status}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: {
                      status: event.target.value as AutomationFlowStatus,
                    },
                  })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="DRAFT">保存为草稿</option>
                <option value="ACTIVE">启用</option>
                <option value="PAUSED">暂停</option>
              </select>
            </label>
            {form.triggerType === "SCHEDULE" ? (
              <label>
                <span className="text-sm font-semibold text-gray-700">
                  执行间隔（分钟）
                </span>
                <input
                  value={form.intervalMinutes}
                  onChange={(event) =>
                    dispatch({
                      type: "form-patched",
                      patch: { intervalMinutes: event.target.value },
                    })
                  }
                  inputMode="numeric"
                  className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                />
              </label>
            ) : null}
            <label
              className={form.triggerType === "SCHEDULE" ? "" : "md:col-span-2"}
            >
              <span className="text-sm font-semibold text-gray-700">
                工作区
              </span>
              <select
                value={form.workspaceId}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: { workspaceId: event.target.value },
                  })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">不绑定工作区</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ·{" "}
                    {automationProviderLabel(
                      workspace.channelType ?? workspace.marketplace,
                    )}
                  </option>
                ))}
              </select>
              {!workspaces.length ? (
                <span className="mt-1 block text-xs text-amber-700">
                  尚未读取到工作区；刊登草稿流程暂时不能启用。
                </span>
              ) : null}
            </label>
            <label
              className={form.triggerType === "SCHEDULE" ? "" : "md:col-span-2"}
            >
              <span className="text-sm font-semibold text-gray-700">
                执行步骤
              </span>
              <select
                value={form.action}
                disabled={form.templateId === "research-to-draft"}
                onChange={(event) =>
                  dispatch({
                    type: "form-patched",
                    patch: {
                      action: event.target.value as SupportedAction,
                      templateId: null,
                    },
                  })
                }
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-100"
              >
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs leading-5 text-gray-500">
                {
                  actionOptions.find((option) => option.value === form.action)
                    ?.description
                }
              </span>
              {form.templateId === "research-to-draft" ? (
                <span className="mt-1 block text-xs font-semibold text-blue-700">
                  此模板包含两步：真实调研 →
                  调研通过后创建本地草稿。调研不足会阻断第二步。
                </span>
              ) : null}
            </label>
            {form.action === "product.research" ||
            form.action === "task.create" ||
            form.action === "image.prompt" ? (
              <label className="md:col-span-2">
                <span className="text-sm font-semibold text-gray-700">
                  {form.action === "product.research"
                    ? "调研关键词"
                    : form.action === "task.create"
                      ? "任务内容"
                      : "图片要求"}
                </span>
                <input
                  value={form.query}
                  onChange={(event) =>
                    dispatch({
                      type: "form-patched",
                      patch: { query: event.target.value },
                    })
                  }
                  className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  placeholder={
                    form.action === "product.research"
                      ? "例如：汽车风扇"
                      : "填写具体要求"
                  }
                />
              </label>
            ) : null}
            {form.action === "listing.draft" ||
            form.action === "image.prompt" ||
            form.templateId === "research-to-draft" ? (
              <label className="md:col-span-2">
                <span className="text-sm font-semibold text-gray-700">
                  {form.templateId === "research-to-draft"
                    ? "候选草稿名称（可选）"
                    : "商品名称"}
                </span>
                <input
                  value={form.productName}
                  onChange={(event) =>
                    dispatch({
                      type: "form-patched",
                      patch: { productName: event.target.value },
                    })
                  }
                  className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  placeholder={
                    form.templateId === "research-to-draft"
                      ? "不填时使用调研关键词生成候选草稿名称"
                      : "必须填写真实商品名称"
                  }
                />
              </label>
            ) : null}
            {form.action === "profit.calculate" ? (
              <>
                <label>
                  <span className="text-sm font-semibold text-gray-700">
                    销售价格
                  </span>
                  <input
                    value={form.salePrice}
                    onChange={(event) =>
                      dispatch({
                        type: "form-patched",
                        patch: { salePrice: event.target.value },
                      })
                    }
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-gray-700">
                    商品成本
                  </span>
                  <input
                    value={form.productCost}
                    onChange={(event) =>
                      dispatch({
                        type: "form-patched",
                        patch: { productCost: event.target.value },
                      })
                    }
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => dispatch({ type: "editor-closed" })}
              disabled={busyAction === "form:page"}
              className="h-10 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void submitForm()}
              disabled={busyAction === "form:page"}
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busyAction === "form:page" ? "保存中…" : "保存流程"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() =>
          dispatch({
            type: "detail-closed",
            invalidationRequestId: ++detailRequestId.current,
          })
        }
        title="流程详情与运行记录"
        width="max-w-3xl"
      >
        {detail ? (
          <div className="space-y-5">
            <section>
              <h4 className="text-base font-bold text-gray-900">
                {detailPresentation?.name}
              </h4>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {detailPresentation?.description}
              </p>
              <dl className="mt-4 grid gap-3 bg-gray-50 p-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-500">当前状态</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {automationBackendStatusLabel(detail.backendStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">触发方式</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.triggers
                      .map((item) => automationTriggerLabel(item))
                      .join("、") || "触发方式未提供"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">运行总数</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {runTotal} 次
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700">执行步骤</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.actions.length ? (
                    detail.actions.map((action, index) => (
                      <span
                        key={`${action}-${index}`}
                        className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      >
                        {index + 1}. {automationActionLabel(action)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">尚未配置步骤</span>
                  )}
                </div>
              </div>
            </section>
            <section className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-bold text-gray-900">最近运行记录</h4>
              <div className="mt-3 space-y-2">
                {runs.length ? (
                  runs.map((run) => {
                    const status = {
                      label: automationRunStatusLabel(run.status),
                      tone: runStatusTones[run.status] ?? "text-gray-700",
                    };
                    return (
                      <div key={run.id} className="border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${status.tone}`}
                          >
                            {status.label}
                          </span>
                          <time className="text-xs text-gray-500">
                            {new Date(run.startedAt).toLocaleString("zh-CN", {
                              hour12: false,
                            })}
                          </time>
                        </div>
                        <dl className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                          <div>
                            <dt className="text-gray-500">触发方式</dt>
                            <dd className="mt-0.5 font-medium text-gray-800">
                              {automationRunSourceLabel(run.triggerSource)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-gray-500">重复执行保护</dt>
                            <dd className="mt-0.5 font-medium text-emerald-700">
                              {run.idempotencyKey ? "已启用" : "历史记录未标记"}
                            </dd>
                          </div>
                        </dl>
                        {run.triggerReason ? (
                          <p className="mt-2 text-xs leading-5 text-gray-700">
                            执行原因：{run.triggerReason}
                          </p>
                        ) : null}
                        {run.parentRunId ? (
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            此任务用于恢复一条失败记录，原失败记录仍保留在审计历史中。
                          </p>
                        ) : null}
                        {run.error ? (
                          <p className="mt-2 text-xs leading-5 text-red-700">
                            失败原因：{formatError(run.error)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-sm text-gray-500">
                    尚无真实运行记录
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(runIntent)}
        onClose={() => {
          if (!runIntent || busyAction !== `run:${runIntent.flowId}`) {
            setRunIntent(null);
          }
        }}
        title={
          runIntent?.mode === "recover"
            ? "确认恢复自动化流程"
            : "确认运行自动化流程"
        }
      >
        {runIntent ? (
          <div className="space-y-4">
            <div className="border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800">
              <div className="font-semibold">{runIntent.flowName}</div>
              <div>
                {runIntent.mode === "recover"
                  ? "将创建新的恢复运行，原失败记录不会被改写。"
                  : "将把当前流程提交给本地执行器执行。"}
              </div>
              <div>发布、改价、库存和退款仍需单独人工批准。</div>
            </div>
            <label className="block text-sm font-semibold text-gray-700">
              {runIntent.mode === "recover" ? "恢复原因" : "运行原因"}
              <textarea
                value={runIntent.reason}
                onChange={(event) =>
                  setRunIntent((current) =>
                    current
                      ? { ...current, reason: event.target.value }
                      : current,
                  )
                }
                rows={4}
                placeholder={
                  runIntent.mode === "recover"
                    ? "说明已核对的失败原因，以及为什么现在可以恢复"
                    : "说明本次运行要完成的业务目标"
                }
                className="mt-2 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <p className="text-xs leading-5 text-gray-500">
              本次确认会固定防重复编号；网络重试不会创建第二次运行。
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setRunIntent(null)}
                disabled={busyAction === `run:${runIntent.flowId}`}
                className="h-10 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitRunIntent()}
                disabled={
                  runIntent.reason.trim().length < 8 ||
                  busyAction === `run:${runIntent.flowId}`
                }
                className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === `run:${runIntent.flowId}`
                  ? "提交中…"
                  : runIntent.mode === "recover"
                    ? "确认恢复"
                    : "确认运行"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
