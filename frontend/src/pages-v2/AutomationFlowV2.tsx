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
  selectDeleteFlow,
  type FlowFormState,
  type SupportedAutomationAction as SupportedAction,
} from "../state/automation-workspace-state";

const actionOptions: Array<{
  value: SupportedAction;
  label: string;
  description: string;
}> = [
  {
    value: "product.research",
    label: "realproduct researchtext",
    description: "readpublicevidence，evidenceenglish_textreport。",
  },
  {
    value: "listing.draft",
    label: "textlocalenglish_text",
    description: "english_textlocaltext，english_textwrite Ozon。",
  },
  {
    value: "profit.calculate",
    label: "profittext",
    description: "textpricetextcosttextlocalprofittext。",
  },
  {
    value: "task.create",
    label: "textlocaltask",
    description: "english_texttask，english_textplatformtext。",
  },
  {
    value: "image.prompt",
    label: "generationimageplan",
    description: "generationimageenglish_text，english_textpublishtexthumantext。",
  },
];

const automationTemplates: AutomationTemplate[] = [
  {
    id: "daily-research",
    name: "text Ozon product researchtext",
    description: "textreadpublicevidence，evidenceenglish_textautomatictextreport。",
    safety: "english_text",
  },
  {
    id: "research-to-draft",
    name: "product researchenglish_textlocaltext",
    description: "textcompletedrealtext，english_textlocalenglish_texthumanreview。",
    safety: "textautomaticlisting",
  },
  {
    id: "image-review",
    name: "productimageplanreview",
    description: "generationimageplanenglish_text，imagegenerationtextpublishtexthumantext。",
    safety: "humantext",
  },
];

const actionLabels: Record<string, string> = {
  "product.research": "realproduct researchtext",
  product_research: "realproduct researchtext",
  "product.research.daily": "textproduct researchtext",
  "listing.draft": "textlocalenglish_text",
  "listing.generate": "generationenglish_text",
  listing_generation: "generationenglish_text",
  generate_listing: "generationenglish_text",
  "profit.analyze": "profittext",
  "profit.calculate": "profittext",
  profit_calculation: "profittext",
  "task.create": "textlocaltask",
  create_task: "textlocaltask",
  "image.prompt": "generationimageplan",
  image_prompt: "generationimageplan",
  "image.generate": "generationproductimage",
  image_generation: "generationproductimage",
  generate_images: "generationproductimage",
  "listing.publish": "texthumantextpublish",
};

const runStatusLabels: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "english_text", tone: "text-amber-700" },
  RUNNING: { label: "english_text", tone: "text-blue-700" },
  COMPLETED: { label: "textcompleted", tone: "text-emerald-700" },
  PARTIAL: { label: "textcompleted", tone: "text-amber-700" },
  FAILED: { label: "textfailed", tone: "text-red-700" },
};

const runSourceLabels: Record<string, string> = {
  manual: "humantext",
  schedule: "english_text",
  automation_console: "automaticenglish_text",
  notification_center: "notificationenglish_text",
  dead_letter_triage: "failedtasktext",
  legacy: "english_text",
};

function formatRunSource(source?: string): string {
  if (!source) return "english_text";
  return runSourceLabels[source] ?? "texttask";
}

const registeredActions = new Set([
  "product.research",
  "product_research",
  "product.research.daily",
  "listing.draft",
  "listing.generate",
  "listing_generation",
  "generate_listing",
  "profit.analyze",
  "profit.calculate",
  "profit_calculation",
  "task.create",
  "create_task",
  "image.prompt",
  "image_prompt",
]);

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
  return asString(record.message) || "backendenglish_textfailedtext";
}

