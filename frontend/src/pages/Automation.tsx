import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  CheckCircle,
  Clock,
  Shield,
  MoreHorizontal,
  FileText,
  Globe,
  Package,
  Search,
  Filter,
  Rocket,
  BarChart3,
  Eye,
  Bot,
  DollarSign,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import StatsCard from "../components/ui/StatsCard";
import StatusBadge from "../components/ui/StatusBadge";
import AgentConsoleSlot from "../components/ui/AgentConsoleSlot";
import RobotIllustration from "../components/ui/RobotIllustration";
import Modal from "../components/ui/Modal";
import { useToast } from "../components/ui/use-toast.ts";
import { automationApi } from "../api/automation";
import type {
  AutomationFlowStatus,
  AutomationTriggerType,
} from "../api/automation";
import { channelsApi, type ChannelConnection } from "../api/channels";
import { api } from "../api/client";
import { createAgentRun, waitForAgentRun } from "../api/agentRuns";
import type { AutomationFlow, FlowTemplate } from "../types";

const templateIconMap: Record<string, React.ComponentType<any>> = {
  DollarSign,
  Rocket,
  Shield,
  Package,
  BarChart3,
  Eye,
  Globe,
  FileText,
};

interface PlannerOutput {
  summary?: string;
  reply?: string;
  message?: string;
  plan?: unknown;
  result?: unknown;
  steps?: unknown;
}

type SupportedAutomationAction =
  | "product.research"
  | "listing.draft"
  | "profit.calculate"
  | "task.create"
  | "image.prompt";

interface FlowFormState {
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  status: AutomationFlowStatus;
  action: SupportedAutomationAction;
  query: string;
  productName: string;
  productId: string;
  keywords: string;
  salePrice: string;
  productCost: string;
  intervalMinutes: string;
  runImmediately: boolean;
}

const supportedAutomationActions: Array<{
  value: SupportedAutomationAction;
  label: string;
  description: string;
}> = [
  {
    value: "product.research",
    label: "Ozon automaticproduct research",
    description: "textrealproduct researchagent，textproducttextnotificationenglish_texthumantext。",
  },
  {
    value: "listing.draft",
    label: "generation Listing text",
    description: "textreal Listing generationAPI，english_texthumanreview。",
  },
  {
    value: "profit.calculate",
    label: "profittext",
    description: "textrealprofittextAPI，textpricetextcost。",
  },
  {
    value: "task.create",
    label: "english_texttask",
    description: "textteamtaskenglish_textrealtext，english_textstore。",
  },
  {
    value: "image.prompt",
    label: "imageenglish_text",
    description: "textrealimageenglish_textagent，english_textreview。",
  },
];

const defaultFlowForm: FlowFormState = {
  name: "Ozon english_textautomatictextflow",
  description:
    "textfrontendtext，backend Automation Worker text；textstorewritetexthumantext。",
  triggerType: "MANUAL",
  status: "DRAFT",
  action: "product.research",
  query: "Ozon english_text",
  productName: "",
  productId: "",
  keywords: "",
  salePrice: "",
  productCost: "",
  intervalMinutes: "240",
  runImmediately: false,
};

interface BackendAutomationRunSnapshot {
  id?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string | null;
  error?: Record<string, unknown> | null;
}

interface BackendAutomationFlowSnapshot {
  id: string;
  runs?: BackendAutomationRunSnapshot[];
}

function extractRunError(run?: BackendAutomationRunSnapshot): string | null {
  const error = run?.error;
  if (!error || typeof error !== "object") return null;
  const message = error.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : JSON.stringify(error);
}

function statusFromLatestRun(
  current: AutomationFlow["status"],
  run?: BackendAutomationRunSnapshot,
): AutomationFlow["status"] {
  if (current === "paused") return current;
  if (!run?.status) return current;
  if (run.status === "FAILED") return "danger";
  if (run.status === "PARTIAL") return "warning";
  if (run.status === "RUNNING" || run.status === "PENDING") return "running";
  return current;
}

function mergeLatestRunData(
  flows: AutomationFlow[],
  rawFlows?: BackendAutomationFlowSnapshot[],
): AutomationFlow[] {
  const latestRunByFlowId = new Map(
    (rawFlows ?? []).map((flow) => [flow.id, flow.runs?.[0]]),
  );
  return flows.map((flow) => {
    const latestRun = latestRunByFlowId.get(flow.id);
    return {
      ...flow,
      status: statusFromLatestRun(flow.status, latestRun),
      latestRunId: latestRun?.id ?? null,
      latestRunStatus: latestRun?.status ?? null,
      latestRunError: extractRunError(latestRun),
      latestRunStartedAt: latestRun?.startedAt ?? null,
      latestRunFinishedAt: latestRun?.finishedAt ?? null,
    };
  });
}

