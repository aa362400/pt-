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
    label: "Ozon 自动选品",
    description: "调用真实选品智能体，候选商品进入通知中心等待人工批准。",
  },
  {
    value: "listing.draft",
    label: "生成 Listing 草稿",
    description: "调用真实 Listing 生成接口，草稿进入人工审核。",
  },
  {
    value: "profit.calculate",
    label: "利润核算",
    description: "调用真实利润计算接口，需要售价和成本。",
  },
  {
    value: "task.create",
    label: "创建运营任务",
    description: "在团队任务里创建真实待办，不操作外部店铺。",
  },
  {
    value: "image.prompt",
    label: "图片提示词",
    description: "调用真实图片提示词智能体，结果进入审核。",
  },
];

const defaultFlowForm: FlowFormState = {
  name: "Ozon 自定义自动运营流程",
  description:
    "由前端创建，后端 Automation Worker 执行；外部店铺写入仍需人工确认。",
  triggerType: "MANUAL",
  status: "DRAFT",
  action: "product.research",
  query: "Ozon 高潜新品机会",
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
    name: "跨平台比价自动化",
    description:
      "本地模板骨架：只创建手动草稿流程；平台扫描、调价建议需要后端步骤返回证据。",
    icon: "DollarSign",
    category: "价格管理",
  },
  {
    id: "ft2",
    name: "新品上架全流程",
    description:
      "本地模板骨架：只保存上架步骤占位；SEO、图片生成、多平台发布未由模板证明已接入。",
    icon: "Rocket",
    category: "上架管理",
  },
  {
    id: "ft3",
    name: "差评预警 & 处置",
    description:
      "本地模板骨架：只创建处置草稿；评论监控、分级、自动处理需真实运行日志验收。",
    icon: "Shield",
    category: "客服管理",
  },
  {
    id: "ft4",
    name: "库存智能补货",
    description:
      "本地模板骨架：只保存补货流程结构；销售预测和采购建议不在前端模拟。",
    icon: "Package",
    category: "供应链",
  },
  {
    id: "ft5",
    name: "广告效果日报",
    description:
      "本地模板骨架：只创建日报草稿；广告数据拉取、报表生成、企业微信推送需后端接入。",
    icon: "BarChart3",
    category: "广告管理",
  },
  {
    id: "ft6",
    name: "竞品监控雷达",
    description:
      "本地模板骨架：只保存监控意图；竞品价格、销量、评分、新品动态不做本地假数据。",
    icon: "Eye",
    category: "市场研究",
  },
  {
    id: "ft7",
    name: "社交媒体舆情监控",
    description:
      "本地模板骨架：只创建舆情流程草稿；TikTok、Instagram、Reddit 抓取未由模板证明。",
    icon: "Globe",
    category: "品牌管理",
  },
  {
    id: "ft8",
    name: "财务对账自动化",
    description:
      "本地模板骨架：只保存对账步骤；结算报告拉取、ERP 对账、差异报表需要后端合同。",
    icon: "FileText",
    category: "财务管理",
  },
];

function summarizePlannerOutput(output: PlannerOutput | null): string {
  if (!output) return "Planner 智能体已完成，但后端未返回可展示结果。";
  if (output.summary) return output.summary;
  if (output.reply) return output.reply;
  if (output.message) return output.message;

  const detail = output.plan ?? output.result ?? output.steps ?? output;
  return `Planner 智能体已完成：${JSON.stringify(detail).slice(0, 500)}`;
}

