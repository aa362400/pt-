import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clock3,
  Database,
  FileText,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  dailyProductResearchApi,
  type DailyCandidate,
  type DailyCandidateDetail,
  type DailyResearchRun,
  type DailyResearchSchedule,
  type ProductPerformance,
  type ResearchPricingMode,
  type ResearchArtifact,
  type ScoringVersion,
  type SourceHealth,
  type SupplierImageSearchEvidenceResponse,
} from "../api/dailyProductResearch";
import Modal from "../components/ui/Modal";
import { AiChannelPreflightWarning } from "../components/ops/AiChannelHealth";
import CandidateEvidenceImage from "../components/research/CandidateEvidenceImage";
import { useToast } from "../components/ui/use-toast";
import {
  researchBatchTelemetry,
  runIssuePresentation,
  sourceEvidenceMode,
  sourceExecutionTelemetry,
} from "../utils/daily-product-research-telemetry";
import { candidateDecisionDisplayStatus } from "../utils/daily-product-research-status";
import { marketEvidenceSourceLabel } from "../utils/market-evidence-source";
import {
  candidateChineseName,
  candidatePrimaryImage,
  candidateRawEvidence,
  supplierOfferDetailUrl,
  supplierOfferImageUrl,
} from "../utils/daily-product-research-candidate";
import {
  researchArtifactLabel,
  researchConfigLabel,
  researchScoreComponentLabel,
  researchSignalMetricLabel,
  researchSignalUnitLabel,
  researchSourceLabel,
  researchThresholdLabel,
  researchTriggerLabel,
} from "../utils/daily-product-research-localization";
import { safeExternalEvidenceUrl } from "../utils/safe-external-url";
import {
  reconcileResearchRunSelection,
  researchRunRefreshInterval,
  shouldApplyRunDataResponse,
  type ResearchRunSelectionMode,
} from "../utils/daily-product-research-run-selection";
import { customerErrorPresentation } from "../utils/customer-facing-language";
import { candidateEvidencePresentation } from "../utils/daily-product-research-evidence";

type ViewTab = "today" | "sources" | "scoring" | "history";
type DecisionAction = "approve" | "reject";
type ResearchCategory = "LIGHT_HOME" | "PET" | "TRAVEL";

const categorySeedQueries: Record<ResearchCategory, string[]> = {
  LIGHT_HOME: ["lightweight home organizer", "compact storage accessory"],
  PET: ["lightweight pet accessory", "compact pet travel accessory"],
  TRAVEL: ["lightweight travel accessory", "compact luggage organizer"],
};

const statusText: Record<string, string> = {
  DRY_RUN: "演练模式",
  SHADOW: "影子模式",
  PILOT: "灰度模式",
  GENERAL: "正式只读",
  PENDING: "排队中",
  RUNNING: "运行中",
  PARTIAL: "部分数据完成",
  COMPLETED: "已完成",
  COMPLETE: "覆盖完整",
  FAILED: "失败",
  CANCELLED: "已取消",
  PAUSED: "已暂停",
  STOPPED: "已安全停止",
  ACTIVE: "已启用",
  DRAFT: "草稿",
  RETIRED: "已停用",
  UNSCORED: "未评分",
  HEALTHY: "健康",
  DEGRADED: "降级",
  NOT_CONFIGURED: "未配置",
  CSV_ONLY: "仅导入",
  DISABLED: "已停用",
  NOT_AVAILABLE: "暂无回传",
  SYNCING: "同步中",
  TEST_NOW: "建议打样",
  WATCH: "观察",
  HOLD: "暂缓",
  MANUAL_PRICING_REQUIRED: "待人工核价",
  REJECT: "淘汰",
  STRONG: "强证据",
  MEDIUM: "中等证据",
  WEAK: "弱证据",
  INVALID: "证据不足",
};

const gateLabels: Record<string, string> = {
  DEMAND_WEAK: "需求证据只有一个来源，暂不足以证明市场需求",
  DEMAND_INVALID: "缺少可验证的需求数据",
  "MISSING_REQUIRED_COST:PRODUCT": "缺少真实采购成本",
  "MISSING_REQUIRED_COST:SHIPPING": "缺少真实物流成本",
  MANUAL_PRICING_REQUIRED: "已选择人工核价，发布前必须补齐并复核成本",
  RISK_EVIDENCE_MISSING: "缺少可审计的风险核验，等待人工复核",
  MISSING_VERIFIED_PROFIT: "缺少可复核的利润结果",
  OZON_PUBLIC_SUPPLY_EVIDENCE_MISSING: "缺少 Ozon 公开供给证据",
  OZON_PUBLIC_SUPPLY_NOT_LOW: "Ozon 同类供给较多，不符合低竞争要求",
  AD_RATE_EVIDENCE_MISSING: "缺少广告费率依据",
  PAYMENT_FEE_RATE_EVIDENCE_MISSING: "缺少支付与回款费率依据",
  PLATFORM_FEE_RATE_EVIDENCE_MISSING: "缺少平台佣金依据",
  PRODUCT_IMAGE_EVIDENCE_MISSING: "缺少可追溯的真实商品图片",
  REFUND_RATE_EVIDENCE_MISSING: "缺少退款与损耗率依据",
  SALE_PRICE_EVIDENCE_MISSING: "缺少真实销售价格依据",
  SUPPLIER_COST_EVIDENCE_MISSING: "缺少真实供应商成本依据",
};

function gateLabel(reason: string): string {
  return gateLabels[reason] ?? "其他需复核门禁";
}

function sourceFailureLabel(code: string | null): string {
  if (code === "NO_VERIFIED_OZON_EVIDENCE") {
    return "近 7 天没有可复用的 Ozon 已验证证据";
  }
  return code ? "该来源暂时不可用，请稍后重试" : "无";
}

function timezoneLabel(value: string): string {
  if (value === "Asia/Shanghai") return "中国标准时间（上海）";
  if (value === "Europe/Moscow") return "莫斯科时间";
  if (value === "UTC") return "世界协调时间";
  return "已配置时区";
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "未返回";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}