const defaultFlowTemplates: FlowTemplate[] = [
  {
    id: "ft1",
    name: "textplatformtextautomatictext",
    description:
      "localtemplatetext：english_textflow；platformtext、english_textbackendenglish_textevidence。",
    icon: "DollarSign",
    category: "english_text",
  },
  {
    id: "ft2",
    name: "textlistingtextflow",
    description:
      "localtemplatetext：english_textlistingenglish_text；SEO、imagegeneration、textplatformpublishtexttemplateenglish_text。",
    icon: "Rocket",
    category: "listingtext",
  },
  {
    id: "ft3",
    name: "english_text & text",
    description:
      "localtemplatetext：english_text；textmonitoring、text、automaticenglish_textrealenglish_textacceptance。",
    icon: "Shield",
    category: "english_text",
  },
  {
    id: "ft4",
    name: "english_text",
    description:
      "localtemplatetext：english_textflowtext；english_textfrontendtext。",
    icon: "Package",
    category: "supply chain",
  },
  {
    id: "ft5",
    name: "english_text",
    description:
      "localtemplatetext：english_text；textdatatext、textgeneration、english_textbackendtext。",
    icon: "BarChart3",
    category: "english_text",
  },
  {
    id: "ft6",
    name: "textmonitoringtext",
    description:
      "localtemplatetext：english_textmonitoringtext；competitor price、text、text、english_textlocaltextdata。",
    icon: "Eye",
    category: "english_text",
  },
  {
    id: "ft7",
    name: "english_textmonitoring",
    description:
      "localtemplatetext：english_textflowtext；TikTok、Instagram、Reddit english_texttemplatetext。",
    icon: "Globe",
    category: "english_text",
  },
  {
    id: "ft8",
    name: "english_textautomatictext",
    description:
      "localtemplatetext：english_text；textreporttext、ERP text、english_textbackendtext。",
    icon: "FileText",
    category: "english_text",
  },
];

function summarizePlannerOutput(output: PlannerOutput | null): string {
  if (!output) return "Planner agenttextcompleted，textbackendenglish_text。";
  if (output.summary) return output.summary;
  if (output.reply) return output.reply;
  if (output.message) return output.message;

  const detail = output.plan ?? output.result ?? output.steps ?? output;
  return `Planner agenttextcompleted：${JSON.stringify(detail).slice(0, 500)}`;
}

function formatSuccessRate(successRate: number | null): string {
  return typeof successRate === "number" ? `${successRate}%` : "backendenglish_text";
}