function formatSuccessRate(successRate: number | null): string {
  return typeof successRate === "number" ? `${successRate}%` : "后端未返回";
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
        form.productName.trim() || form.query.trim() || "Ozon 自动运营待办",
      description: form.description.trim() || "由自动化流程创建的运营任务。",
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
          addToast("自动化流程加载失败，页面没有填充模拟流程。", "error");
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
        addToast("自动化流程加载失败，页面没有填充模拟流程。", "error");
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
    if (rates.length === 0) return "无样本";
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
      addToast("流程未启用，先启用后才能提交真实运行。", "error");
      return;
    }

    const mode = flow.latestRunError ? "recover" : "run";
    if (mode === "recover" && !flow.latestRunId) {
      addToast("后端没有返回可恢复的失败运行编号，恢复操作已阻断。", "error");
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
      addToast("请填写至少 8 个字的运行原因。", "error");
      return;
    }

    setTriggeringFlowId(runIntent.flowId);
    try {
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
            ? "已有真实恢复任务正在队列中，未重复创建。"
            : recovery.status === "already_created"
              ? "相同恢复申请已存在，未重复创建。"
              : "已创建新的真实恢复运行，旧失败记录仍保留供审计。",
          "success",
        );
      } else {
        const run = await automationApi.triggerRun(runIntent.flowId, {
          reason,
          idempotencyKey: runIntent.idempotencyKey,
        });
        addToast(
          run.idempotent
            ? "相同运行申请已存在，未重复入队。"
            : "已提交真实自动化运行，等待 Worker 执行结果。",
          "success",
        );
      }
      setRunIntent(null);
      await loadFlows();
      window.setTimeout(() => {
        void loadFlows();
      }, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`立即运行失败：${message}`, "error");
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
        `已创建真实草稿流程：${tpl.name}。模板步骤不会自动执行平台动作。`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`模板创建失败：${message}`, "error");
    } finally {
      setTemplateCreatingId(null);
    }
  };

  const handleCustomFlow = () => {
    setEditingFlowId(null);
    setFlowForm({
      ...defaultFlowForm,
      name: activeOzonChannel
        ? "Ozon 自定义自动运营流程"
        : "Ozon 自动运营流程（待绑定店铺）",
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
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`流程详情读取失败：${message}`, "error");
    }
  };

  const handleSubmitFlowForm = async () => {
    if (!flowForm.name.trim()) {
      addToast("流程名称不能为空。", "error");
      return;
    }
    if (
      flowForm.action === "profit.calculate" &&
      (!numericField(flowForm.salePrice) || !numericField(flowForm.productCost))
    ) {
      addToast("利润核算必须填写有效售价和成本。", "error");
      return;
    }
    if (flowForm.triggerType === "SCHEDULE" && flowForm.status !== "ACTIVE") {
      addToast("排期流程需要设为 ACTIVE 才会被调度器自动执行。", "error");
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
        addToast("自动化流程已真实更新到后端。", "success");
      } else {
        await automationApi.create({
          ...payload,
          workspaceId: activeOzonChannel?.workspaceId,
        });
        addToast("自动化流程已真实创建。", "success");
      }
      setFlowFormOpen(false);
      setEditingFlowId(null);
      await loadFlows();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`自动化流程保存失败：${message}`, "error");
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
          text: `已读取真实运行日志：共 ${runs.total} 条，最近 ${runs.items.length} 条。`,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`运行日志读取失败：${message}`, "error");
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    setOpenDropdownId(null);
    try {
      await automationApi.delete(flowId);
      setFlows((prev) => prev.filter((flow) => flow.id !== flowId));
      addToast("自动化流程已从后端删除。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      addToast(`删除失败：${message}`, "error");
    }
  };

  const handleAgentCommand = async (command: string) => {
    if (agentRunning) {
      addToast("Planner 智能体正在执行，请等待当前任务结束。", "info");
      return;
    }
    setAgentRunning(true);
    setAgentMessages((prev) => [
      ...prev,
      { role: "user", text: command },
      { role: "agent", text: "正在调用真实 Planner 智能体..." },
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
      const message = error instanceof Error ? error.message : "未知错误";
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: `Planner 智能体调用失败：${message}。页面没有生成本地假结果。`,
        },
      ]);
      addToast("Planner 智能体调用失败，未生成假结果。", "error");
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
              {t("automation.title")}与 Agent 执行台
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
          value="不估算"
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
                正在加载真实自动化流程...
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
                        最近运行失败：{flow.latestRunError}
                      </p>
                    )}
                    {flow.agentFailureClass ===
                      "agent_provider_unreachable" && (
                      <p className="mt-1 text-xs text-[#B45309] truncate">
                        真实智能体不可达，已进入退避；下次重试：
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
                          ? "先启用流程后才能运行"
                          : "立即提交真实自动化运行"
                      }
                    >
                      {triggeringFlowId === flow.id
                        ? "提交中"
                        : flow.latestRunError
                          ? "重试"
                          : "运行"}
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
            暂无后端实时队列进度，未展示模拟进度。
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
                      本地模板骨架
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
                      ? "创建中"
                      : "创建草稿，不执行平台动作"}
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
        title={editingFlowId ? "编辑 Ozon 自动化流程" : "新建 Ozon 自动化流程"}
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
              ? `已绑定 Ozon 渠道：${activeOzonChannel.externalShopId ?? activeOzonChannel.id}，新流程会绑定到该 workspace。`
              : "未检测到 SUCCESS 状态的 Ozon 渠道。仍可保存草稿，但排期自动执行需要先完成 Ozon 真实连接。"}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
              <span>流程名称</span>
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
              <span>描述</span>
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
              <span>触发方式</span>
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
                <option value="MANUAL">手动运行</option>
                <option value="SCHEDULE">自动排期</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[#4A5578]">
              <span>状态</span>
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
                <option value="DRAFT">草稿</option>
                <option value="ACTIVE">启用</option>
                <option value="PAUSED">暂停</option>
              </select>
            </label>
            {flowForm.triggerType === "SCHEDULE" && (
              <>
                <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                  <span>执行间隔（分钟）</span>
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
                  保存后立即进入调度队列
                </label>
              </>
            )}
          </div>

          <div className="rounded-xl border border-[#E8E8F0] p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#1A1A2E]">执行步骤</p>
              <p className="mt-1 text-xs text-[#8B93B5]">
                只允许选择后端 Automation Worker 已注册的真实步骤。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
                <span>步骤类型</span>
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
                <span>查询/目标</span>
                <input
                  value={flowForm.query}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="例如：Ozon 夏季家居高潜新品机会"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                <span>商品名称</span>
                <input
                  value={flowForm.productName}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      productName: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="Listing/图片/任务可用"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                <span>商品 ID</span>
                <input
                  value={flowForm.productId}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      productId: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="可选，使用本地 Product ID"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[#4A5578] md:col-span-2">
                <span>关键词</span>
                <input
                  value={flowForm.keywords}
                  onChange={(event) =>
                    setFlowForm((current) => ({
                      ...current,
                      keywords: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="逗号分隔"
                />
              </label>
              {flowForm.action === "profit.calculate" && (
                <>
                  <label className="space-y-1 text-xs font-medium text-[#4A5578]">
                    <span>售价</span>
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
                    <span>成本</span>
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
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSubmitFlowForm();
              }}
              disabled={flowFormSubmitting}
              className="h-9 rounded-lg bg-[#6C63FF] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {flowFormSubmitting ? "保存中" : "保存到后端"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(runIntent)}
        onClose={() => {
          if (!triggeringFlowId) setRunIntent(null);
        }}
        title={runIntent?.mode === "recover" ? "确认恢复流程" : "确认运行流程"}
      >
        {runIntent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#DDE1F2] bg-[#F8F9FF] p-3 text-sm leading-6 text-[#4A5578]">
              <div className="font-semibold text-[#1A1A2E]">
                {runIntent.flowName}
              </div>
              <div>
                {runIntent.mode === "recover"
                  ? "将创建新的恢复任务，原失败记录继续保留。"
                  : "将提交给本地 Worker 真实执行。"}
              </div>
              <div>发布、改价、库存和退款仍需单独人工批准。</div>
            </div>
            <label className="block text-sm font-medium text-[#4A5578]">
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
                className="mt-2 w-full resize-y rounded-lg border border-[#DDE1F2] px-3 py-2 text-sm outline-none focus:border-[#6C63FF]"
              />
            </label>
            <p className="text-xs leading-5 text-[#8B93B5]">
              本次确认会固定防重复编号；网络重试不会创建第二次运行。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRunIntent(null)}
                disabled={Boolean(triggeringFlowId)}
                className="h-9 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] disabled:opacity-50"
              >
                取消
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
                  ? "提交中"
                  : runIntent.mode === "recover"
                    ? "确认恢复"
                    : "确认运行"}
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
