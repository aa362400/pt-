import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GitBranch,
  MessageSquareWarning,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import type { AgentType } from "../api/agentRuns";
import {
  agentEvaluationApi,
  type AgentEvalSnapshot,
  type FeedbackSignal,
  type PromptVersion,
  type PromptVersionStatus,
  type RatioMetric,
  type RouterDecision,
} from "../api/agentEvaluation";
import Modal from "../components/ui/Modal";

const agentTypes: Array<{ value: AgentType; label: string }> = [
  { value: "PRODUCT_RESEARCHER", label: "选品 Agent" },
  { value: "LISTING_OPTIMIZER", label: "刊登 Agent" },
  { value: "IMAGE_CREATIVE", label: "图片 Agent" },
  { value: "CUSTOMER_INSIGHT", label: "客户洞察 Agent" },
  { value: "PROFIT_ANALYST", label: "利润 Agent" },
  { value: "KEYWORD_EXPLORER", label: "关键词 Agent" },
  { value: "CONTENT_WRITER", label: "内容 Agent" },
  { value: "PLANNER", label: "规划 Agent" },
  { value: "GENERAL_ASSISTANT", label: "通用 Agent" },
];

const signalLabels: Record<string, string> = {
  APPROVAL_APPROVED: "审批通过",
  APPROVAL_REJECTED: "审批驳回",
  APPROVAL_CHANGES_REQUESTED: "要求重做",
  SANDBOX_EVALUATED: "沙箱已检查",
  SANDBOX_BLOCKED: "沙箱已阻断",
  USER_CORRECTION: "人工纠错",
  TOOL_FAILURE: "工具调用失败",
};

const promptStatusLabels: Record<PromptVersionStatus, string> = {
  DRAFT: "草稿",
  CHALLENGER: "灰度中",
  CHAMPION: "当前主版本",
  RETIRED: "已退役",
};

function percent(metric?: RatioMetric | null) {
  return metric?.value == null ? "无样本" : `${(metric.value * 100).toFixed(1)}%`;
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未记录";
}

function evidenceMeta(status?: string) {
  if (status === "COMPLETE") {
    return { label: "证据完整", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  }
  if (status === "PARTIAL") {
    return { label: "证据不足", tone: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle };
  }
  return { label: "无样本", tone: "border-slate-200 bg-slate-100 text-slate-600", icon: Clock3 };
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500" title={detail}>{detail}</p>
    </div>
  );
}

type PromptAction = { id: string; status: PromptVersionStatus; version: string };