function parseKeywords(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericField(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildAutomationStep(form: FlowFormState): Record<string, unknown> {
  const base = {
    action: form.action,
    platform: "OZON",
    query: form.query.trim() || undefined,
    productName: form.productName.trim() || undefined,
    productId: form.productId.trim() || undefined,
    keywords: parseKeywords(form.keywords),
  };

  if (form.action === "profit.calculate") {
    return {
      ...base,
      salePrice: numericField(form.salePrice),
      productCost: numericField(form.productCost),
    };
  }

  if (form.action === "task.create") {
    return {
      ...base,
      title:
        form.productName.trim() || form.query.trim() || "Ozon automaticenglish_text",
      description: form.description.trim() || "textautomatictextflowenglish_texttask。",
      priority: "MEDIUM",
    };
  }

  return base;
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

type LegacyRunIntent = {
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

function Automation() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [flowTemplates] = useState<FlowTemplate[]>(defaultFlowTemplates);
  const [ozonChannels, setOzonChannels] = useState<ChannelConnection[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [templateCreatingId, setTemplateCreatingId] = useState<string | null>(
    null,
  );
  const [flowFormOpen, setFlowFormOpen] = useState(false);
  const [flowFormSubmitting, setFlowFormSubmitting] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [flowForm, setFlowForm] = useState<FlowFormState>(defaultFlowForm);
  const [agentRunning, setAgentRunning] = useState(false);
  const [triggeringFlowId, setTriggeringFlowId] = useState<string | null>(null);
  const [runIntent, setRunIntent] = useState<LegacyRunIntent | null>(null);
  const [agentMessages, setAgentMessages] = useState<
    { role: "user" | "agent"; text: string }[]
  >([]);
  const { addToast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch automation flows from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [flowsRes, rawFlowsRes, channelRes] = await Promise.all([
          automationApi.list().catch(() => null),
          api
            .get<{ items: BackendAutomationFlowSnapshot[] }>(
              "/automation/flows",
            )
            .catch(() => null),
          channelsApi.list({ provider: "OZON", limit: 20 }).catch(() => null),
        ]);
        if (flowsRes) {
          const latestRunByFlowId = new Map(
            (rawFlowsRes?.items ?? []).map((flow) => [flow.id, flow.runs?.[0]]),
          );
          setFlows(
            flowsRes.items.map((flow) => {
              const latestRun = latestRunByFlowId.get(flow.id);
              return {
                ...flow,
                status: statusFromLatestRun(flow.status, latestRun),
                latestRunId: latestRun?.id ?? null,
                latestRunStatus: latestRun?.status ?? null,
                latestRunError: extractRunError(latestRun),
                latestRunStartedAt: latestRun?.startedAt ?? null,
                latestRunFinishedAt: latestRun?.finishedAt ?? null,
              };
            }),
          );
        } else {
          setFlows([]);
          addToast("automatictextflowtextfailed，english_textyesenglish_textflow。", "error");
        }
        setOzonChannels(channelRes?.items ?? []);
      } catch (err) {
        console.error("Failed to fetch automation data:", err);
      } finally {
        setPageLoading(false);
      }
    };
    fetchData();
  }, [addToast]);

  const loadFlows = useCallback(async () => {
    try {
      const [flowsRes, rawFlowsRes, channelRes] = await Promise.all([
        automationApi.list().catch(() => null),
        api
          .get<{ items: BackendAutomationFlowSnapshot[] }>("/automation/flows")
          .catch(() => null),
        channelsApi.list({ provider: "OZON", limit: 20 }).catch(() => null),
      ]);
      if (flowsRes) {
        setFlows(mergeLatestRunData(flowsRes.items, rawFlowsRes?.items));
      } else {
        setFlows([]);
        addToast("automatictextflowtextfailed，english_textyesenglish_textflow。", "error");
      }
      setOzonChannels(channelRes?.items ?? []);
    } catch (err) {
      console.error("Failed to fetch automation data:", err);
    } finally {
      setPageLoading(false);
    }
  }, [addToast]);

  const flowCounts = useMemo(
    () => ({
      all: flows.length,
      running: flows.filter((flow) => flow.status === "running").length,
      done: flows.filter((flow) => flow.status === "success").length,
      error: flows.filter(
        (flow) => flow.status === "warning" || flow.status === "danger",
      ).length,
    }),
    [flows],
  );

  const activeOzonChannel = useMemo(
    () =>
      ozonChannels.find((channel) => channel.syncStatus === "SUCCESS") ??
      ozonChannels[0] ??
      null,
    [ozonChannels],
  );

  const todayCompletedCount = useMemo(
    () =>
      flows.filter(
        (flow) =>
          flow.latestRunStatus === "COMPLETED" &&
          isToday(flow.latestRunFinishedAt ?? flow.latestRunStartedAt),
      ).length,
    [flows],
  );

  const tabs = useMemo(
    () => [
      { id: "all", label: t("automation.allFlows"), count: flowCounts.all },
      {
        id: "running",
        label: t("automation.runningFlows"),
        count: flowCounts.running,
      },
      {
        id: "done",
        label: t("automation.completedFlows"),
        count: flowCounts.done,
      },
      {
        id: "error",
        label: t("automation.errorFlows"),
        count: flowCounts.error,
      },
    ],
    [flowCounts, t],
  );

  const averageSuccessRate = useMemo(() => {
    const rates = flows
      .map((flow) => flow.successRate)
      .filter((rate): rate is number => typeof rate === "number");
    if (rates.length === 0) return "nonetext";
    const total = rates.reduce((sum, rate) => sum + rate, 0);
    return `${Math.round((total / rates.length) * 10) / 10}%`;
  }, [flows]);

  const executionSteps = useMemo(
    () => [
      {
        name: t("automation.executionStepCollect"),
        progress: 0,
        status: "pending" as const,
      },
      {
        name: t("automation.executionStepProcess"),
        progress: 0,
        status: "pending" as const,
      },
      {
        name: t("automation.executionStepAiAnalyze"),
        progress: 0,
        status: "pending" as const,
      },
      {
        name: t("automation.executionStepGenerateResult"),
        progress: 0,
        status: "pending" as const,
      },
      {
        name: t("automation.executionStepPushNotify"),
        progress: 0,
        status: "pending" as const,
      },
    ],
    [t],
  );

  // Filter flows by active tab and search query
  const filteredFlows = flows.filter((flow) => {
    // Tab filter
    if (activeTab === "running" && flow.status !== "running") return false;
    if (activeTab === "done" && flow.status !== "success") return false;
    if (
      activeTab === "error" &&
      flow.status !== "warning" &&
      flow.status !== "danger"
    )
      return false;
    // Search filter
    if (
      searchQuery &&
      !flow.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  const handleToggleFlow = async (flowId: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return;
    const newEnabled = !flow.isEnabled;
    try {
      await automationApi.toggleEnabled(flowId, newEnabled);
      setFlows((prev) =>
        prev.map((f) =>
          f.id === flowId ? { ...f, isEnabled: newEnabled } : f,
        ),
      );
      addToast(
        newEnabled ? t("automation.flowEnabled") : t("automation.flowDisabled"),
        "success",
      );
    } catch {
      addToast(t("automation.operationFailed"), "error");
    }
  };

  const handleTriggerFlow = (flowId: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow || triggeringFlowId) return;
    if (!flow.isEnabled) {
      addToast("flowenglish_text，english_textrealtext。", "error");
      return;
    }

    const mode = flow.latestRunError ? "recover" : "run";
    if (mode === "recover" && !flow.latestRunId) {
      addToast("backendtextyesenglish_textfailedenglish_text，english_text。", "error");
      return;
    }
    setRunIntent({
      flowId,
      flowName: flow.name,
      mode,
      failedRunId: flow.latestRunId ?? null,
      reason: "",
      idempotencyKey: createIdempotencyKey(`${mode}-${flowId}`),
    });
  };

  const submitRunIntent = async () => {
    if (!runIntent || triggeringFlowId) return;
    const reason = runIntent.reason.trim();
    if (reason.length < 8) {
      addToast("english_text 8 english_text。", "error");
      return;
    }

    setTriggeringFlowId(runIntent.flowId);
    try {
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
            ? "textyesrealtexttasktextqueuetext，english_text。"
            : recovery.status === "already_created"
              ? "english_text，english_text。"
              : "english_textrealenglish_text，textfailedenglish_text。",
          "success",
        );
      } else {
        const run = await automationApi.triggerRun(runIntent.flowId, {
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          run.idempotent
            ? "english_text，english_text。"
            : "english_textrealautomaticenglish_text，text Worker english_text。",
          "success",
        );
      }
      setRunIntent(null);
      await loadFlows();
      window.setTimeout(() => {
        void loadFlows();
      }, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`english_textfailed：${message}`, "error");
    } finally {
      setTriggeringFlowId(null);
    }
  };

  const handleCreateFromTemplate = async (tpl: FlowTemplate) => {
    setTemplateCreatingId(tpl.id);
    try {
      const flow = await automationApi.create({
        name: tpl.name,
        description: tpl.description,
        triggerType: "MANUAL",
        status: "DRAFT",
        triggerConfig: {
          source: "template",
          templateId: tpl.id,
          category: tpl.category,
        },
        steps: [
          {
            action: "template_selected",
            templateId: tpl.id,
            name: tpl.name,
            category: tpl.category,
            description: tpl.description,
          },
        ],
      });
      setFlows((prev) => [flow, ...prev.filter((item) => item.id !== flow.id)]);
      setTemplateModalOpen(false);
      addToast(
        `english_textrealtextflow：${tpl.name}。templateenglish_textautomatictextplatformtext。`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`templatetextfailed：${message}`, "error");
    } finally {
      setTemplateCreatingId(null);
    }
  };

  const handleCustomFlow = () => {
    setEditingFlowId(null);
    setFlowForm({
      ...defaultFlowForm,
      name: activeOzonChannel
        ? "Ozon english_textautomatictextflow"
        : "Ozon automatictextflow（english_textstore）",
      status: activeOzonChannel?.syncStatus === "SUCCESS" ? "DRAFT" : "DRAFT",
    });
    setFlowFormOpen(true);
  };

  const handleEditFlow = async (flowId: string) => {
    setOpenDropdownId(null);
    try {
      const detail = await automationApi.getById(flowId);
      const action = supportedAutomationActions.some(
        (item) => item.value === detail.actions[0],
      )
        ? (detail.actions[0] as SupportedAutomationAction)
        : "product.research";
      const triggerType = detail.triggers[0] as
        AutomationTriggerType | undefined;
      setEditingFlowId(flowId);
      setFlowForm({
        ...defaultFlowForm,
        name: detail.name,
        description: detail.description,
        triggerType:
          triggerType === "SCHEDULE" ||
          triggerType === "WEBHOOK" ||
          triggerType === "CONDITION" ||
          triggerType === "EVENT" ||
          triggerType === "MANUAL"
            ? triggerType
            : "MANUAL",
        status: detail.isEnabled ? "ACTIVE" : "DRAFT",
        action,
      });
      setFlowFormOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`flowtextreadfailed：${message}`, "error");
    }
  };

  const handleSubmitFlowForm = async () => {
    if (!flowForm.name.trim()) {
      addToast("flowenglish_text。", "error");
      return;
    }
    if (
      flowForm.action === "profit.calculate" &&
      (!numericField(flowForm.salePrice) || !numericField(flowForm.productCost))
    ) {
      addToast("profitenglish_textyestextpricetextcost。", "error");
      return;
    }
    if (flowForm.triggerType === "SCHEDULE" && flowForm.status !== "ACTIVE") {
      addToast("textflowenglish_text ACTIVE english_textautomatictext。", "error");
      return;
    }

    const intervalMinutes = numericField(flowForm.intervalMinutes) ?? 240;
    const triggerConfig = {
      source: "ui_custom_ozon_flow",
      provider: "OZON",
      platform: "OZON",
      channelId: activeOzonChannel?.id,
      intervalMinutes,
      defaultResearchQuery: flowForm.query.trim() || undefined,
    };
    const nextRunAt =
      flowForm.triggerType === "SCHEDULE" && flowForm.runImmediately
        ? new Date().toISOString()
        : undefined;

    setFlowFormSubmitting(true);
    try {
      const payload = {
        name: flowForm.name.trim(),
        description: flowForm.description.trim(),
        triggerType: flowForm.triggerType,
        status: flowForm.status,
        triggerConfig,
        steps: [buildAutomationStep(flowForm)],
        nextRunAt,
      };

      if (editingFlowId) {
        await automationApi.update(editingFlowId, payload);
        addToast("automatictextflowtextrealenglish_textbackend。", "success");
      } else {
        await automationApi.create({
          ...payload,
          workspaceId: activeOzonChannel?.workspaceId,
        });
        addToast("automatictextflowtextrealtext。", "success");
      }
      setFlowFormOpen(false);
      setEditingFlowId(null);
      await loadFlows();
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`automatictextflowtextfailed：${message}`, "error");
    } finally {
      setFlowFormSubmitting(false);
    }
  };

  const handleViewLog = async (flowId: string) => {
    setOpenDropdownId(null);
    try {
      const runs = await automationApi.listRuns(flowId, { limit: 5 });
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: `textreadrealenglish_text：text ${runs.total} text，text ${runs.items.length} text。`,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`english_textreadfailed：${message}`, "error");
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    setOpenDropdownId(null);
    try {
      await automationApi.delete(flowId);
      setFlows((prev) => prev.filter((flow) => flow.id !== flowId));
      addToast("automatictextflowtextbackendtext。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      addToast(`textfailed：${message}`, "error");
    }
  };

  const handleAgentCommand = async (command: string) => {
    if (agentRunning) {
      addToast("Planner agentenglish_text，english_texttasktext。", "info");
      return;
    }
    setAgentRunning(true);
    setAgentMessages((prev) => [
      ...prev,
      { role: "user", text: command },
      { role: "agent", text: "english_textreal Planner agent..." },
    ]);
    try {
      const run = await createAgentRun<PlannerOutput>("PLANNER", {
        goal: command,
        context: {
          surface: "automation",
          visibleFlowIds: flows.map((flow) => flow.id),
        },
      });
      const finished = await waitForAgentRun<PlannerOutput>(run.id);
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: `${summarizePlannerOutput(finished.output)}（runId: ${finished.id}）`,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "texterror";
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Planner agenttextfailed：${message}。english_textyestextcostenglish_text。`,
        },
      ]);
      addToast("Planner agenttextfailed，textgenerationenglish_text。", "error");
    } finally {
      setAgentRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <RobotIllustration size="md" variant="working" />
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E]">
              {t("automation.title")}text Agent english_text
            </h2>
            <p className="text-sm text-[#6B7280] mt-1">
              {t("automation.subtitle")} 🚀
            </p>
          </div>
        </div>
        {/* Create card */}
        <div className="w-64 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">
            {t("automation.createNewFlow")}
          </h3>
          <div className="space-y-2">
            <button
              data-testid="create-from-template"
              onClick={() => setTemplateModalOpen(true)}
              className="w-full rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {t("automation.fromTemplate")}
            </button>
            <button
              data-testid="custom-flow"
              onClick={handleCustomFlow}
              className="w-full rounded-lg border border-[#E8E8F0] py-2 text-sm font-medium text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
            >
              {t("automation.customFlow")}
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-5">
        <StatsCard
          icon={<Play size={22} />}
          value={flowCounts.running}
          label={t("automation.runningCount")}
          color="#6C63FF"
        />
        <StatsCard
          icon={<CheckCircle size={22} />}
          value={todayCompletedCount}
          label={t("automation.todayCompleted")}
          color="#34D399"
        />
        <StatsCard
          icon={<Clock size={22} />}
          value="english_text"
          label={t("automation.timeSaved")}
          color="#FB923C"
        />
        <StatsCard
          icon={<Shield size={22} />}
          value={averageSuccessRate}
          label={t("automation.taskSuccessRate")}
          color="#4A9EFF"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-5">
        {/* Flow List */}
        <div className="col-span-2 rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-3">
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-[#F0EEFF] text-[#6C63FF]"
                      : "text-[#6B7280] hover:text-[#6C63FF]"
                  }`}
                >
                  {tab.label}({tab.count})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                />
                <input
                  data-testid="search-input"
                  type="text"
                  placeholder={t("automation.searchFlowPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-32 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] pl-7 pr-2 py-1.5 text-xs outline-none"
                />
              </div>
              <Filter size={15} className="text-[#8B93B5] cursor-pointer" />
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-[#F0F0F8]">
            {pageLoading ? (
              <div className="px-5 py-8 text-center text-sm text-[#8B93B5]">
                english_textrealautomatictextflow...
              </div>
            ) : (
              filteredFlows.map((flow) => (
                <div
                  key={flow.id}
                  data-testid={`flow-item-${flow.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F8F9FF] transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                    <FileText size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1A1A2E]">
                        {flow.name}
                      </span>
                      <StatusBadge status={flow.status} />
                    </div>
                    <p className="text-xs text-[#8B93B5] truncate">
                      {flow.description}
                    </p>
                    {flow.latestRunError && (
                      <p className="mt-1 text-xs text-[#EF4444] truncate">
                        english_textfailed：{flow.latestRunError}
                      </p>
                    )}
                    {flow.agentFailureClass ===
                      "agent_provider_unreachable" && (
                      <p className="mt-1 text-xs text-[#B45309] truncate">
                        realagentenglish_text，english_text；english_text：
                        {flow.agentBackoffUntil ?? flow.nextRun}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#6B7280] shrink-0">
                    <span className="hidden lg:inline">{flow.channel}</span>
                    <span className="hidden lg:inline">{flow.runDuration}</span>
                    <span className="text-[#34D399] font-medium">
                      {formatSuccessRate(flow.successRate)}
                    </span>
                    <span className="hidden lg:inline">{flow.nextRun}</span>
                    <span className="hidden xl:inline">{flow.lastRun}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      data-testid={`trigger-${flow.id}`}
                      onClick={() => handleTriggerFlow(flow.id)}
                      disabled={triggeringFlowId === flow.id || !flow.isEnabled}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        triggeringFlowId === flow.id || !flow.isEnabled
                          ? "cursor-not-allowed bg-[#F3F4F6] text-[#9CA3AF]"
                          : flow.latestRunError
                            ? "bg-[#FFF1F2] text-[#E11D48] hover:bg-[#FFE4E6]"
                            : "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]"
                      }`}
                      title={
                        !flow.isEnabled
                          ? "english_textflowenglish_text"
                          : "english_textrealautomaticenglish_text"
                      }
                    >
                      {triggeringFlowId === flow.id
                        ? "english_text"
                        : flow.latestRunError
                          ? "text"
                          : "text"}
                    </button>
                    <button
                      data-testid={`toggle-${flow.id}`}
                      onClick={() => handleToggleFlow(flow.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${flow.isEnabled ? "bg-[#6C63FF]" : "bg-[#D1D5DB]"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${flow.isEnabled ? "translate-x-[18px]" : "translate-x-[2px]"}`}
                      />
                    </button>
                    <div className="relative">
                      <button
                        data-testid={`more-${flow.id}`}
                        onClick={() =>
                          setOpenDropdownId(
                            openDropdownId === flow.id ? null : flow.id,
                          )
                        }
                        className="p-1 text-[#8B93B5] hover:text-[#1A1A2E]"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {openDropdownId === flow.id && (
                        <div
                          ref={dropdownRef}
                          data-testid={`dropdown-${flow.id}`}
                          className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-[#E8E8F0] bg-white py-1 shadow-lg"
                        >
                          <button
                            onClick={() => {
                              void handleEditFlow(flow.id);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-[#4A5578] hover:bg-[#F8F9FF]"
                          >
                            {t("automation.editFlow")}
                          </button>
                          <button
                            onClick={() => {
                              void handleViewLog(flow.id);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-[#4A5578] hover:bg-[#F8F9FF]"
                          >
                            {t("automation.viewLog")}
                          </button>
                          <button
                            onClick={() => {
                              void handleDeleteFlow(flow.id);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-[#FF5A6A] hover:bg-[#FFF5F5]"
                          >
                            {t("automation.deleteFlow")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {!pageLoading && filteredFlows.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[#8B93B5]">
                {t("automation.noMatchingFlows")}
              </div>
            )}
          </div>
        </div>

        {/* Agent Console */}
        <AgentConsoleSlot
          quickCommands={[
            t("automation.commandDailyReport"),
            t("automation.commandSalesTrend"),
            t("automation.commandOptimizeListing"),
            t("automation.commandCheckInventory"),
          ]}
          connectionState={agentRunning ? "running" : "ready"}
          onCommand={handleAgentCommand}
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-5">
        {/* Execution Queue */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-4">
            {t("automation.executionQueue")}
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {executionSteps.map((step) => (
              <div key={step.name} className="text-center">
                <div className="relative h-20 rounded-xl bg-[#F8F9FF] mb-2 flex flex-col items-center justify-center">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-xl transition-all"
                    style={{
                      height: `${step.progress}%`,
                      background: "#E8E8F0",
                      opacity: 0.15,
                    }}
                  />
                  <span className="relative text-lg font-bold text-[#6C63FF]">
                    {step.progress}%
                  </span>
                </div>
                <p className="text-[10px] text-[#6B7280]">{step.name}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#8B93B5]">
            textnonebackendtextqueuetext，english_text。
          </p>
        </div>

        {/* Flow Templates */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">
              {t("automation.templateCenter")}
            </h3>
            <span className="text-xs text-[#6C63FF] cursor-pointer">
              {t("common.viewAll")} →
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {flowTemplates.map((tpl) => {
              const Icon = templateIconMap[tpl.icon] || FileText;
              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-[#E8E8F0] p-3 hover:border-[#6C63FF] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                      <Icon size={14} />
                    </div>
                    <span className="text-xs font-semibold text-[#1A1A2E]">
                      {tpl.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8B93B5]">
                    {tpl.description}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-[#6B7280]">
                      {tpl.category}
                    </span>
                    <span className="text-[10px] text-[#FB923C]">
                      localtemplatetext
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Template Modal */}
      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={t("automation.createFromTemplate")}
        width="max-w-3xl"
      >
        <div className="grid grid-cols-2 gap-4">
          {flowTemplates.map((tpl) => {
            const Icon = templateIconMap[tpl.icon] || FileText;
            return (
              <div
                key={tpl.id}
                data-testid={`template-card-${tpl.id}`}
                className={`rounded-xl border border-[#E8E8F0] p-4 transition-all ${
                  templateCreatingId
                    ? "cursor-wait opacity-60"
                    : "cursor-pointer hover:border-[#6C63FF] hover:shadow-sm"
                }`}
                onClick={() => {
                  if (!templateCreatingId) {
                    void handleCreateFromTemplate(tpl);
                  }
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-semibold text-[#1A1A2E]">
                    {tpl.name}
                  </span>
                </div>
                <p className="text-xs text-[#8B93B5] mb-3">{tpl.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#6B7280] bg-[#F8F9FF] px-2 py-0.5 rounded">
                    {tpl.category}
                  </span>
                  <span className="text-xs text-[#FB923C]">
                    {templateCreatingId === tpl.id
                      ? "english_text"
                      : "english_text，english_textplatformtext"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={flowFormOpen}
        onClose={() => {
          if (!flowFormSubmitting) {
            setFlowFormOpen(false);
            setEditingFlowId(null);
          }
        }}
        title={editingFlowId ? "text Ozon automatictextflow" : "text Ozon automatictextflow"}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-3 text-xs leading-5 ${
              activeOzonChannel?.syncStatus === "SUCCESS"
                ? "border-[#CDEDDC] bg-[#F2FCF7] text-[#256B45]"
                : "border-[#FFE1B8] bg-[#FFF8F0] text-[#8A5B00]"
            }`}
          >
            {activeOzonChannel?.syncStatus === "SUCCESS"
              ? `english_text Ozon text：${activeOzonChannel.externalShopId ?? activeOzonChannel.id}，textflowenglish_text workspace。`
              : "textdetectiontext SUCCESS statustext Ozon text。english_text，english_textautomaticenglish_textcompleted Ozon realconnection。"}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
              <span>flowtext</span>
              <input
                value={flowForm.name}
                onChange={(event) =>
                  setFlowForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
              <span>text</span>
              <textarea
                value={flowForm.description}
                onChange={(event) =>
                  setFlowForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-20 w-full rounded-lg border border-[#DDE1F2] px-3 py-2 text-sm outline-none focus:border-[#6C63FF]"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#4A5578]">
              <span>english_text</span>
              <select
                value={flowForm.triggerType}
                onChange={(event) =>
                  setFlowForm((current) => ({
                    ...current,
                    triggerType: event.target.value as AutomationTriggerType,
                  }))
                }
                className="h-10 w-full rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm outline-none focus:border-[#6C63FF]"
              >
                <option value="MANUAL">english_text</option>
                <option value="SCHEDULE">automatictext</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[#4A5578]">
              <span>status</span>
              <select
                value={flowForm.status}
                onChange={(event) =>
                  setFlowForm((current) => ({
                    ...current,
                    status: event.target.value as AutomationFlowStatus,
                  }))
                }
                className="h-10 w-full rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm outline-none focus:border-[#6C63FF]"
              >
                <option value="DRAFT">text</option>
                <option value="ACTIVE">text</option>
                <option value="PAUSED">text</option>
              </select>
            </label>
            {flowForm.triggerType === "SCHEDULE" && (
              <>
                <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                  <span>english_text（text）</span>
                  <input
                    value={flowForm.intervalMinutes}
                    onChange={(event) =>
                      setFlowForm((current) => ({
                        ...current,
                        intervalMinutes: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                    inputMode="numeric"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-[#DDE1F2] px-3 py-2 text-xs font-medium text-[#4A5578]">
                  <input
                    type="checkbox"
                    checked={flowForm.runImmediately}
                    onChange={(event) =>
                      setFlowForm((current) => ({
                        ...current,
                        runImmediately: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-[#DDE1F2]"
                  />
                  english_textqueue
                </label>
              </>
            )}
          </div>

          <div className="rounded-xl border border-[#E8E8F0] p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#1A1A2E]">english_text</p>
              <p className="mt-1 text-xs text-[#8B93B5]">
                english_textbackend Automation Worker english_textrealtext。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
                <span>english_text</span>
                <select
                  value={flowForm.action}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      action: event.target.value as SupportedAutomationAction,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm outline-none focus:border-[#6C63FF]"
                >
                  {supportedAutomationActions.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
                <span className="block text-[#8B93B5]">
                  {
                    supportedAutomationActions.find(
                      (item) => item.value === flowForm.action,
                    )?.description
                  }
                </span>
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
                <span>text/text</span>
                <input
                  value={flowForm.query}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="text：Ozon english_text"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                <span>producttext</span>
                <input
                  value={flowForm.productName}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      productName: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="Listing/image/tasktext"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                <span>product ID</span>
                <input
                  value={flowForm.productId}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      productId: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="text，textlocal Product ID"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
                <span>keywords</span>
                <input
                  value={flowForm.keywords}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      keywords: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="english_text"
                />
              </label>
              {flowForm.action === "profit.calculate" && (
                <>
                  <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                    <span>price</span>
                    <input
                      value={flowForm.salePrice}
                      onChange={(event) =>
                        setFlowForm((current) => ({
                          ...current,
                          salePrice: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                    <span>cost</span>
                    <input
                      value={flowForm.productCost}
                      onChange={(event) =>
                        setFlowForm((current) => ({
                          ...current,
                          productCost: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                      inputMode="decimal"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFlowFormOpen(false);
                setEditingFlowId(null);
              }}
              disabled={flowFormSubmitting}
              className="h-9 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] disabled:cursor-not-allowed disabled:opacity-60"
            >
              text
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSubmitFlowForm();
              }}
              disabled={flowFormSubmitting}
              className="h-9 rounded-lg bg-[#6C63FF] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {flowFormSubmitting ? "english_text" : "english_textbackend"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(runIntent)}
        onClose={() => {
          if (!triggeringFlowId) setRunIntent(null);
        }}
        title={runIntent?.mode === "recover" ? "english_textflow" : "english_textflow"}
      >
        {runIntent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#DDE1F2] bg-[#F8F9FF] p-3 text-sm leading-6 text-[#4A5578]">
              <div className="font-semibold text-[#1A1A2E]">
                {runIntent.flowName}
              </div>
              <div>
                {runIntent.mode === "recover"
                  ? "english_texttask，textfailedenglish_text。"
                  : "english_textlocal Worker realtext。"}
              </div>
              <div>publish、text、english_texthumantext。</div>
            </div>
            <label className="block text-sm font-medium text-[#4A5578]">
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
                className="mt-2 w-full resize-y rounded-lg border border-[#DDE1F2] px-3 py-2 text-sm outline-none focus:border-[#6C63FF]"
              />
            </label>
            <p className="text-xs leading-5 text-[#8B93B5]">
              english_text；english_text。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRunIntent(null)}
                disabled={Boolean(triggeringFlowId)}
                className="h-9 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] disabled:opacity-50"
              >
                text
              </button>
              <button
                type="button"
                onClick={() => void submitRunIntent()}
                disabled={
                  runIntent.reason.trim().length < 8 ||
                  Boolean(triggeringFlowId)
                }
                className="h-9 rounded-lg bg-[#6C63FF] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {triggeringFlowId
                  ? "english_text"
                  : runIntent.mode === "recover"
                    ? "english_text"
                    : "english_text"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Agent Console Messages */}
      {agentMessages.length > 0 && (
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-[#1A1A2E] mb-3 flex items-center gap-1.5">
            <Bot size={14} className="text-[#6C63FF]" />{" "}
            {t("automation.agentMessages")}
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {agentMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 text-xs ${msg.role === "user" ? "" : ""}`}
              >
                <span
                  className={`shrink-0 font-medium ${msg.role === "user" ? "text-[#6C63FF]" : "text-[#34D399]"}`}
                >
                  {msg.role === "user" ? "👤" : "🤖"}
                </span>
                <span className="text-[#4A5578]">{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Automation;
