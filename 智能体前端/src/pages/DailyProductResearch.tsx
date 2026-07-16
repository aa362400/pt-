import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  dailyProductResearchApi,
  type DailyCandidate,
  type DailyCandidateDetail,
  type DailyResearchRun,
  type DailyResearchSchedule,
  type ProductPerformance,
  type ResearchArtifact,
  type ScoringVersion,
  type SourceHealth,
} from "../api/dailyProductResearch";
import Modal from "../components/ui/Modal";
import { useToast } from "../components/ui/use-toast";

type ViewTab = "today" | "sources" | "scoring" | "history";
type DecisionAction = "approve" | "reject";

const terminalStatuses = new Set([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

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
  REJECT: "淘汰",
  STRONG: "强证据",
  MEDIUM: "中等证据",
  WEAK: "弱证据",
  INVALID: "证据不足",
};

const signalLabels: Record<string, string> = {
  price: "公开售价",
  rating: "商品评分",
  review_count: "评论数量",
};

const gateLabels: Record<string, string> = {
  DEMAND_WEAK: "需求证据只有一个来源，暂不足以证明市场需求",
  DEMAND_INVALID: "缺少可验证的需求数据",
  "MISSING_REQUIRED_COST:PRODUCT": "缺少真实采购成本",
  "MISSING_REQUIRED_COST:SHIPPING": "缺少真实物流成本",
};

function gateLabel(reason: string): string {
  return gateLabels[reason] ?? reason;
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
  if (["RUNNING", "PENDING", "SYNCING", "WATCH"].includes(status)) {
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
      {statusText[status] ?? status}
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
  const [decision, setDecision] = useState<{
    candidate: DailyCandidate;
    action: DecisionAction;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [artifactPreview, setArtifactPreview] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const loadRunData = useCallback(async (runId: string) => {
    const [runResult, candidateResult, sourceResult, artifactResult] =
      await Promise.allSettled([
        dailyProductResearchApi.getRun(runId),
        dailyProductResearchApi.listCandidates(runId, { page: 1, limit: 100 }),
        dailyProductResearchApi.sourceHealth(runId),
        dailyProductResearchApi.artifacts(runId),
      ]);
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
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const [runResult, scheduleResult, scoringResult] =
        await Promise.allSettled([
          dailyProductResearchApi.listRuns({ page: 1, limit: 50 }),
          dailyProductResearchApi.getSchedule(),
          dailyProductResearchApi.listScoringVersions(),
        ]);
      if (runResult.status === "fulfilled") {
        setRuns(runResult.value.items);
        const nextRunId = selectedRunId ?? runResult.value.items[0]?.id ?? null;
        if (nextRunId) {
          setSelectedRunId(nextRunId);
          await loadRunData(nextRunId);
        } else {
          setSelectedRun(null);
          setCandidates([]);
          setSourceHealth([]);
          setArtifacts([]);
        }
      } else if (!quiet) {
        addToast(
          runResult.reason instanceof Error
            ? runResult.reason.message
            : "每日选品运行记录读取失败",
          "error",
        );
      }
      if (scheduleResult.status === "fulfilled") {
        setRuntime(scheduleResult.value.runtime);
        setSchedule({
          enabled: scheduleResult.value.enabled,
          nextRunAt: scheduleResult.value.nextRunAt,
          localTime: scheduleResult.value.triggerConfig.dailyAt ?? "08:00",
          timezone:
            scheduleResult.value.triggerConfig.timezone ?? "Asia/Shanghai",
        });
      }
      if (scoringResult.status === "fulfilled")
        setScoringVersions(scoringResult.value.items);
      if (!quiet) setLoading(false);
    },
    [addToast, loadRunData, selectedRunId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedRun || terminalStatuses.has(selectedRun.status)) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load, selectedRun]);

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
    return candidates.filter((candidate) => {
      const score = candidate.scores[0];
      if (decisionFilter && score?.decision !== decisionFilter) return false;
      if (!normalizedSearch) return true;
      return [
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

  const startRun = async () => {
    setRunningAction("start");
    try {
      const result = await dailyProductResearchApi.startManual({
        timezone: schedule.timezone,
        candidateLimit: 300,
        topLimit: 10,
      });
      setSelectedRunId(result.run.id);
      addToast(
        result.reused
          ? "今日相同配置已运行，已打开原运行记录"
          : "每日精准选品已进入真实任务队列",
        "success",
      );
      const [runList] = await Promise.all([
        dailyProductResearchApi.listRuns({ page: 1, limit: 50 }),
        loadRunData(result.run.id),
      ]);
      setRuns(runList.items);
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

  const openCandidate = async (candidate: DailyCandidate) => {
    setRunningAction(`candidate:${candidate.id}`);
    try {
      const [detail, performance] = await Promise.all([
        dailyProductResearchApi.getCandidate(candidate.id),
        dailyProductResearchApi.candidatePerformance(candidate.id),
      ]);
      setCandidateDetail({
        ...detail.candidate,
        capabilities: detail.capabilities,
        _count: detail.candidate._count ?? {
          signals: detail.candidate.signals?.length ?? 0,
        },
      });
      setCandidatePerformance(performance);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "候选详情读取失败",
        "error",
      );
    } finally {
      setRunningAction(null);
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
        title: artifact.artifactType,
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

  const selectRun = async (runId: string) => {
    setSelectedRunId(runId);
    setLoading(true);
    await loadRunData(runId);
    setLoading(false);
  };

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
            每天汇总真实来源，经过需求、利润、风险和评分门禁后生成候选。
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => void startRun()}
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
            立即调研
          </button>
        </div>
      </header>

      <section className="mb-5 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "运行状态",
            selectedRun
              ? (statusText[selectedRun.status] ?? selectedRun.status)
              : "尚无运行",
            Clock3,
          ],
          ["建议打样", String(summary.TEST_NOW), CheckCircle2],
          ["观察", String(summary.WATCH), Search],
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
            ? `${selectedRun.businessDate.slice(0, 10)} · ${selectedRun.scheduleTimezone}`
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
                    <th className="px-4 py-3">候选商品</th>
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
                    return (
                      <tr key={candidate.id} className="hover:bg-slate-50/70">
                        <td className="max-w-xs px-4 py-3">
                          <div className="truncate font-medium text-slate-900">
                            {candidate.canonicalName}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {[
                              candidate.productType,
                              candidate.material,
                              candidate.customizationMethod,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "属性未完整返回"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {statusText[candidate.signalStrength] ??
                              candidate.signalStrength}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {candidate._count?.signals ??
                              candidate.signals?.length ??
                              0} 条信号 · 置信度{" "}
                            {candidate.confidenceScore}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {scoreValue(score?.finalScore)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={score?.decision ?? "UNSCORED"} />
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
                当前 {runtime.mode}：
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
                <input
                  value={schedule.timezone}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  className="h-9 min-w-0 border border-slate-300 px-2 text-sm"
                />
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
                      {artifact.artifactType}
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

            {selectedRun?.errorSummary ? (
              <section className="border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <XCircle className="h-4 w-4" />
                  运行失败
                </div>
                <p>
                  {selectedRun.errorSummary.code ?? "UNKNOWN"}：
                  {selectedRun.errorSummary.message ?? "未返回错误详情"}
                </p>
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">候选条数</th>
                  <th className="px-4 py-3">延迟</th>
                  <th className="px-4 py-3">检查时间</th>
                  <th className="px-4 py-3">失败原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceHealth.map((source) => (
                  <tr key={source.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {source.source}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={source.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {source.itemCount}
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
                      {source.errorCode
                        ? `${source.errorCode}：${source.errorMessage ?? ""}`
                        : "无"}
                    </td>
                  </tr>
                ))}
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
                    {version.version}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {version.reason}
                  </p>
                </div>
                <StatusBadge status={version.status} />
              </div>
              <div className="mb-4 grid grid-cols-3 gap-px bg-slate-200">
                {["testNow", "watch", "hold"].map((key) => (
                  <div key={key} className="bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">{key}</div>
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
                    <span className="truncate text-slate-600">{name}</span>
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
                    {run.businessDate.slice(0, 10)} · {run.trigger}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {run.scoringVersion?.version ?? "评分版本未返回"} ·{" "}
                    {run._count?.candidates ?? 0} 个候选
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
          setCandidateDetail(null);
          setCandidatePerformance(null);
        }}
        title="候选证据、门禁与经营回传"
        width="max-w-4xl"
      >
        {candidateDetail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {candidateDetail.canonicalName}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {candidateDetail.productType} ·{" "}
                  {candidateDetail.material ?? "材质未知"} ·{" "}
                  {candidateDetail.customizationMethod ?? "定制方式未知"}
                </p>
              </div>
              <StatusBadge
                status={candidateDetail.scores[0]?.decision ?? "UNSCORED"}
              />
            </div>
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
                <Database className="h-4 w-4" />
                Ozon 真实证据
              </h4>
              {candidateDetail.signals.length ? (
                <div className="overflow-hidden border border-slate-200">
                  <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
                    {candidateDetail.signals.map((signal) => (
                      <div key={signal.id} className="bg-white p-3">
                        <div className="text-xs text-slate-500">
                          {signalLabels[signal.metricName] ?? signal.metricName}
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-950">
                          {signal.metricValue ?? "未返回"}
                          {signal.unit ? ` ${signal.unit}` : ""}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          抓取时间：{formatTime(signal.fetchedAt)}
                        </div>
                        {signal.url ? (
                          <a
                            href={signal.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs font-medium text-blue-700 hover:underline"
                          >
                            打开 Ozon 来源
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    当前为单一 Ozon 官方索引快照，只能作为弱需求证据；不是实时全站数据。
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
                    <span className="text-slate-500">{name}</span>
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
                      <span className="ml-1 text-slate-500">({reason})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-700">未命中硬门禁。</p>
              )}
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
                        样本 / cohort 年龄
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
                  onClick={() => {
                    setDecision({
                      candidate: candidateDetail,
                      action: "reject",
                    });
                    setCandidateDetail(null);
                  }}
                  className="h-9 border border-red-200 px-4 text-sm text-red-700 hover:bg-red-50"
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
            {decision?.candidate.canonicalName}
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