export default function AgentQualityCenter() {
  const [agentType, setAgentType] = useState<AgentType>("PRODUCT_RESEARCHER");
  const [windowDays, setWindowDays] = useState(7);
  const [scorecards, setScorecards] = useState<AgentEvalSnapshot[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSignal[]>([]);
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [routerDecisions, setRouterDecisions] = useState<RouterDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correction, setCorrection] = useState({ runId: "", listingId: "", field: "", reason: "", before: "", after: "" });
  const [promptAction, setPromptAction] = useState<PromptAction | null>(null);
  const [promptReason, setPromptReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cards, signals, prompts, routes] = await Promise.all([
        agentEvaluationApi.listScorecards(agentType),
        agentEvaluationApi.listFeedback(agentType),
        agentEvaluationApi.listPromptVersions(agentType),
        agentEvaluationApi.listRouterDecisions(agentType),
      ]);
      setScorecards(cards);
      setFeedback(signals);
      setPromptVersions(prompts);
      setRouterDecisions(routes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent 质量数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [agentType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const latest = useMemo(() => scorecards[0] ?? null, [scorecards]);
  const scores = latest?.scores;
  const evidence = evidenceMeta(scores?.status);
  const EvidenceIcon = evidence.icon;

  async function aggregate() {
    setBusy(true);
    setError("");
    try {
      const to = new Date();
      const from = new Date(to.getTime() - windowDays * 86_400_000);
      await agentEvaluationApi.aggregate(agentType, from.toISOString(), to.toISOString());
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评估聚合失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection() {
    if (!correction.runId.trim() || !correction.field.trim() || correction.reason.trim().length < 10) {
      setError("人工纠错必须填写真实 Run ID、修改字段和不少于 10 个字的原因。");
      return;
    }
    setBusy(true);
    try {
      await agentEvaluationApi.createCorrection({
        runId: correction.runId.trim(),
        listingId: correction.listingId.trim() || undefined,
        agentType,
        field: correction.field.trim(),
        reason: correction.reason.trim(),
        before: correction.before.trim() || undefined,
        after: correction.after.trim() || undefined,
      });
      setCorrectionOpen(false);
      setCorrection({ runId: "", listingId: "", field: "", reason: "", before: "", after: "" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "人工纠错保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitPromptAction() {
    if (!promptAction || promptReason.trim().length < 10) {
      setError("Prompt 状态变更必须填写不少于 10 个字的人工复核原因。");
      return;
    }
    setBusy(true);
    try {
      await agentEvaluationApi.updatePromptStatus(
        promptAction.id,
        promptAction.status,
        promptReason.trim(),
        promptAction.status === "CHALLENGER" ? 0.05 : undefined,
      );
      setPromptAction(null);
      setPromptReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prompt 状态变更失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-5 px-5 py-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-600"><Activity size={18} /><span className="text-sm font-medium">Agent 数据闭环</span></div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Agent 质量中心</h1>
          <p className="mt-1 text-sm text-slate-600">只展示可归因的真实任务、审批、沙箱和路由证据；无证据不计分。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={agentType} onChange={(event) => setAgentType(event.target.value as AgentType)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
            {agentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value={7}>近 7 天</option><option value={30}>近 30 天</option><option value={90}>近 90 天</option>
          </select>
          <button type="button" onClick={() => void aggregate()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />生成真实评估
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="证据状态" value={evidence.label} detail={latest ? `${latest.version} · ${dateTime(latest.windowEnd)}` : "尚未生成评分快照"} />
        <MetricTile label="归因覆盖率" value={latest ? `${(latest.coverage * 100).toFixed(1)}%` : "无样本"} detail="正式目标 ≥ 95%" />
        <MetricTile label="样本量" value={latest ? String(latest.sampleSize) : "0"} detail="所选时间窗内真实 Agent run" />
        <MetricTile label="审批接受率" value={percent(scores?.quality.proposalAcceptRate)} detail="通过 / 有人工结论的审批" />
        <MetricTile label="任务完成率" value={percent(scores?.stability.completionRate)} detail="成功终态 / 全部终态" />
      </section>

      <div className={`flex items-start gap-3 rounded-md border px-4 py-3 ${evidence.tone}`}>
        <EvidenceIcon size={18} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">{evidence.label}</p>
          <p className="mt-1 opacity-90">{scores?.status === "COMPLETE" ? "反馈和路由归因覆盖已达到 95%，可用于版本比较。" : scores?.status === "PARTIAL" ? "当前分数仅供观察，不能据此自动切换模型或 Prompt。" : "没有可计算的真实样本，系统不会用 0 分冒充质量结果。"}</p>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">质量与稳定性</h2><p className="mt-1 text-xs text-slate-500">比例分母为零时显示无样本</p></div><ShieldCheck size={19} className="text-blue-600" /></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-sm">
            <div><dt className="text-slate-500">沙箱阻断率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.sandboxBlockRate)}</dd></div>
            <div><dt className="text-slate-500">人工修改率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.manualEditRate)}</dd></div>
            <div><dt className="text-slate-500">首次成功率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.firstPassPublishSuccessRate)}</dd></div>
            <div><dt className="text-slate-500">失败率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.failureRate)}</dd></div>
            <div><dt className="text-slate-500">重试率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.retryRate)}</dd></div>
            <div><dt className="text-slate-500">工具失败率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.toolFailureRate)}</dd></div>
            <div><dt className="text-slate-500">完成耗时 P50</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.efficiency.runCompletionSecondsP50 == null ? "无样本" : `${scores.efficiency.runCompletionSecondsP50.toFixed(1)} 秒`}</dd></div>
            <div><dt className="text-slate-500">完成耗时 P95</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.efficiency.runCompletionSecondsP95 == null ? "无样本" : `${scores.efficiency.runCompletionSecondsP95.toFixed(1)} 秒`}</dd></div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">归因证据</h2><p className="mt-1 text-xs text-slate-500">反馈和路由必须都能关联到真实 run</p></div><GitBranch size={19} className="text-blue-600" /></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-sm">
            <div><dt className="text-slate-500">反馈覆盖率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.attribution.feedbackCoverage)}</dd></div>
            <div><dt className="text-slate-500">路由覆盖率</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.attribution.routeCoverage)}</dd></div>
            <div><dt className="text-slate-500">已归因任务</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.attribution.attributedRunCount ?? 0}</dd></div>
            <div><dt className="text-slate-500">路由决策记录</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.attribution.routeDecisionCount ?? 0}</dd></div>
          </dl>
          <div className="border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setCorrectionOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><MessageSquareWarning size={16} />登记人工纠错</button></div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Prompt 版本与灰度</h2><p className="mt-1 text-xs text-slate-500">禁止自动直推生产；草稿必须先经过最多 5% challenger 灰度。</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">版本</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">流量</th><th className="px-5 py-3">内容指纹</th><th className="px-5 py-3">启用时间</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{promptVersions.length ? promptVersions.map((item) => <tr key={item.id}><td className="px-5 py-3 font-medium text-slate-950">{item.version}</td><td className="px-5 py-3">{promptStatusLabels[item.status]}</td><td className="px-5 py-3">{(item.routingWeight * 100).toFixed(0)}%</td><td className="px-5 py-3 font-mono text-xs text-slate-500">{item.contentHash.slice(0, 12)}</td><td className="px-5 py-3 text-slate-600">{dateTime(item.activatedAt)}</td><td className="px-5 py-3 text-right">{item.status === "DRAFT" ? <button type="button" onClick={() => setPromptAction({ id: item.id, status: "CHALLENGER", version: item.version })} className="text-blue-600 hover:text-blue-800">开始 5% 灰度</button> : item.status === "CHALLENGER" ? <button type="button" onClick={() => setPromptAction({ id: item.id, status: "CHAMPION", version: item.version })} className="text-blue-600 hover:text-blue-800">人工设为主版本</button> : <span className="text-slate-400">无可用操作</span>}</td></tr>) : <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">暂无 Prompt 版本，不会自动生成占位记录。</td></tr>}</tbody></table></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">最近反馈</h2><MessageSquareWarning size={18} className="text-blue-600" /></div><div className="divide-y divide-slate-100">{feedback.length ? feedback.slice(0, 10).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{signalLabels[item.signalType] ?? item.signalType}</p><time className="text-xs text-slate-500">{dateTime(item.createdAt)}</time></div><p className="mt-1 truncate text-xs text-slate-500" title={item.runId ?? item.approvalId ?? item.listingId ?? ""}>来源：{item.source} · 关联：{item.runId ?? item.approvalId ?? item.listingId ?? "未返回"}</p></div>) : <p className="px-5 py-8 text-center text-sm text-slate-500">暂无可归因反馈。</p>}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">最近路由决策</h2><Route size={18} className="text-blue-600" /></div><div className="divide-y divide-slate-100">{routerDecisions.length ? routerDecisions.slice(0, 10).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{item.selectedModel}</p><time className="text-xs text-slate-500">{dateTime(item.createdAt)}</time></div><p className="mt-1 truncate text-xs text-slate-500" title={item.runId}>Run：{item.runId} · 耗时：{item.latencyMs == null ? "未返回" : `${item.latencyMs} ms`} · 质量：{item.qualityScore == null ? "未返回" : `${item.qualityScore} 分`}</p></div>) : <p className="px-5 py-8 text-center text-sm text-slate-500">暂无模型路由证据。</p>}</div></div>
      </section>

      {loading ? <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm text-white shadow-lg"><RefreshCw size={16} className="animate-spin" />正在读取真实质量证据</div> : null}

      <Modal open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="登记人工纠错" width="max-w-2xl"><div className="space-y-4"><p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">只有能够关联到真实 Run 的纠错才进入正式评估，填写不存在或其他组织的 ID 会被后端拒绝。</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-700">Run ID *<input value={correction.runId} onChange={(event) => setCorrection((current) => ({ ...current, runId: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">Listing ID（可选）<input value={correction.listingId} onChange={(event) => setCorrection((current) => ({ ...current, listingId: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700 sm:col-span-2">修改字段 *<input value={correction.field} onChange={(event) => setCorrection((current) => ({ ...current, field: event.target.value }))} placeholder="例如：商品标题" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">修改前<input value={correction.before} onChange={(event) => setCorrection((current) => ({ ...current, before: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">修改后<input value={correction.after} onChange={(event) => setCorrection((current) => ({ ...current, after: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><label className="block text-sm text-slate-700">纠错原因 *<textarea value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="说明智能体错在哪里，以及人工为什么这样修改。" className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setCorrectionOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">取消</button><button type="button" disabled={busy} onClick={() => void submitCorrection()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存纠错证据</button></div></div></Modal>

      <Modal open={Boolean(promptAction)} onClose={() => setPromptAction(null)} title="确认 Prompt 状态变更"><div className="space-y-4"><p className="text-sm text-slate-700">版本 <strong>{promptAction?.version}</strong> 将变更为“{promptAction ? promptStatusLabels[promptAction.status] : ""}”。灰度版本最多获得 5% 流量，切换主版本必须由人工确认。</p><label className="block text-sm text-slate-700">复核原因 *<textarea value={promptReason} onChange={(event) => setPromptReason(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setPromptAction(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">取消</button><button type="button" disabled={busy} onClick={() => void submitPromptAction()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">确认变更</button></div></div></Modal>
    </div>
  );
}