function statusStyle(status: string): string {
  if (
    ["COMPLETED", "COMPLETE", "HEALTHY", "TEST_NOW", "ACTIVE"].includes(status)
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["RUNNING", "PENDING", "SYNCING", "WATCH", "DRAFT", "UNSCORED"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (
    [
      "PARTIAL",
      "DEGRADED",
      "HOLD",
      "CSV_ONLY",
      "NOT_CONFIGURED",
      "NOT_AVAILABLE",
      "MANUAL_PRICING_REQUIRED",
      "MEDIUM",
      "WEAK",
    ].includes(status)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${statusStyle(status)}`}
    >
      {statusText[status] ?? "状态待确认"}
    </span>
  );
}

function scoreValue(value: string | number | undefined): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : "未评分";
}

function ratioValue(value: number | null): string {
  return value === null ? "不可用" : `${(value * 100).toFixed(1)}%`;
}

function currencyValues(values: Record<string, number>): string {
  const entries = Object.entries(values);
  return entries.length
    ? entries
        .map(([currency, value]) => `${currency} ${value.toFixed(2)}`)
        .join(" / ")
    : "无实际回传";
}

export default function DailyProductResearch() {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ViewTab>("today");
  const [runs, setRuns] = useState<DailyResearchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<DailyResearchRun | null>(null);
  const [candidates, setCandidates] = useState<DailyCandidate[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [scoringVersions, setScoringVersions] = useState<ScoringVersion[]>([]);
  const [schedule, setSchedule] = useState<{
    enabled: boolean;
    nextRunAt: string | null;
    localTime: string;
    timezone: string;
  }>({
    enabled: false,
    nextRunAt: null,
    localTime: "08:00",
    timezone: "Asia/Shanghai",
  });
  const [pricingMode, setPricingMode] =
    useState<ResearchPricingMode>("MANUAL");
  const [runWizardOpen, setRunWizardOpen] = useState(false);
  const [runWizardStep, setRunWizardStep] = useState(1);
  const [researchCategory, setResearchCategory] =
    useState<ResearchCategory>("LIGHT_HOME");
  const [seedQueryText, setSeedQueryText] = useState("");
  const [runtime, setRuntime] = useState<DailyResearchSchedule["runtime"]>({
    mode: "DRY_RUN",
    schedulerAllowed: false,
    realConnectorsAllowed: false,
    internalActionsAllowed: false,
    visibleToMembers: false,
    externalStoreMutation: false,
  });
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [candidateDetail, setCandidateDetail] =
    useState<DailyCandidateDetail | null>(null);
  const [candidatePerformance, setCandidatePerformance] =
    useState<ProductPerformance | null>(null);
  const [supplierImageEvidence, setSupplierImageEvidence] =
    useState<SupplierImageSearchEvidenceResponse | null>(null);
  const [supplierEvidenceError, setSupplierEvidenceError] = useState<
    string | null
  >(null);
  const [decision, setDecision] = useState<{
    candidate: DailyCandidate;
    action: DecisionAction;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [artifactPreview, setArtifactPreview] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const selectionModeRef = useRef<ResearchRunSelectionMode>("AUTO");
  const runDataRequestIdRef = useRef(0);
  const listLoadRequestIdRef = useRef(0);
  const listLoadInFlightRef = useRef(false);
  const retryRunInFlightRef = useRef(false);
  const candidateDetailRequestIdRef = useRef(0);
  const queryRunOpenedRef = useRef<string | null>(null);

  const loadRunData = useCallback(async (runId: string) => {
    const requestId = ++runDataRequestIdRef.current;
    const [runResult, candidateResult, sourceResult, artifactResult] =
      await Promise.allSettled([
        dailyProductResearchApi.getRun(runId),
        dailyProductResearchApi.listCandidates(runId, { page: 1, limit: 100 }),
        dailyProductResearchApi.sourceHealth(runId),
        dailyProductResearchApi.artifacts(runId),
      ]);
    if (
      !shouldApplyRunDataResponse({
        requestId,
        latestRequestId: runDataRequestIdRef.current,
        runId,
        selectedRunId: selectedRunIdRef.current,
      })
    ) {
      return false;
    }
    if (runResult.status === "fulfilled") setSelectedRun(runResult.value.run);
    if (candidateResult.status === "fulfilled")
      setCandidates(candidateResult.value.items);
    else setCandidates([]);
    if (sourceResult.status === "fulfilled")
      setSourceHealth(sourceResult.value.items);
    else setSourceHealth([]);
    if (artifactResult.status === "fulfilled")
      setArtifacts(artifactResult.value.items);
    else setArtifacts([]);
    return true;
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet && listLoadInFlightRef.current) return;

      const requestId = ++listLoadRequestIdRef.current;
      listLoadInFlightRef.current = true;
      if (!quiet) setLoading(true);
      try {
        const [runResult, scheduleResult, scoringResult] =
          await Promise.allSettled([
            dailyProductResearchApi.listRuns({ page: 1, limit: 50 }),
            quiet ? Promise.resolve(null) : dailyProductResearchApi.getSchedule(),
            quiet
              ? Promise.resolve(null)
              : dailyProductResearchApi.listScoringVersions(),
          ]);

        if (requestId !== listLoadRequestIdRef.current) return;

        if (runResult.status === "fulfilled") {
          const items = runResult.value.items;
          setRuns(items);
          const currentRunId = selectedRunIdRef.current;
          const nextSelection = reconcileResearchRunSelection(
            items,
            currentRunId,
            selectionModeRef.current,
          );
          selectionModeRef.current = nextSelection.mode;
          selectedRunIdRef.current = nextSelection.runId;
          setSelectedRunId(nextSelection.runId);

          if (nextSelection.runId) {
            const summaryRun =
              items.find((run) => run.id === nextSelection.runId) ?? null;
            const selectionChanged = nextSelection.runId !== currentRunId;

            if (selectionChanged) {
              candidateDetailRequestIdRef.current += 1;
              setRunningAction((current) =>
                current?.startsWith("candidate:") ? null : current,
              );
              setSelectedRun(summaryRun);
              setCandidates([]);
              setSourceHealth([]);
              setArtifacts([]);
              setCandidateDetail(null);
              setCandidatePerformance(null);
              setSupplierImageEvidence(null);
              setSupplierEvidenceError(null);
            } else if (summaryRun) {
              setSelectedRun((current) =>
                current?.id === summaryRun.id
                  ? { ...current, ...summaryRun }
                  : summaryRun,
              );
            }

            if (
              selectionChanged ||
              researchRunRefreshInterval(summaryRun?.status ?? null) === 5_000
            ) {
              await loadRunData(nextSelection.runId);
            } else {
              runDataRequestIdRef.current += 1;
            }
          } else {
            runDataRequestIdRef.current += 1;
            candidateDetailRequestIdRef.current += 1;
            setRunningAction((current) =>
              current?.startsWith("candidate:") ? null : current,
            );
            setSelectedRun(null);
            setCandidates([]);
            setSourceHealth([]);
            setArtifacts([]);
            setCandidateDetail(null);
            setCandidatePerformance(null);
            setSupplierImageEvidence(null);
            setSupplierEvidenceError(null);
          }
        } else if (!quiet) {
          addToast(
            runResult.reason instanceof Error
              ? runResult.reason.message
              : "每日选品运行记录读取失败",
            "error",
          );
        }
        if (!quiet && scheduleResult.status === "fulfilled" && scheduleResult.value) {
          setRuntime(scheduleResult.value.runtime);
          setSchedule({
            enabled: scheduleResult.value.enabled,
            nextRunAt: scheduleResult.value.nextRunAt,
            localTime: scheduleResult.value.triggerConfig.dailyAt ?? "08:00",
            timezone:
              scheduleResult.value.triggerConfig.timezone ?? "Asia/Shanghai",
          });
          setPricingMode(
            scheduleResult.value.triggerConfig.pricingMode === "AUTO"
              ? "AUTO"
              : "MANUAL",
          );
        }
        if (!quiet && scoringResult.status === "fulfilled" && scoringResult.value)
          setScoringVersions(scoringResult.value.items);
      } finally {
        if (requestId === listLoadRequestIdRef.current) {
          listLoadInFlightRef.current = false;
          if (!quiet) setLoading(false);
        }
      }
    },
    [addToast, loadRunData],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = researchRunRefreshInterval(selectedRun?.status ?? null);
    const timer = window.setInterval(() => void load(true), interval);
    return () => window.clearInterval(timer);
  }, [load, selectedRun?.status]);

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
    return candidates.filter((candidate) => {
      const score = candidate.scores[0];
      if (decisionFilter && score?.decision !== decisionFilter) return false;
      if (!normalizedSearch) return true;
      return [
        candidateChineseName(candidate),
        candidate.canonicalName,
        candidate.productType,
        candidate.material,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("zh-CN").includes(normalizedSearch),
        );
    });
  }, [candidates, decisionFilter, search]);

  const summary = useMemo(() => {
    const counts = { TEST_NOW: 0, WATCH: 0, HOLD: 0, REJECT: 0 };
    for (const candidate of candidates) {
      const decision = candidate.scores[0]?.decision;
      if (decision && decision in counts)
        counts[decision as keyof typeof counts] += 1;
    }
    return counts;
  }, [candidates]);
  const sourcingLeads = useMemo(
    () =>
      candidateDetail
        ? candidateRawEvidence(candidateDetail.rawSummary).filter(
            (item) => item.source === "1688_public_sourcing_lead",
          )
        : [],
    [candidateDetail],
  );
  const sourcingQueries = useMemo(
    () =>
      candidateDetail
        ? [
            ...new Set(
              candidateRawEvidence(candidateDetail.rawSummary)
                .map((item) => item.sourcingQueryZh)
                .filter((value): value is string => Boolean(value)),
            ),
          ]
        : [],
    [candidateDetail],
  );
  const candidateDetailChineseName = candidateDetail
    ? candidateChineseName(candidateDetail)
    : "";
  const candidateDetailImage = candidateDetail
    ? candidatePrimaryImage(candidateDetail.rawSummary)
    : null;
  const latestSupplierImageEvidence = supplierImageEvidence?.items[0] ?? null;

  const batchTelemetry = useMemo(
    () =>
      selectedRun
        ? researchBatchTelemetry(selectedRun, candidates.length)
        : null,
    [candidates.length, selectedRun],
  );
  const runIssue = selectedRun ? runIssuePresentation(selectedRun) : null;
  const canRetrySelectedRun = Boolean(
    selectedRun &&
      (selectedRun.status === "FAILED" ||
        selectedRun.errorSummary?.code === "EVIDENCE_INSUFFICIENT"),
  );
  const runErrorPresentation = selectedRun?.errorSummary
    ? customerErrorPresentation(
        selectedRun.errorSummary.code,
        selectedRun.errorSummary.message,
      )
    : null;

  const startRun = async () => {
    setRunningAction("start");
    try {
      const result = await dailyProductResearchApi.startManual({
        timezone: schedule.timezone,
        candidateLimit: 10,
        topLimit: 10,
        pricingMode,
        seedQueries: seedQueryText
          .split(/[，,\n]/u)
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 8)
          .concat(seedQueryText.trim() ? [] : categorySeedQueries[researchCategory]),
      });
      listLoadRequestIdRef.current += 1;
      selectionModeRef.current = "AUTO";
      selectedRunIdRef.current = result.run.id;
      setSelectedRunId(result.run.id);
      addToast(
        result.reused
          ? "今日相同配置已运行，已打开原运行记录"
          : "每日精准选品已进入真实任务队列",
        "success",
      );
      setRunWizardOpen(false);
      setRunWizardStep(1);
      await loadRunData(result.run.id);
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "启动失败", "error");
    } finally {
      setRunningAction(null);
    }
  };

  const saveSchedule = async () => {
    setRunningAction("schedule");
    try {
      const result = await dailyProductResearchApi.updateSchedule({
        enabled: schedule.enabled,
        localTime: schedule.localTime,
        timezone: schedule.timezone,
        pricingMode,
      });
      setSchedule((current) => ({ ...current, nextRunAt: result.nextRunAt }));
      addToast(
        schedule.enabled ? "每日自动调研计划已启用" : "每日自动调研计划已暂停",
        "success",
      );
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "计划保存失败",
        "error",
      );
    } finally {
      setRunningAction(null);
    }
  };

  const cancelRun = async () => {
    if (!selectedRun) return;
    setRunningAction("cancel");
    try {
      await dailyProductResearchApi.cancelRun(selectedRun.id);
      addToast("运行已取消", "success");
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "取消失败", "error");
    } finally {
      setRunningAction(null);
    }
  };

  const retryRun = async () => {
    const run = selectedRun;
    if (
      !run ||
      !canRetrySelectedRun ||
      retryRunInFlightRef.current
    ) {
      return;
    }

    retryRunInFlightRef.current = true;
    setRunningAction(`retry:${run.id}`);
    try {
      const retriedRun = await dailyProductResearchApi.retryRun(run.id);
      if (selectedRunIdRef.current === run.id) {
        setSelectedRun((current) =>
          current?.id === run.id ? { ...current, ...retriedRun } : retriedRun,
        );
      }
      addToast("已提交重试，将从安全检查点继续运行", "success");
      await load();
    } catch (error) {
      addToast(
        `重试失败：${error instanceof Error ? error.message : "请稍后再试"}`,
        "error",
      );
    } finally {
      retryRunInFlightRef.current = false;
      setRunningAction(null);
    }
  };

  const openCandidate = async (candidate: DailyCandidate) => {
    const requestId = ++candidateDetailRequestIdRef.current;
    setRunningAction(`candidate:${candidate.id}`);
    setCandidateDetail(null);
    setCandidatePerformance(null);
    setSupplierImageEvidence(null);
    setSupplierEvidenceError(null);
    try {
      const [detailResult, performanceResult, supplierEvidenceResult] =
        await Promise.allSettled([
        dailyProductResearchApi.getCandidate(candidate.id),
        dailyProductResearchApi.candidatePerformance(candidate.id),
        dailyProductResearchApi.supplierImageSearchEvidence(candidate.id, 20),
      ]);
      if (detailResult.status !== "fulfilled") {
        throw detailResult.reason;
      }
      if (requestId !== candidateDetailRequestIdRef.current) return;
      const detail = detailResult.value;
      setCandidateDetail({
        ...detail.candidate,
        capabilities: detail.capabilities,
        _count: detail.candidate._count ?? {
          signals: detail.candidate.signals?.length ?? 0,
        },
      });
      setCandidatePerformance(
        performanceResult.status === "fulfilled"
          ? performanceResult.value
          : null,
      );
      if (supplierEvidenceResult.status === "fulfilled") {
        setSupplierImageEvidence(supplierEvidenceResult.value);
      } else {
        setSupplierEvidenceError("1688 图片找同款证据读取失败，请稍后重试。");
      }
    } catch (error) {
      if (requestId !== candidateDetailRequestIdRef.current) return;
      addToast(
        error instanceof Error ? error.message : "候选详情读取失败",
        "error",
      );
    } finally {
      if (requestId === candidateDetailRequestIdRef.current) {
        setRunningAction(null);
      }
    }
  };

  const submitDecision = async () => {
    if (!decision || decisionReason.trim().length < 3) return;
    setRunningAction("decision");
    try {
      if (decision.action === "approve") {
        await dailyProductResearchApi.approveDevelopment(
          decision.candidate.id,
          decisionReason.trim(),
        );
        addToast(
          "已创建内部开发任务；未发布商品、未改价、未启动广告",
          "success",
        );
      } else {
        await dailyProductResearchApi.rejectCandidate(
          decision.candidate.id,
          decisionReason.trim(),
        );
        addToast("候选已驳回，原因已进入反馈记录", "success");
      }
      setDecision(null);
      setDecisionReason("");
      if (selectedRunId) await loadRunData(selectedRunId);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setRunningAction(null);
    }
  };

  const previewArtifact = async (artifact: ResearchArtifact) => {
    if (!selectedRunId) return;
    setRunningAction(`artifact:${artifact.id}`);
    try {
      const result = await dailyProductResearchApi.artifactContent(
        selectedRunId,
        artifact.id,
      );
      setArtifactPreview({
        title: researchArtifactLabel(artifact.artifactType),
        content: result.artifact.content,
      });
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "报告读取失败",
        "error",
      );
    } finally {
      setRunningAction(null);
    }
  };

  const selectRun = useCallback(async (runId: string) => {
    selectionModeRef.current = "MANUAL";
    selectedRunIdRef.current = runId;
    setSelectedRunId(runId);
    runDataRequestIdRef.current += 1;
    candidateDetailRequestIdRef.current += 1;
    setRunningAction((current) =>
      current?.startsWith("candidate:") ? null : current,
    );
    setSelectedRun(runs.find((run) => run.id === runId) ?? null);
    setCandidates([]);
    setSourceHealth([]);
    setArtifacts([]);
    setCandidateDetail(null);
    setCandidatePerformance(null);
    setSupplierImageEvidence(null);
    setSupplierEvidenceError(null);
    setLoading(true);
    await loadRunData(runId);
    if (selectedRunIdRef.current === runId) setLoading(false);
  }, [loadRunData, runs]);

  useEffect(() => {
    const requestedRunId = searchParams.get("run");
    if (!requestedRunId) {
      queryRunOpenedRef.current = null;
      return;
    }
    if (
      loading ||
      queryRunOpenedRef.current === requestedRunId ||
      !runs.some((run) => run.id === requestedRunId)
    ) {
      return;
    }
    queryRunOpenedRef.current = requestedRunId;
    void selectRun(requestedRunId);
  }, [loading, runs, searchParams, selectRun]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-5 lg:px-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="mb-1 text-xs font-medium text-blue-700">
            证据驱动 · 人工门禁 · 无外部写操作
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">
            每日精准选品
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            每天汇总真实来源；可先选品后人工核价，未核价候选不能发布。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            title="刷新"
            onClick={() => void load()}
            className="grid h-10 w-10 place-items-center border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {selectedRun &&
          ["PENDING", "RUNNING"].includes(selectedRun.status) ? (
            <button
              type="button"
              onClick={() => void cancelRun()}
              disabled={runningAction !== null}
              className="inline-flex h-10 items-center gap-2 border border-red-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <CircleStop className="h-4 w-4" />
              取消运行
            </button>
          ) : null}
          <StatusBadge status={runtime.mode} />
          <label className="flex h-10 items-center gap-3 border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <span>
              <span className="block font-medium">人工核价</span>
              <span className="block text-[10px] leading-3 text-slate-500">
                {pricingMode === "MANUAL" ? "先找品，后补成本" : "自动核验真实费用"}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="人工核价"
              aria-checked={pricingMode === "MANUAL"}
              checked={pricingMode === "MANUAL"}
              disabled={runningAction !== null}
              onChange={(event) =>
                setPricingMode(event.target.checked ? "MANUAL" : "AUTO")
              }
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setRunWizardStep(1);
              setRunWizardOpen(true);
            }}
            disabled={
              runningAction !== null ||
              ["DISABLED", "DRY_RUN"].includes(runtime.mode)
            }
            title={
              runtime.mode === "DRY_RUN"
                ? "DRY_RUN 仅接受经过 Schema 校验的人工或 CSV 证据输入"
                : undefined
            }
            className="inline-flex h-10 items-center gap-2 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {runningAction === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {t("dailyResearchWizard.open")}
          </button>
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t("dailyResearchWizard.relatedPages")}>
        {[
          ["/daily-product-research", "dailyResearchWizard.tabs.daily"],
          ["/product-research", "dailyResearchWizard.tabs.research"],
          ["/ozon-observations", "dailyResearchWizard.tabs.ozon"],
          ["/trend-radar", "dailyResearchWizard.tabs.trends"],
        ].map(([to, labelKey]) => (
          <Link
            key={to}
            to={to}
            aria-current={to === "/daily-product-research" ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              to === "/daily-product-research"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t(labelKey)}
          </Link>
        ))}
      </nav>

      <Modal
        open={runWizardOpen}
        onClose={() => {
          if (runningAction !== "start") setRunWizardOpen(false);
        }}
        title={t("dailyResearchWizard.title")}
        width="max-w-2xl"
      >
        <div className="mb-6 grid grid-cols-3 gap-2" aria-label={t("dailyResearchWizard.progress")}>
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`border px-3 py-2 text-center text-xs font-semibold ${
                step === runWizardStep
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : step < runWizardStep
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-400"
              }`}
            >
              {t(`dailyResearchWizard.steps.${step}`)}
            </div>
          ))}
        </div>

        {runWizardStep === 1 ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-800">
              {t("dailyResearchWizard.category")}
              <select
                value={researchCategory}
                onChange={(event) => setResearchCategory(event.target.value as ResearchCategory)}
                className="mt-2 h-10 w-full border border-slate-300 bg-white px-3"
              >
                <option value="LIGHT_HOME">{t("dailyResearchWizard.categories.lightHome")}</option>
                <option value="PET">{t("dailyResearchWizard.categories.pet")}</option>
                <option value="TRAVEL">{t("dailyResearchWizard.categories.travel")}</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-800">
              {t("dailyResearchWizard.keywords")}
              <textarea
                value={seedQueryText}
                onChange={(event) => setSeedQueryText(event.target.value)}
                rows={3}
                placeholder={t("dailyResearchWizard.keywordsPlaceholder")}
                className="mt-2 w-full border border-slate-300 p-3 text-sm"
              />
            </label>
            <p className="text-xs leading-5 text-slate-500">{t("dailyResearchWizard.keywordHelp")}</p>
          </div>
        ) : null}

        {runWizardStep === 2 ? (
          <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">{t("dailyResearchWizard.confirm.category")}</dt><dd className="mt-1 font-semibold text-slate-900">{t(`dailyResearchWizard.categories.${researchCategory === "LIGHT_HOME" ? "lightHome" : researchCategory === "PET" ? "pet" : "travel"}`)}</dd></div>
            <div><dt className="text-slate-500">{t("dailyResearchWizard.confirm.candidates")}</dt><dd className="mt-1 font-semibold text-slate-900">10</dd></div>
            <div><dt className="text-slate-500">{t("dailyResearchWizard.confirm.pricing")}</dt><dd className="mt-1 font-semibold text-slate-900">{pricingMode === "MANUAL" ? t("dailyResearchWizard.manualPricing") : t("dailyResearchWizard.autoPricing")}</dd></div>
            <div><dt className="text-slate-500">{t("dailyResearchWizard.confirm.timezone")}</dt><dd className="mt-1 font-semibold text-slate-900">{timezoneLabel(schedule.timezone)}</dd></div>
          </dl>
        ) : null}

        {runWizardStep === 3 ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
            <p className="font-semibold">{t("dailyResearchWizard.readyTitle")}</p>
            <p className="mt-1">{t("dailyResearchWizard.readyDescription")}</p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={runWizardStep === 1 || runningAction === "start"}
            onClick={() => setRunWizardStep((current) => Math.max(1, current - 1))}
            className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {t("dailyResearchWizard.previous")}
          </button>
          {runWizardStep < 3 ? (
            <button type="button" onClick={() => setRunWizardStep((current) => Math.min(3, current + 1))} className="bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              {t("dailyResearchWizard.next")}
            </button>
          ) : (
            <button type="button" onClick={() => void startRun()} disabled={runningAction === "start"} className="inline-flex items-center gap-2 bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {runningAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("dailyResearchWizard.start")}
            </button>
          )}
        </div>
      </Modal>

      <AiChannelPreflightWarning requiredChannels={["llm", "search"]} />

      <section className="mb-5 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "运行状态",
            selectedRun
              ? (statusText[selectedRun.status] ?? selectedRun.status)
              : "尚无运行",
            Clock3,
          ],
          ["待人工核价", String(summary.HOLD), Scale],
          ["建议打样", String(summary.TEST_NOW), CheckCircle2],
          ["硬门禁淘汰", String(summary.REJECT), ShieldCheck],
          ["数据来源", String(sourceHealth.length), Database],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className="bg-white px-4 py-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>{label as string}</span>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-xl font-semibold text-slate-950">
              {value as string}
            </div>
          </div>
        ))}
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div
          className="flex overflow-x-auto"
          role="tablist"
          aria-label="每日精准选品视图"
        >
          {(
            [
              ["today", "今日候选"],
              ["sources", "来源健康"],
              ["scoring", "评分配置"],
              ["history", "运行历史"],
            ] as Array<[ViewTab, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === value}
              key={value}
              onClick={() => setTab(value)}
              className={`h-10 border-b-2 px-4 text-sm font-medium ${
                tab === value
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="pb-2 text-xs text-slate-500">
          {selectedRun
            ? `${selectedRun.businessDate.slice(0, 10)} · ${timezoneLabel(selectedRun.scheduleTimezone)}`
            : "等待首次运行"}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          读取真实运行数据
        </div>
      ) : null}

      {!loading && tab === "today" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索候选"
                    className="h-9 w-56 border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    value={decisionFilter}
                    onChange={(event) => setDecisionFilter(event.target.value)}
                    className="h-9 appearance-none border border-slate-300 bg-white pl-9 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">全部决策</option>
                    <option value="TEST_NOW">建议打样</option>
                    <option value="WATCH">观察</option>
                    <option value="HOLD">暂缓</option>
                    <option value="REJECT">淘汰</option>
                  </select>
                </div>
              </div>
              <span className="text-xs text-slate-500">
                显示 {filteredCandidates.length} / {candidates.length}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full min-w-[880px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">商品图片 / 候选商品</th>
                    <th className="px-4 py-3">需求证据</th>
                    <th className="px-4 py-3">评分</th>
                    <th className="px-4 py-3">决策</th>
                    <th className="px-4 py-3">风险 / 门禁</th>
                    <th className="px-4 py-3 text-right">查看</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredCandidates.map((candidate) => {
                    const score = candidate.scores[0];
                    const evidenceState = candidateEvidencePresentation(candidate);
                    const customerName = candidateChineseName(candidate);
                    const primaryImage = candidatePrimaryImage(
                      candidate.rawSummary,
                    );
                    return (
                      <tr key={candidate.id} className="hover:bg-slate-50/70">
                        <td className="max-w-xs px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CandidateEvidenceImage
                              imageUrl={primaryImage?.imageUrl ?? null}
                              evidenceUrl={primaryImage?.evidenceUrl ?? null}
                              alt={customerName}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">
                                {customerName}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                轻小件候选 · 材质与规格待供应商确认
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">
                                点击图片或文字打开图片证据页
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {evidenceState.insufficient ? (
                            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                              <div className="font-semibold">{t("dailyResearchEvidence.insufficient")}</div>
                              <p className="mt-1 text-xs">{t("dailyResearchEvidence.ozonCount", { found: evidenceState.found, required: evidenceState.required })}</p>
                              <p className="mt-1 text-xs font-medium">{t("dailyResearchEvidence.priceUnverified")}</p>
                              <button
                                type="button"
                                onClick={() => void retryRun()}
                                disabled={!canRetrySelectedRun || runningAction !== null}
                                className="mt-2 inline-flex items-center gap-1 border border-amber-400 bg-white px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50"
                              >
                                <RefreshCw className="h-3 w-3" />
                                {t("dailyResearchEvidence.retry")}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium text-slate-800">
                                {statusText[candidate.signalStrength] ?? "证据状态待确认"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {candidate._count?.signals ?? candidate.signals?.length ?? 0} 条信号 · 置信度 {candidate.confidenceScore}
                              </div>
                              {evidenceState.code ? (
                                <p className="mt-1 text-xs text-red-700">{t("dailyResearchEvidence.unknownError", { code: evidenceState.code })}</p>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {scoreValue(score?.finalScore)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={candidateDecisionDisplayStatus(
                              score?.decision,
                              score?.hardGateReasons ?? [],
                            )}
                          />
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                          {score?.hardGateReasons.length
                            ? score.hardGateReasons
                                .slice(0, 2)
                                .map(gateLabel)
                                .join("；")
                            : candidate.risks.length
                              ? `${candidate.risks.length} 条风险记录`
                              : "无硬门禁"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            title="查看候选详情"
                            onClick={() => void openCandidate(candidate)}
                            className="inline-grid h-8 w-8 place-items-center text-blue-700 hover:bg-blue-50"
                          >
                            {runningAction === `candidate:${candidate.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredCandidates.length === 0 ? (
                <div className="border-t border-slate-100 px-6 py-14 text-center">
                  <Search className="mx-auto mb-3 h-6 w-6 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">
                    没有符合当前条件的候选
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    系统不会为了凑满 Top 10 编造或补齐商品。
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4">
            {selectedRun && batchTelemetry ? (
              <section className="border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    运行详情
                  </h2>
                </div>
                <dl className="grid grid-cols-2 gap-px bg-slate-200 text-xs">
                  {[
                    ["请求候选", batchTelemetry.requested],
                    ["处理候选", batchTelemetry.processed],
                    ["批次短缺", batchTelemetry.shortfall ?? "运行中"],
                    [
                      "核价方式",
                      selectedRun.configSnapshot?.pricingMode === "MANUAL"
                        ? "人工核价"
                        : "自动核价",
                    ],
                    [
                      "选品规则",
                      researchConfigLabel(selectedRun.configVersion ?? ""),
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="min-w-0 bg-slate-50 p-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd
                        className="mt-1 break-all font-semibold text-slate-900"
                        title={String(value)}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <section className="border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  每日计划
                </h2>
              </div>
              <label className="mb-3 flex items-center justify-between text-sm text-slate-700">
                <span>自动运行</span>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  disabled={!runtime.schedulerAllowed}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-blue-600"
                />
              </label>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                当前 {statusText[runtime.mode] ?? "只读模式"}：
                {runtime.realConnectorsAllowed
                  ? "允许已批准只读来源"
                  : "真实来源关闭"}
                ；外部店铺写入始终关闭。
              </p>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <input
                  type="time"
                  value={schedule.localTime}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      localTime: event.target.value,
                    }))
                  }
                  className="h-9 border border-slate-300 px-2 text-sm"
                />
                <select
                  value={schedule.timezone}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  className="h-9 min-w-0 border border-slate-300 px-2 text-sm"
                >
                  {!['Asia/Shanghai', 'Europe/Moscow', 'UTC'].includes(
                    schedule.timezone,
                  ) ? (
                    <option value={schedule.timezone}>已配置时区</option>
                  ) : null}
                  <option value="Asia/Shanghai">中国标准时间（上海）</option>
                  <option value="Europe/Moscow">莫斯科时间</option>
                  <option value="UTC">世界协调时间</option>
                </select>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                下次运行：{formatTime(schedule.nextRunAt)}
              </p>
              <button
                type="button"
                onClick={() => void saveSchedule()}
                disabled={runningAction !== null || !runtime.schedulerAllowed}
                className="mt-3 h-9 w-full border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {runningAction === "schedule" ? "保存中..." : "保存计划"}
              </button>
            </section>

            <section className="border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  报告产物
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {artifacts.map((artifact) => (
                  <button
                    type="button"
                    key={artifact.id}
                    onClick={() => void previewArtifact(artifact)}
                    className="flex w-full items-center justify-between gap-3 py-2 text-left text-xs hover:text-blue-700"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {researchArtifactLabel(artifact.artifactType)}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {Math.ceil(artifact.byteSize / 1024)} KB
                    </span>
                  </button>
                ))}
                {artifacts.length === 0 ? (
                  <p className="py-3 text-xs text-slate-500">
                    本次运行尚未生成报告。
                  </p>
                ) : null}
              </div>
            </section>

            {selectedRun &&
            (selectedRun.status === "FAILED" ||
              (selectedRun.errorSummary && runIssue)) ? (
              <section
                className={
                  selectedRun.status === "FAILED"
                    ? "border border-red-200 bg-red-50 p-4 text-xs text-red-800"
                    : "border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"
                }
              >
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  {selectedRun.status === "FAILED" ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {selectedRun.status === "FAILED"
                    ? "运行失败"
                    : (runIssue?.title ?? "批次部分完成")}
                </div>
                 <p>本轮已保留所有可用证据，请按提示重试或人工复核。</p>
                {canRetrySelectedRun ? (
                  <div className="mt-3 border-t border-red-200 pt-3">
                    <button
                      type="button"
                      onClick={() => void retryRun()}
                      disabled={runningAction !== null}
                      aria-busy={runningAction === `retry:${selectedRun.id}`}
                      className={`inline-flex h-9 w-full items-center justify-center gap-2 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${selectedRun.status === "FAILED" ? "bg-red-700 hover:bg-red-800" : "bg-amber-700 hover:bg-amber-800"}`}
                    >
                      {runningAction === `retry:${selectedRun.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {runningAction === `retry:${selectedRun.id}`
                        ? "正在重新排队..."
                        : "一键重试本次选品"}
                    </button>
                    <p className="mt-2 leading-5 text-red-700">
                      重试会恢复本次选品流程，不会执行商品上架。
                    </p>
                  </div>
                ) : null}
                {selectedRun.errorSummary && runErrorPresentation ? (
                  <details className="mt-2 text-slate-600">
                    <summary className="cursor-pointer">诊断与处理建议</summary>
                    <div className="mt-1 space-y-1">
                      <p>{runErrorPresentation.reason}</p>
                      <p>{runErrorPresentation.action}</p>
                      <p>诊断代码：{runErrorPresentation.diagnosticCode}</p>
                    </div>
                  </details>
                ) : (
                  <p className="mt-2 text-slate-600">
                    系统未返回错误详情，可直接重试；若再次失败，请联系管理员查看运行日志。
                  </p>
                )}
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}

      {!loading && tab === "sources" ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              本次运行来源状态
            </h2>
            <span className="text-xs text-slate-500">未知值不会按 0 处理</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">证据模式</th>
                  <th className="px-4 py-3">候选条数</th>
                  <th className="px-4 py-3">执行预算 / 搜索</th>
                  <th className="px-4 py-3">延迟</th>
                  <th className="px-4 py-3">检查时间</th>
                  <th className="px-4 py-3">失败原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceHealth.map((source) => {
                  const evidenceMode = sourceEvidenceMode(source);
                  const execution = sourceExecutionTelemetry(source);
                  const hasExecutionTelemetry = Object.values(execution).some(
                    (value) => value !== null,
                  );
                  return (
                    <tr key={source.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {researchSourceLabel(source.source)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={source.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={`inline-flex border px-2 py-0.5 font-medium ${
                            evidenceMode.tone === "cached"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : evidenceMode.tone === "live"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {evidenceMode.label}
                        </span>
                        <div className="mt-1 text-slate-500">
                          {evidenceMode.detail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {source.itemCount}
                      </td>
                      <td className="px-4 py-3 text-xs leading-5 text-slate-600">
                        {hasExecutionTelemetry ? (
                          <>
                            <div>
                              预算：
                              {execution.budgetElapsedMs === null
                                ? "未返回"
                                : `${execution.budgetElapsedMs} ms`}
                              {" / "}
                              {execution.budgetSeconds === null
                                ? "未返回"
                                : `${execution.budgetSeconds} s`}
                              {execution.budgetExhausted === null
                                ? ""
                                : execution.budgetExhausted
                                  ? " · 已耗尽"
                                  : " · 未耗尽"}
                            </div>
                            <div>
                              搜索：成功 {execution.searchSuccesses ?? "未返回"} / 尝试{" "}
                              {execution.searchAttempts ?? "未返回"}
                            </div>
                            <div>
                              概念：{execution.conceptCount ?? "未返回"} / 请求{" "}
                              {execution.requestedConceptCount ?? "未返回"} · 短缺{" "}
                              {execution.shortfall ?? "未返回"}
                            </div>
                            <div>
                              1688 线索：{execution.sourcingLeadCount ?? "未返回"} ·
                              轻小件筛除：
                              {execution.excludedByLightSmallScreen ?? "未返回"} ·
                              重复概念：
                              {execution.duplicateConceptCount ?? "未返回"}
                            </div>
                            <div>
                              历史排除：
                              {execution.excludedByHistoryCount ?? "未返回"} ·
                              1688 重复货源：
                              {execution.duplicateSourcingOfferCount ?? "未返回"}
                            </div>
                            <div>
                              1688 尝试：
                              {execution.sourcingSearchAttemptCount ?? "未返回"} ·
                              未映射：
                              {execution.sourcingUnmappedConceptCount ?? "未返回"} ·
                              无结果：
                              {execution.sourcingNoResultCount ?? "未返回"}
                            </div>
                            <div>
                              链接拒绝：
                              {execution.sourcingInvalidUrlCount ?? "未返回"} ·
                              词不匹配：
                              {execution.sourcingTermMismatchCount ?? "未返回"}
                            </div>
                          </>
                        ) : (
                          "未返回"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {source.latencyMs === null
                          ? "未返回"
                          : `${source.latencyMs} ms`}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatTime(source.finishedAt)}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-xs text-red-700">
                        {sourceFailureLabel(source.errorCode)}
                        {source.errorCode ? (
                          <details className="mt-1 text-slate-500">
                            <summary className="cursor-pointer">技术详情</summary>
                            <code className="mt-1 block break-all">
                              {source.errorCode}：{source.errorMessage ?? "未返回"}
                            </code>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sourceHealth.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">
                当前运行尚无来源检查结果。
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading && tab === "scoring" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {scoringVersions.map((version) => (
            <article
              key={version.id}
              className="border border-slate-200 bg-white p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    评分规则
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    当前有效的候选筛选门槛与评分权重
                  </p>
                </div>
                <StatusBadge status={version.status} />
              </div>
              <div className="mb-4 grid grid-cols-3 gap-px bg-slate-200">
                {["testNow", "watch", "hold"].map((key) => (
                  <div key={key} className="bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">
                      {researchThresholdLabel(key)}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {String(version.thresholds[key] ?? "未配置")}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {Object.entries(version.weights).map(([name, weight]) => (
                  <div
                    key={name}
                    className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-xs"
                  >
                    <span className="truncate text-slate-600">
                      {researchScoreComponentLabel(name)}
                    </span>
                    <div className="h-1.5 bg-slate-100">
                      <div
                        className="h-full bg-blue-600"
                        style={{
                          width: `${Math.max(0, Math.min(100, weight))}%`,
                        }}
                      />
                    </div>
                    <span className="text-right font-medium text-slate-800">
                      {weight}%
                    </span>
                  </div>
                ))}
              </div>
              <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <summary className="cursor-pointer">技术详情</summary>
                <p className="mt-1 break-all">
                  规则标识：{version.version}；启用原因：{version.reason}
                </p>
              </details>
            </article>
          ))}
          {scoringVersions.length === 0 ? (
            <p className="text-sm text-slate-500">尚无评分版本。</p>
          ) : null}
        </section>
      ) : null}

      {!loading && tab === "history" ? (
        <section className="overflow-hidden border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {runs.map((run) => (
              <button
                type="button"
                key={run.id}
                onClick={() => void selectRun(run.id)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_120px_120px_40px] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selectedRunId === run.id ? "bg-blue-50/60" : ""}`}
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {run.businessDate.slice(0, 10)} · {researchTriggerLabel(run.trigger)}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    当前评分规则 · {run._count?.candidates ?? 0} 个候选
                  </span>
                </span>
                <StatusBadge status={run.status} />
                <span className="text-xs text-slate-500">
                  {formatTime(run.createdAt)}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
          {runs.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              尚无运行记录。
            </p>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={candidateDetail !== null}
        onClose={() => {
          candidateDetailRequestIdRef.current += 1;
          setCandidateDetail(null);
          setCandidatePerformance(null);
          setSupplierImageEvidence(null);
          setSupplierEvidenceError(null);
        }}
        title="候选证据、门禁与经营回传"
        width="max-w-4xl"
      >
        {candidateDetail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex min-w-0 items-start gap-4">
                <CandidateEvidenceImage
                  imageUrl={candidateDetailImage?.imageUrl ?? null}
                  evidenceUrl={candidateDetailImage?.evidenceUrl ?? null}
                  alt={candidateDetailChineseName}
                  size="detail"
                />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-950">
                    {candidateDetailChineseName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    轻小件候选 · 材质待核实 · 定制方式待核实
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    图片来自真实市场证据；点击图片可打开原始来源。
                  </p>
                </div>
              </div>
              <StatusBadge
                status={candidateDecisionDisplayStatus(
                  candidateDetail.scores[0]?.decision,
                  candidateDetail.scores[0]?.hardGateReasons ?? [],
                )}
              />
            </div>
            <details className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-700">
                查看技术字段
              </summary>
              <p className="mt-2 break-all">
                原始规范名：{candidateDetail.canonicalName}；原始商品类型：
                {candidateDetail.productType}
              </p>
            </details>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="border border-slate-200 p-3">
                <div className="text-xs text-slate-500">总分</div>
                <div className="mt-1 text-xl font-semibold">
                  {scoreValue(candidateDetail.scores[0]?.finalScore)}
                </div>
              </div>
              <div className="border border-slate-200 p-3">
                <div className="text-xs text-slate-500">证据信号</div>
                <div className="mt-1 text-xl font-semibold">
                  {candidateDetail.signals.length}
                </div>
              </div>
              <div className="border border-slate-200 p-3">
                <div className="text-xs text-slate-500">风险记录</div>
                <div className="mt-1 text-xl font-semibold">
                  {candidateDetail.risks.length}
                </div>
              </div>
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Search className="h-4 w-4" />
                1688 图片找同款（真实接口）
              </h4>
              {supplierEvidenceError ? (
                <p className="border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {supplierEvidenceError}
                </p>
              ) : latestSupplierImageEvidence ? (
                <div className="space-y-3">
                  <div className="border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700">
                    <p>
                      接口返回 {latestSupplierImageEvidence.providerResultCount} 条；
                      严格验证后保留 {latestSupplierImageEvidence.offers.length} 条；
                      抓取时间：{formatTime(latestSupplierImageEvidence.fetchedAt)}
                    </p>
                    <p className="mt-1 font-medium text-amber-800">
                      仅为图片匹配后的展示信息，不能作为采购成本；价格、规格、起订量、重量与出口条件必须人工核验。
                    </p>
                  </div>
                  {latestSupplierImageEvidence.offers.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {latestSupplierImageEvidence.offers.map((offer) => {
                        const displayPrice =
                          offer.displayPriceEvidence.price ??
                          offer.displayPriceEvidence.consignPrice ??
                          offer.displayPriceEvidence.multipleConsignPrice;
                        const offerImageUrl = supplierOfferImageUrl(
                          offer.imageUrl,
                        );
                        const offerDetailUrl = supplierOfferDetailUrl(
                          offer.detailUrl,
                        );
                        return (
                          <div
                            key={offer.offerId}
                            className="flex gap-3 border border-slate-200 bg-white p-3"
                          >
                            <CandidateEvidenceImage
                              imageUrl={offerImageUrl}
                              evidenceUrl={offerDetailUrl}
                              alt={offer.subject ?? `1688 商品 ${offer.offerId}`}
                            />
                            <div className="min-w-0 text-xs">
                              <div className="line-clamp-2 font-medium leading-5 text-slate-900">
                                {offer.subject ?? "1688 商品标题未返回"}
                              </div>
                              <div className="mt-1 text-slate-500">
                                展示价格文本：{displayPrice ?? "未返回"}
                              </div>
                              <div className="mt-1 text-amber-700">
                                未核价 · 不进入利润计算
                              </div>
                              {offerDetailUrl ? (
                                <a
                                  href={offerDetailUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex font-medium text-blue-700 hover:underline"
                                >
                                  打开 1688 商品页
                                </a>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      本次真实检索未返回可展示的 1688 匹配商品。
                    </p>
                  )}
                </div>
              ) : (
                <p className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  本候选尚无成功的 1688 图片找同款记录。
                </p>
              )}
            </div>
            {sourcingLeads.length || sourcingQueries.length ? (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Search className="h-4 w-4" />
                  1688 公开货源线索
                </h4>
                <div className="space-y-2">
                  {sourcingLeads.map((lead) => {
                    const leadUrl = supplierOfferDetailUrl(lead.url);
                    return (
                    <div
                      key={`${lead.source}:${lead.url ?? lead.title ?? lead.query}`}
                      className="border border-amber-200 bg-amber-50 p-3 text-xs"
                    >
                      <div className="font-medium text-slate-900">
                        1688 公开商品页
                      </div>
                      <p className="mt-1 leading-5 text-slate-600">
                        仅为货源线索，采购价、起订量、重量、尺寸和出口条件尚未核验。
                      </p>
                      {leadUrl ? (
                        <a
                          href={leadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex font-medium text-blue-700 hover:underline"
                        >
                          打开 1688 原始商品页
                        </a>
                      ) : lead.url ? (
                        <p className="mt-2 text-red-700">货源链接未通过安全校验，已禁止打开。</p>
                      ) : null}
                      {lead.title || lead.scope ? (
                        <details className="mt-2 text-slate-500">
                          <summary className="cursor-pointer">技术详情</summary>
                          <p className="mt-1 break-all">
                            {lead.title ?? "未返回标题"}；
                            {lead.scope ?? "未返回证据范围"}
                          </p>
                        </details>
                      ) : null}
                    </div>
                    );
                  })}
                  {sourcingQueries.map((query) => (
                    <div
                      key={`1688-query:${query}`}
                      className="border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div className="font-medium text-slate-900">
                        中文查货词：{query}
                      </div>
                      <p className="mt-1 leading-5 text-slate-600">
                        这是人工查货入口，不代表已有匹配供应商；采购价、起订量、重量、尺寸和出口条件仍需人工确认。
                      </p>
                      <a
                        href={`https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(query)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex font-medium text-blue-700 hover:underline"
                      >
                        用该词打开 1688 搜索
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database className="h-4 w-4" />
                跨平台真实市场证据
              </h4>
              {candidateDetail.signals.length ? (
                <div className="overflow-hidden border border-slate-200">
                  <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
                    {candidateDetail.signals.map((signal) => {
                      const signalUrl = safeExternalEvidenceUrl(signal.url);
                      return (
                      <div key={signal.id} className="bg-white p-3">
                        <div className="text-xs text-slate-500">
                          {researchSignalMetricLabel(signal.metricName)}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-700">
                          来源：{marketEvidenceSourceLabel(signal.source)}
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-950">
                          {signal.metricValue ?? "未返回"}
                          {signal.unit
                            ? ` ${researchSignalUnitLabel(signal.unit)}`
                            : ""}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          抓取时间：{formatTime(signal.fetchedAt)}
                        </div>
                        {signalUrl ? (
                          <a
                            href={signalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs font-medium text-blue-700 hover:underline"
                          >
                            打开原始来源
                          </a>
                        ) : signal.url ? (
                          <p className="mt-2 text-xs text-red-700">来源链接未通过安全校验。</p>
                        ) : null}
                        <details className="mt-2 text-xs text-slate-400">
                          <summary className="cursor-pointer">技术详情</summary>
                          <p className="mt-1 break-all">
                            提供商：{signal.provider || "未返回"}；指标：
                            {signal.metricName}
                          </p>
                        </details>
                      </div>
                      );
                    })}
                  </div>
                  <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    每条证据均保留实际来源、提供商、抓取时间和原始链接；Ozon 有上限的公共搜索或索引快照不代表实时全站目录。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-red-700">
                  未返回任何可验证证据，本候选不能进入审批。
                </p>
              )}
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Scale className="h-4 w-4" />
                评分明细
              </h4>
              <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
                {Object.entries(
                  candidateDetail.scores[0]?.componentScores ?? {},
                ).map(([name, value]) => (
                  <div key={name} className="bg-white px-3 py-2 text-xs">
                    <span className="text-slate-500">
                      {researchScoreComponentLabel(name)}
                    </span>
                    <span className="float-right font-semibold text-slate-900">
                      {value === null ? "未知" : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <AlertTriangle className="h-4 w-4" />
                硬门禁
              </h4>
              {candidateDetail.scores[0]?.hardGateReasons.length ? (
                <ul className="space-y-1 text-xs text-red-700">
                  {candidateDetail.scores[0].hardGateReasons.map((reason) => (
                    <li key={reason}>
                      · {gateLabel(reason)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-700">未命中硬门禁。</p>
              )}
              {candidateDetail.scores[0]?.hardGateReasons.length ? (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">技术详情</summary>
                  <code className="mt-1 block break-all">
                    {candidateDetail.scores[0].hardGateReasons.join("；")}
                  </code>
                </details>
              ) : null}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="h-4 w-4" />
                  真实经营回传
                </h4>
                {candidatePerformance ? (
                  <StatusBadge status={candidatePerformance.coverage} />
                ) : null}
              </div>
              {candidatePerformance ? (
                <div className="border border-slate-200">
                  <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
                    <div className="bg-white p-3">
                      <div className="text-xs text-slate-500">
                        曝光 / 点击 / 订单
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {candidatePerformance.funnel.impressions} /{" "}
                        {candidatePerformance.funnel.clicks} /{" "}
                        {candidatePerformance.funnel.orders}
                      </div>
                    </div>
                    <div className="bg-white p-3">
                      <div className="text-xs text-slate-500">
                        点击率 / 下单率
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {ratioValue(
                          candidatePerformance.funnel.clickThroughRate.value,
                        )}{" "}
                        /{" "}
                        {ratioValue(
                          candidatePerformance.funnel.orderRate.value,
                        )}
                      </div>
                    </div>
                    <div className="bg-white p-3">
                      <div className="text-xs text-slate-500">
                        样本数 / 跟踪天数
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {candidatePerformance.sampleSize} /{" "}
                        {candidatePerformance.cohort.ageDays} 天
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2">
                    <div className="bg-white p-3">
                      <div className="text-xs text-slate-500">实际已知收入</div>
                      <div className="mt-1 text-sm font-semibold">
                        {currencyValues(
                          candidatePerformance.financials
                            .actualKnownRevenueByCurrency,
                        )}
                      </div>
                    </div>
                    <div className="bg-white p-3">
                      <div className="text-xs text-slate-500">实际已知利润</div>
                      <div className="mt-1 text-sm font-semibold">
                        {currencyValues(
                          candidatePerformance.financials
                            .actualKnownProfitByCurrency,
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    截至 {formatTime(candidatePerformance.asOf)}
                    。仅展示结构化回传事实，缺失成本不使用预测值补齐；退款窗口未成熟时退款率为不可用。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">经营回传尚未加载。</p>
              )}
            </div>
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-3 text-xs text-slate-500">
                批准只创建内部开发任务。发布、改价、库存、广告均保持单独人工确认。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={
                    !candidateDetail.capabilities.allowedActions.includes(
                      "reject_candidate",
                    )
                  }
                  onClick={() => {
                    setDecision({
                      candidate: candidateDetail,
                      action: "reject",
                    });
                    setCandidateDetail(null);
                  }}
                  className="h-9 border border-red-200 px-4 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  驳回
                </button>
                <button
                  type="button"
                  disabled={
                    !candidateDetail.capabilities.allowedActions.includes(
                      "create_internal_development_task",
                    )
                  }
                  onClick={() => {
                    setDecision({
                      candidate: candidateDetail,
                      action: "approve",
                    });
                    setCandidateDetail(null);
                  }}
                  className="h-9 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  批准内部开发
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={
          decision?.action === "approve" ? "确认创建内部开发任务" : "驳回候选"
        }
        width="max-w-lg"
      >
        <div>
          <p className="mb-3 text-sm text-slate-600">
            {decision ? candidateChineseName(decision.candidate) : ""}
          </p>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            原因（至少 3 个字符）
          </label>
          <textarea
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            rows={4}
            className="w-full resize-none border border-slate-300 p-3 text-sm outline-none focus:border-blue-500"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDecision(null)}
              className="h-9 border border-slate-300 px-4 text-sm text-slate-700"
            >
              取消
            </button>
            <button
              type="button"
              disabled={
                decisionReason.trim().length < 3 || runningAction === "decision"
              }
              onClick={() => void submitDecision()}
              className={`h-9 px-4 text-sm font-medium text-white disabled:bg-slate-300 ${decision?.action === "approve" ? "bg-blue-600" : "bg-red-600"}`}
            >
              {runningAction === "decision" ? "提交中..." : "确认"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={artifactPreview !== null}
        onClose={() => setArtifactPreview(null)}
        title={`报告：${artifactPreview?.title ?? ""}`}
        width="max-w-5xl"
      >
        <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-800">
          {artifactPreview?.content}
        </pre>
      </Modal>
    </div>
  );
}
