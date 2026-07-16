import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronRight,
  Clock3,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  AGENT_LIFECYCLE_STATUS_LABELS,
  cancelAgentRun,
  getAgentRunTimeline,
  listAgentRuns,
  retryAgentRun,
  type AgentLifecycleStatus,
  type AgentRun,
  type AgentRunTimeline,
} from "../../api/agentRuns";
import { useToast } from "../ui/use-toast";

const TERMINAL = new Set<AgentLifecycleStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const EVENT_LABELS: Record<string, string> = {
  RUN_CREATED: "任务已创建",
  MIGRATED_LEGACY_STATE: "历史任务状态已迁移",
  PLAN_STARTED: "开始规划",
  TOOL_CALL_REQUESTED: "已请求业务工具",
  TOOL_RESULT_RECEIVED: "工具结果已返回",
  ACTION_PROPOSED: "已提交人工审批",
  APPROVAL_GRANTED: "人工已批准",
  APPROVAL_REJECTED: "人工已驳回",
  EXECUTION_FINISHED: "执行步骤已完成",
  VERIFICATION_PASSED: "结果核验通过",
  VERIFICATION_FAILED: "结果核验失败",
  RETRYABLE_ERROR: "发生可重试错误",
  RETRY_DISPATCHED: "已开始重试",
  TOOL_TIMEOUT: "工具调用超时",
  NON_RETRYABLE_ERROR: "发生不可重试错误",
  FATAL_ERROR: "发生致命错误",
  CANCELLED_BY_USER: "用户已取消任务",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  PRODUCT_RESEARCHER: "智能选品",
  LISTING_OPTIMIZER: "商品刊登优化",
  ADVERTISING_STRATEGIST: "广告策略",
  PROFIT_ANALYST: "利润分析",
  CUSTOMER_INSIGHT: "客户洞察",
  CONTENT_WRITER: "商品内容生成",
  KEYWORD_EXPLORER: "关键词分析",
  GENERAL_ASSISTANT: "运营助理",
  IMAGE_CREATIVE: "商品图片生成",
  PLANNER: "自动化流程规划",
};

function formatTime(value?: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: AgentLifecycleStatus) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") {
    return "bg-red-50 text-red-700";
  }
  if (status === "WAITING_APPROVAL") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

export function AgentRunTimelinePanel() {
  const { addToast } = useToast();
  const [runs, setRuns] = useState<AgentRun<Record<string, unknown>>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<AgentRunTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const page = await listAgentRuns(1, 8);
      setRuns(page.items);
      setSelectedId((current) =>
        current && page.items.some((item) => item.id === current)
          ? current
          : (page.items[0]?.id ?? null),
      );
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "任务状态读取失败",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadTimeline = useCallback(async (runId: string) => {
    const result = await getAgentRunTimeline(runId);
    setTimeline(result);
  }, []);

  useEffect(() => {
    void loadRuns();
    const timer = window.setInterval(() => void loadRuns(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedId) {
      setTimeline(null);
      return;
    }
    void loadTimeline(selectedId).catch((error) =>
      addToast(
        error instanceof Error ? error.message : "任务时间线读取失败",
        "error",
      ),
    );
  }, [addToast, loadTimeline, selectedId, runs]);

  const selected = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? null,
    [runs, selectedId],
  );

  const handleCancel = async () => {
    if (!selected || TERMINAL.has(selected.lifecycleStatus)) return;
    if (!window.confirm("确定取消这个正在执行的任务吗？")) return;
    setCancelling(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `cancel-${selected.id}-${Date.now()}`;
      await cancelAgentRun(selected.id, requestId);
      await loadRuns();
      await loadTimeline(selected.id);
      addToast("任务已取消", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "取消任务失败",
        "error",
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (
      !selected ||
      !["FAILED", "CANCELLED"].includes(selected.lifecycleStatus)
    ) {
      return;
    }
    setRetrying(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `retry-${selected.id}-${Date.now()}`;
      const retryRun = await retryAgentRun(selected.id, requestId);
      await loadRuns();
      setSelectedId(retryRun.id);
      await loadTimeline(retryRun.id);
      addToast("已创建新的重试任务，原任务记录保持不变", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "重试任务创建失败",
        "error",
      );
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="mb-8 overflow-hidden border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            任务执行时间线
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            展示真实后端状态、重试、审批和最终结果
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRuns()}
          className="inline-flex h-9 w-9 items-center justify-center border border-gray-200 text-gray-600 hover:bg-gray-50"
          title="刷新任务"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          正在读取任务...
        </div>
      ) : runs.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          暂无真实任务记录
        </div>
      ) : (
        <div className="grid min-h-[340px] lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedId(run.id)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-5 py-4 text-left hover:bg-gray-50 ${
                  run.id === selectedId ? "bg-blue-50/60" : "bg-white"
                }`}
              >
                <Clock3 className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {AGENT_TYPE_LABELS[run.agentType] ?? "业务智能体"}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {formatTime(run.createdAt)}
                  </span>
                </span>
                <span
                  className={`shrink-0 px-2 py-1 text-xs ${statusTone(run.lifecycleStatus)}`}
                >
                  {AGENT_LIFECYCLE_STATUS_LABELS[run.lifecycleStatus]}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>

          <div className="min-w-0 px-5 py-4">
            {selected && timeline ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {AGENT_TYPE_LABELS[selected.agentType] ?? "业务智能体"}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs ${statusTone(selected.lifecycleStatus)}`}
                      >
                        {
                          AGENT_LIFECYCLE_STATUS_LABELS[
                            selected.lifecycleStatus
                          ]
                        }
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      任务编号 {selected.id} · 版本 {selected.version}
                    </p>
                  </div>
                  {!TERMINAL.has(selected.lifecycleStatus) && (
                    <button
                      type="button"
                      onClick={() => void handleCancel()}
                      disabled={cancelling}
                      className="inline-flex items-center gap-2 border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" />
                      {cancelling ? "正在取消" : "取消任务"}
                    </button>
                  )}
                  {["FAILED", "CANCELLED"].includes(
                    selected.lifecycleStatus,
                  ) && (
                    <button
                      type="button"
                      onClick={() => void handleRetry()}
                      disabled={retrying}
                      className="inline-flex items-center gap-2 border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {retrying ? "正在创建重试" : "重新执行"}
                    </button>
                  )}
                </div>

                <ol className="space-y-0">
                  {timeline.transitions.map((item, index) => (
                    <li key={item.id} className="relative flex gap-3 pb-5">
                      {index < timeline.transitions.length - 1 && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-gray-200" />
                      )}
                      <span className="relative mt-1.5 h-4 w-4 shrink-0 border-4 border-white bg-blue-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {EVENT_LABELS[item.eventType] ?? "状态已更新"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {item.fromStatus
                            ? AGENT_LIFECYCLE_STATUS_LABELS[item.fromStatus]
                            : "初始状态"}
                          {" → "}
                          {AGENT_LIFECYCLE_STATUS_LABELS[item.toStatus]}
                          {" · "}第 {item.attempt} 次尝试
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>

                {selected.errorMessage && (
                  <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {selected.errorMessage}
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-sm text-gray-500">
                正在读取时间线...
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
