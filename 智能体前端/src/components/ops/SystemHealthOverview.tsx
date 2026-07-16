import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import {
  listAgentRuns,
  type AgentRun,
} from "../../api/agentRuns";
import {
  systemHealthApi,
  type DependencyCheck,
  type SystemReadinessSnapshot,
} from "../../api/systemHealth";

const dependencyLabels: Record<keyof SystemReadinessSnapshot["checks"], string> = {
  database: "数据库",
  redis: "Redis",
  queue: "任务队列",
  storage: "文件存储",
  agent: "Python Agent",
};

function statusPresentation(status?: DependencyCheck["status"]) {
  if (status === "up") {
    return { label: "正常", icon: CheckCircle2, tone: "text-emerald-700" };
  }
  if (status === "degraded") {
    return { label: "性能下降", icon: AlertTriangle, tone: "text-amber-700" };
  }
  if (status === "down") {
    return { label: "不可用", icon: XCircle, tone: "text-red-700" };
  }
  return { label: "未返回", icon: AlertTriangle, tone: "text-slate-500" };
}

function formatTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export default function SystemHealthOverview() {
  const [readiness, setReadiness] = useState<SystemReadinessSnapshot | null>(null);
  const [runs, setRuns] = useState<AgentRun<Record<string, unknown>>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [healthResult, runsResult] = await Promise.allSettled([
      systemHealthApi.getReadiness(),
      listAgentRuns(1, 20),
    ]);
    if (healthResult.status === "fulfilled") {
      setReadiness(healthResult.value);
    } else {
      setReadiness(null);
      setError(healthResult.reason instanceof Error ? healthResult.reason.message : "无法读取系统就绪状态");
    }
    if (runsResult.status === "fulfilled") {
      setRuns(runsResult.value.items);
    } else {
      setRuns([]);
      setError((current) => current || (runsResult.reason instanceof Error ? runsResult.reason.message : "无法读取最近任务"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const failedRuns = useMemo(
    () => runs.filter((run) => ["FAILED", "TIMEOUT", "DEAD_LETTERED"].includes(run.status)).slice(0, 5),
    [runs],
  );
  const queue = readiness?.checks.queue;

  return (
    <section className="border border-[#E5E7EB] bg-white" aria-labelledby="system-health-title">
      <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="system-health-title" className="text-sm font-bold text-[#101828]">当前运行健康</h2>
          <p className="mt-1 text-xs text-[#667085]">实时读取后端就绪检查与最近 20 条 Agent 任务，每 30 秒刷新。</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={readiness?.status === "ready" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>
            {loading ? "检查中" : readiness?.status === "ready" ? "可接收流量" : "禁止接收新流量"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="刷新当前运行状态"
            className="inline-flex size-9 items-center justify-center border border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error ? <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid border-b border-[#E5E7EB] md:grid-cols-5">
        {(Object.keys(dependencyLabels) as Array<keyof typeof dependencyLabels>).map((name) => {
          const check = readiness?.checks[name];
          const status = statusPresentation(check?.status);
          const Icon = status.icon;
          return (
            <div key={name} className="min-w-0 border-b border-[#E5E7EB] px-4 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <div className="text-xs font-semibold text-[#667085]">{dependencyLabels[name]}</div>
              <div className={`mt-2 flex items-center gap-2 text-sm font-bold ${status.tone}`}>
                <Icon size={16} />
                {status.label}
              </div>
              <div className="mt-1 truncate text-xs text-[#667085]" title={check?.error ?? ""}>
                {check?.error ?? (check?.latencyMs === undefined ? "尚无数据" : `${check.latencyMs} ms`)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="border-b border-[#E5E7EB] px-5 py-4 lg:border-b-0 lg:border-r">
          <h3 className="text-xs font-bold text-[#344054]">队列堆积</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {[
              ["等待", queue?.details?.waiting],
              ["执行中", queue?.details?.active],
              ["延迟", queue?.details?.delayed],
              ["失败", queue?.details?.failed],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-[#667085]">{label}</dt>
                <dd className="mt-1 font-bold text-[#101828]">{typeof value === "number" ? value : "--"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-[#344054]">最近失败任务</h3>
            <span className="text-xs text-[#667085]">更新于 {formatTime(readiness?.timestamp)}</span>
          </div>
          {failedRuns.length === 0 ? (
            <p className="mt-3 text-sm text-[#667085]">最近 20 条任务没有失败记录。</p>
          ) : (
            <div className="mt-3 divide-y divide-[#EAECF0]">
              {failedRuns.map((run) => (
                <div key={run.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[130px_minmax(0,1fr)_150px]">
                  <span className="font-semibold text-red-700">{run.status}</span>
                  <span className="min-w-0 truncate text-[#344054]" title={run.errorMessage ?? run.errorCode ?? ""}>
                    {run.errorMessage ?? run.errorCode ?? "未提供失败原因"}
                  </span>
                  <span className="text-[#667085] sm:text-right">{formatTime(run.finishedAt ?? run.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