function mapFlow(flow: ApiAutomationFlow): AutomationFlowItem {
  const failed = flow.latestRunStatus === "FAILED" || flow.status === "danger";
  const steps = (flow.automationSteps ?? []).map((step) => {
    const action = asString(step.action) || "unknown";
    return {
      name: actionLabels[action] ?? action,
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
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    status: failed
      ? "error"
      : flow.backendStatus === "DRAFT"
        ? "draft"
        : flow.status === "running"
          ? "active"
          : "paused",
    trigger: flow.channel,
    platform: provider ? `${provider} / local Worker` : "local Worker",
    executionCount: flow.runDuration,
    successRate:
      flow.successRate === null ? "textnonetext" : `${flow.successRate}%`,
    lastRun: flow.lastRun,
    steps,
    createdBy: "backendtext",
    createdAt: flow.lastRun,
  };
}

function buildStep(form: FlowFormState): Record<string, unknown> {
  const base = { action: form.action, platform: "OZON" };
  if (form.action === "product.research") {
    return {
      ...base,
      query: form.query.trim() || "Ozon textproducttext",
      targets: [form.query.trim() || "Ozon textproducttext"],
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
        query: form.query.trim() || "Ozon textproducttext",
        targets: [form.query.trim() || "Ozon textproducttext"],
      },
      {
        key: "draft",
        dependsOn: ["research"],
        action: "listing.draft",
        platform: "OZON",
        workspaceId: form.workspaceId,
        productName:
          form.productName.trim() ||
          `${form.query.trim() || "Ozon text"}textproduct`,
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
  const trigger = detail.triggers[0];
  if (trigger !== "MANUAL" && trigger !== "SCHEDULE") {
    return "textflowenglish_textconfigurationenglish_text，english_textautomatictext。";
  }
  const steps = detail.automationSteps ?? [];
  if (steps.length === 0) return "textflowtextyesenglish_text，english_text。";

  const unsupported = steps.find(
    (step) => !registeredActions.has(asString(step.action)),
  );
  if (unsupported) {
    return `text“${asString(unsupported.action) || "english_text"}”english_textrealenglish_text，english_text。`;
  }

  if (trigger === "SCHEDULE") {
    const interval = Number(detail.triggerConfig?.intervalMinutes);
    if (!Number.isFinite(interval) || interval < 5) {
      return "automatictextflowtextconfigurationenglish_text 5 english_text。";
    }
  }

  for (const step of steps) {
    const action = asString(step.action);
    const workspaceId = asString(step.workspaceId) || detail.workspaceId || "";
    if (
      [
        "listing.draft",
        "listing.generate",
        "listing_generation",
        "generate_listing",
      ].includes(action) &&
      !workspaceId
    ) {
      return "english_text。";
    }
    if (
      ["image.prompt", "image_prompt"].includes(action) &&
      !asString(step.productId) &&
      !asString(step.productName)
    ) {
      return "imageplanenglish_textproductenglish_textproduct。";
    }
    if (
      ["profit.analyze", "profit.calculate", "profit_calculation"].includes(
        action,
      )
    ) {
      const hasProduct = Boolean(asString(step.productId));
      const salePrice = Number(step.salePrice ?? step.price);
      const productCost = Number(step.productCost ?? step.cost);
      if (
        !hasProduct &&
        (!Number.isFinite(salePrice) ||
          salePrice <= 0 ||
          !Number.isFinite(productCost) ||
          productCost < 0)
      ) {
        return "profitenglish_text 0 textpriceenglish_text 0 textcost。";
      }
    }
  }
  return null;
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
  const deleteTarget = selectDeleteFlow(state);
  const [runIntent, setRunIntent] = useState<RunIntent | null>(null);

  const load = useCallback(async () => {
    const requestId = ++flowListRequestId.current;
    dispatch({ type: "flows-requested", requestId });
    try {
      const response = await automationApi.list({ limit: 100 });
      dispatch({ type: "flows-succeeded", requestId, flows: response.items });
    } catch (error) {
      if (requestId !== flowListRequestId.current) return;
      const message =
        error instanceof Error ? error.message : "automatictextflowreadfailed";
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
          error: error instanceof Error ? error.message : "english_textreadfailed",
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
      label: "english_textflow",
      value: String(sourceFlows.filter((flow) => flow.isEnabled).length),
      icon: Workflow,
      color: "text-blue-600",
    },
    {
      label: "realflowtext",
      value: String(sourceFlows.length),
      icon: Play,
      color: "text-emerald-600",
    },
    {
      label: "textsuccesstext",
      value: averageRate === null ? "textnonetext" : `${averageRate.toFixed(1)}%`,
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    {
      label: "failedenglish_text",
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
        query: template.id === "image-review" ? "" : "Ozon textproducttext",
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
        error instanceof Error ? error.message : "flowtextreadfailed";
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
      const editForm: FlowFormState = {
        name: nextDetail.name,
        description: nextDetail.description,
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
        error instanceof Error ? error.message : "flowtextdatareadfailed";
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
      const created = await automationApi.create({
        name: `${source.name} - text`,
        description: source.description,
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
      addToast("flowenglish_text，textautomatictext。", "success");
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "flowtextfailed",
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
      if (active) {
        const flowDetail = await automationApi.getById(id);
        const activationError = validateActivation(flowDetail);
        if (activationError) {
          addToast(activationError, "error");
          return;
        }
      }
      const updated = await automationApi.toggleEnabled(id, active);
      dispatch({ type: "server-flow-received", flow: updated });
      addToast(active ? "flowenglish_text。" : "flowenglish_text。", "success");
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "flowstatustextfailed",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const handleRun = (id: string) => {
    const flow = sourceFlows.find((item) => item.id === id);
    if (!flow) return;
    if (!flow.isEnabled && flow.latestRunStatus !== "FAILED") {
      addToast("textflowenglish_text。english_text，english_textrealtext。", "error");
      return;
    }
    const mode = flow.latestRunStatus === "FAILED" ? "recover" : "run";
    if (mode === "recover" && !flow.latestRunId) {
      addToast("backendtextyesenglish_textfailedenglish_text，english_texttask。", "error");
      return;
    }
    setRunIntent({
      flowId: id,
      flowName: flow.name,
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
      addToast("english_text 8 english_text。", "error");
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
      const activationError = validateActivation(flowDetail);
      if (activationError) {
        addToast(`noneenglish_text：${activationError}`, "error");
        return;
      }
      if (runIntent.mode === "recover") {
        if (!runIntent.failedRunId) {
          addToast("textfailedenglish_text，english_text。", "error");
          return;
        }
        const recovery = await automationApi.recover(runIntent.flowId, {
          failedRunId: runIntent.failedRunId,
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          recovery.status === "already_queued"
            ? "texttasktextqueuetext，textyesenglish_text。"
            : recovery.status === "already_created"
              ? "english_text，textyesenglish_text。"
              : "english_text，textfailedenglish_text。",
          "success",
        );
      } else {
        const run = await automationApi.triggerRun(runIntent.flowId, {
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          run.idempotent
            ? "english_text，textyesenglish_text。"
            : "english_textrealtext，english_textlocal Worker text。",
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
        error instanceof Error ? error.message : "flowtextfailed",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const validateForm = (): string | null => {
    if (!form.name.trim()) return "english_textflowtext。";
    if (form.triggerType === "SCHEDULE") {
      const interval = Number(form.intervalMinutes);
      if (!Number.isFinite(interval) || interval < 5)
        return "automaticenglish_text 5 text。";
    }
    if (form.action === "listing.draft" || form.action === "image.prompt") {
      if (!form.productName.trim()) return "english_textproducttext。";
    }
    if (
      (form.action === "listing.draft" ||
        form.templateId === "research-to-draft") &&
      !form.workspaceId
    ) {
      return "english_text。";
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
        return "profitenglish_text 0 textpriceenglish_text 0 textcost。";
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
        addToast("flowtextrealenglish_textbackend。", "success");
      } else {
        const created = await automationApi.create(payload);
        dispatch({ type: "server-flow-received", flow: created });
        addToast("flowtextrealtext。", "success");
      }
      dispatch({ type: "editor-closed" });
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "flowtextfailed",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const operationKey = `delete:${id}`;
    dispatch({
      type: "operation-started",
      pending: {
        key: operationKey,
        flowId: id,
        operation: "delete",
        startedAt: Date.now(),
      },
    });
    try {
      await automationApi.delete(id);
      dispatch({ type: "server-flow-removed", flowId: id });
      addToast("flowtextbackendenglish_text。", "success");
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "flowtextfailed",
        "error",
      );
    } finally {
      dispatch({ type: "operation-finished", key: operationKey });
    }
  };

  return (
    <>
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
        onDelete={(id) => dispatch({ type: "delete-selected", flowId: id })}
      />

      <Modal
        open={formOpen}
        onClose={() => {
          if (busyAction !== "form:page") dispatch({ type: "editor-closed" });
        }}
        title={editingId ? "textautomatictextflow" : "textautomatictextflow"}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
            english_textconfigurationlocal Worker
            english_text。publish、text、english_textautomatictext。
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                flowtext
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
                placeholder="text：text Ozon product researchtext"
              />
            </label>
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                flowtext
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
                placeholder="english_textflowenglish_text"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-gray-700">
                english_text
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
                <option value="MANUAL">english_text</option>
                <option value="SCHEDULE">automatictext</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-gray-700">
                flowstatus
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
                <option value="DRAFT">english_text</option>
                <option value="ACTIVE">text</option>
                <option value="PAUSED">text</option>
              </select>
            </label>
            {form.triggerType === "SCHEDULE" ? (
              <label>
                <span className="text-sm font-semibold text-gray-700">
                  english_text（text）
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
                english_text
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
                <option value="">english_text</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.channelType}
                  </option>
                ))}
              </select>
              {!workspaces.length ? (
                <span className="mt-1 block text-xs text-amber-700">
                  textreadenglish_text；english_textflowenglish_text。
                </span>
              ) : null}
            </label>
            <label
              className={form.triggerType === "SCHEDULE" ? "" : "md:col-span-2"}
            >
              <span className="text-sm font-semibold text-gray-700">
                english_text
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
                  texttemplateenglish_text：realtext →
                  textpassedenglish_textlocaltext。english_text。
                </span>
              ) : null}
            </label>
            {form.action === "product.research" ||
            form.action === "task.create" ||
            form.action === "image.prompt" ? (
              <label className="md:col-span-2">
                <span className="text-sm font-semibold text-gray-700">
                  {form.action === "product.research"
                    ? "textkeywords"
                    : form.action === "task.create"
                      ? "tasktext"
                      : "imagetext"}
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
                      ? "text：english_text"
                      : "english_text"
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
                    ? "english_text（text）"
                    : "producttext"}
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
                      ? "english_textkeywordsgenerationenglish_text"
                      : "english_textrealproducttext"
                  }
                />
              </label>
            ) : null}
            {form.action === "profit.calculate" ? (
              <>
                <label>
                  <span className="text-sm font-semibold text-gray-700">
                    textpricetext
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
                    productcost
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
              text
            </button>
            <button
              type="button"
              onClick={() => void submitForm()}
              disabled={busyAction === "form:page"}
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busyAction === "form:page" ? "english_text…" : "textflow"}
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
        title="flowenglish_text"
        width="max-w-3xl"
      >
        {detail ? (
          <div className="space-y-5">
            <section>
              <h4 className="text-base font-bold text-gray-900">
                {detail.name}
              </h4>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {detail.description || "english_textflowtext"}
              </p>
              <dl className="mt-4 grid gap-3 bg-gray-50 p-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-500">textstatus</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.backendStatus === "DRAFT"
                      ? "text"
                      : detail.isEnabled
                        ? "english_text"
                        : detail.backendStatus === "ERROR"
                          ? "textfailed"
                          : "english_text"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">english_text</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.triggers.map((item) => item).join("、")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">english_text</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    {runTotal} text
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700">english_text</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.actions.length ? (
                    detail.actions.map((action, index) => (
                      <span
                        key={`${action}-${index}`}
                        className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      >
                        {index + 1}. {actionLabels[action] ?? action}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">textconfigurationtext</span>
                  )}
                </div>
              </div>
            </section>
            <section className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-bold text-gray-900">english_text</h4>
              <div className="mt-3 space-y-2">
                {runs.length ? (
                  runs.map((run) => {
                    const status = runStatusLabels[run.status] ?? {
                      label: run.status,
                      tone: "text-gray-700",
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
                            <dt className="text-gray-500">english_text</dt>
                            <dd className="mt-0.5 font-medium text-gray-800">
                              {formatRunSource(run.triggerSource)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-gray-500">english_text</dt>
                            <dd className="mt-0.5 font-medium text-emerald-700">
                              {run.idempotencyKey ? "english_text" : "english_text"}
                            </dd>
                          </div>
                        </dl>
                        {run.triggerReason ? (
                          <p className="mt-2 text-xs leading-5 text-gray-700">
                            english_text：{run.triggerReason}
                          </p>
                        ) : null}
                        {run.parentRunId ? (
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            texttaskenglish_textfailedtext，textfailedenglish_text。
                          </p>
                        ) : null}
                        {run.error ? (
                          <p className="mt-2 text-xs leading-5 text-red-700">
                            failedtext：{formatError(run.error)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-sm text-gray-500">
                    textnonerealenglish_text
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
            ? "english_textautomatictextflow"
            : "english_textautomatictextflow"
        }
      >
        {runIntent ? (
          <div className="space-y-4">
            <div className="border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800">
              <div className="font-semibold">{runIntent.flowName}</div>
              <div>
                {runIntent.mode === "recover"
                  ? "english_text，textfailedenglish_text。"
                  : "english_textflowenglish_textlocal Worker text。"}
              </div>
              <div>publish、text、english_texthumantext。</div>
            </div>
            <label className="block text-sm font-semibold text-gray-700">
              {runIntent.mode === "recover" ? "english_text" : "english_text"}
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
                    ? "english_textfailedtext，english_text"
                    : "english_textcompletedenglish_text"
                }
                className="mt-2 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <p className="text-xs leading-5 text-gray-500">
              english_text；english_text。
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setRunIntent(null)}
                disabled={busyAction === `run:${runIntent.flowId}`}
                className="h-10 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                text
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
                  ? "english_text…"
                  : runIntent.mode === "recover"
                    ? "english_text"
                    : "english_text"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => dispatch({ type: "delete-selected", flowId: null })}
        title="english_textflow"
      >
        {deleteTarget ? (
          <div>
            <p className="text-sm leading-6 text-gray-700">
              english_text“{deleteTarget.name}
              ”。textyesenglish_textdataenglish_text，english_text Ozon
              storetext。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "delete-selected", flowId: null })
                }
                className="h-10 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700"
              >
                text
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busyAction === `delete:${deleteTarget.id}`}
                className="h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAction === `delete:${deleteTarget.id}`
                  ? "english_text…"
                  : "english_text"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
