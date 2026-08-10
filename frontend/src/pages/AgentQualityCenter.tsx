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
  { value: "PRODUCT_RESEARCHER", label: "product research Agent" },
  { value: "LISTING_OPTIMIZER", label: "text Agent" },
  { value: "IMAGE_CREATIVE", label: "image Agent" },
  { value: "CUSTOMER_INSIGHT", label: "customertext Agent" },
  { value: "PROFIT_ANALYST", label: "profit Agent" },
  { value: "KEYWORD_EXPLORER", label: "keywords Agent" },
  { value: "CONTENT_WRITER", label: "text Agent" },
  { value: "PLANNER", label: "text Agent" },
  { value: "GENERAL_ASSISTANT", label: "text Agent" },
];

const signalLabels: Record<string, string> = {
  APPROVAL_APPROVED: "approvalpassed",
  APPROVAL_REJECTED: "approvaltext",
  APPROVAL_CHANGES_REQUESTED: "english_text",
  SANDBOX_EVALUATED: "english_text",
  SANDBOX_BLOCKED: "english_text",
  USER_CORRECTION: "humantext",
  TOOL_FAILURE: "english_textfailed",
};

const promptStatusLabels: Record<PromptVersionStatus, string> = {
  DRAFT: "text",
  CHALLENGER: "english_text",
  CHAMPION: "english_text",
  RETIRED: "english_text",
};

function percent(metric?: RatioMetric | null) {
  return metric?.value == null ? "nonetext" : `${(metric.value * 100).toFixed(1)}%`;
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "english_text";
}

function evidenceMeta(status?: string) {
  if (status === "COMPLETE") {
    return { label: "evidencetext", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  }
  if (status === "PARTIAL") {
    return { label: "evidencetext", tone: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle };
  }
  return { label: "nonetext", tone: "border-slate-200 bg-slate-100 text-slate-600", icon: Clock3 };
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
      setError(cause instanceof Error ? cause.message : "Agent textdatatextfailed");
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
      setError(cause instanceof Error ? cause.message : "english_textfailed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection() {
    if (!correction.runId.trim() || !correction.field.trim() || correction.reason.trim().length < 10) {
      setError("humanenglish_textreal Run ID、textfieldsenglish_text 10 english_text。");
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
      setError(cause instanceof Error ? cause.message : "humanenglish_textfailed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPromptAction() {
    if (!promptAction || promptReason.trim().length < 10) {
      setError("Prompt statusenglish_text 10 english_texthumanenglish_text。");
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
      setError(cause instanceof Error ? cause.message : "Prompt statustextfailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-5 px-5 py-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-600"><Activity size={18} /><span className="text-sm font-medium">Agent datatext</span></div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Agent english_text</h1>
          <p className="mt-1 text-sm text-slate-600">english_textrealtask、approval、english_textevidence；noneevidenceenglish_text。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={agentType} onChange={(event) => setAgentType(event.target.value as AgentType)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
            {agentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <option value={7}>text 7 text</option><option value={30}>text 30 text</option><option value={90}>text 90 text</option>
          </select>
          <button type="button" onClick={() => void aggregate()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />generationrealtext
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="evidencestatus" value={evidence.label} detail={latest ? `${latest.version} · ${dateTime(latest.windowEnd)}` : "textgenerationenglish_text"} />
        <MetricTile label="english_text" value={latest ? `${(latest.coverage * 100).toFixed(1)}%` : "nonetext"} detail="english_text ≥ 95%" />
        <MetricTile label="english_text" value={latest ? String(latest.sampleSize) : "0"} detail="english_textreal Agent run" />
        <MetricTile label="approvalenglish_text" value={percent(scores?.quality.proposalAcceptRate)} detail="passed / yeshumanenglish_textapproval" />
        <MetricTile label="taskcompletedtext" value={percent(scores?.stability.completionRate)} detail="successtext / alltext" />
      </section>

      <div className={`flex items-start gap-3 rounded-md border px-4 py-3 ${evidence.tone}`}>
        <EvidenceIcon size={18} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">{evidence.label}</p>
          <p className="mt-1 opacity-90">{scores?.status === "COMPLETE" ? "english_text 95%，english_text。" : scores?.status === "PARTIAL" ? "english_text，english_textautomaticenglish_text Prompt。" : "textyesenglish_textrealtext，english_text 0 english_text。"}</p>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">english_text</h2><p className="mt-1 text-xs text-slate-500">english_textnonetext</p></div><ShieldCheck size={19} className="text-blue-600" /></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-sm">
            <div><dt className="text-slate-500">english_text</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.sandboxBlockRate)}</dd></div>
            <div><dt className="text-slate-500">humanenglish_text</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.manualEditRate)}</dd></div>
            <div><dt className="text-slate-500">textsuccesstext</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.quality.firstPassPublishSuccessRate)}</dd></div>
            <div><dt className="text-slate-500">failedtext</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.failureRate)}</dd></div>
            <div><dt className="text-slate-500">english_text</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.retryRate)}</dd></div>
            <div><dt className="text-slate-500">textfailedtext</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.stability.toolFailureRate)}</dd></div>
            <div><dt className="text-slate-500">completedtext P50</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.efficiency.runCompletionSecondsP50 == null ? "nonetext" : `${scores.efficiency.runCompletionSecondsP50.toFixed(1)} text`}</dd></div>
            <div><dt className="text-slate-500">completedtext P95</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.efficiency.runCompletionSecondsP95 == null ? "nonetext" : `${scores.efficiency.runCompletionSecondsP95.toFixed(1)} text`}</dd></div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">textevidence</h2><p className="mt-1 text-xs text-slate-500">english_textreal run</p></div><GitBranch size={19} className="text-blue-600" /></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-sm">
            <div><dt className="text-slate-500">english_text</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.attribution.feedbackCoverage)}</dd></div>
            <div><dt className="text-slate-500">english_text</dt><dd className="mt-1 font-semibold text-slate-950">{percent(scores?.attribution.routeCoverage)}</dd></div>
            <div><dt className="text-slate-500">english_texttask</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.attribution.attributedRunCount ?? 0}</dd></div>
            <div><dt className="text-slate-500">english_text</dt><dd className="mt-1 font-semibold text-slate-950">{scores?.attribution.routeDecisionCount ?? 0}</dd></div>
          </dl>
          <div className="border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setCorrectionOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><MessageSquareWarning size={16} />texthumantext</button></div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Prompt english_text</h2><p className="mt-1 text-xs text-slate-500">textautomaticenglish_text；english_text 5% challenger text。</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">text</th><th className="px-5 py-3">status</th><th className="px-5 py-3">text</th><th className="px-5 py-3">english_text</th><th className="px-5 py-3">english_text</th><th className="px-5 py-3 text-right">text</th></tr></thead><tbody className="divide-y divide-slate-100">{promptVersions.length ? promptVersions.map((item) => <tr key={item.id}><td className="px-5 py-3 font-medium text-slate-950">{item.version}</td><td className="px-5 py-3">{promptStatusLabels[item.status]}</td><td className="px-5 py-3">{(item.routingWeight * 100).toFixed(0)}%</td><td className="px-5 py-3 font-mono text-xs text-slate-500">{item.contentHash.slice(0, 12)}</td><td className="px-5 py-3 text-slate-600">{dateTime(item.activatedAt)}</td><td className="px-5 py-3 text-right">{item.status === "DRAFT" ? <button type="button" onClick={() => setPromptAction({ id: item.id, status: "CHALLENGER", version: item.version })} className="text-blue-600 hover:text-blue-800">text 5% text</button> : item.status === "CHALLENGER" ? <button type="button" onClick={() => setPromptAction({ id: item.id, status: "CHAMPION", version: item.version })} className="text-blue-600 hover:text-blue-800">humanenglish_text</button> : <span className="text-slate-400">noneenglish_text</span>}</td></tr>) : <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">textnone Prompt text，textautomaticgenerationenglish_text。</td></tr>}</tbody></table></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">english_text</h2><MessageSquareWarning size={18} className="text-blue-600" /></div><div className="divide-y divide-slate-100">{feedback.length ? feedback.slice(0, 10).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{signalLabels[item.signalType] ?? item.signalType}</p><time className="text-xs text-slate-500">{dateTime(item.createdAt)}</time></div><p className="mt-1 truncate text-xs text-slate-500" title={item.runId ?? item.approvalId ?? item.listingId ?? ""}>source：{item.source} · text：{item.runId ?? item.approvalId ?? item.listingId ?? "english_text"}</p></div>) : <p className="px-5 py-8 text-center text-sm text-slate-500">textnoneenglish_text。</p>}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">english_text</h2><Route size={18} className="text-blue-600" /></div><div className="divide-y divide-slate-100">{routerDecisions.length ? routerDecisions.slice(0, 10).map((item) => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{item.selectedModel}</p><time className="text-xs text-slate-500">{dateTime(item.createdAt)}</time></div><p className="mt-1 truncate text-xs text-slate-500" title={item.runId}>Run：{item.runId} · text：{item.latencyMs == null ? "english_text" : `${item.latencyMs} ms`} · text：{item.qualityScore == null ? "english_text" : `${item.qualityScore} text`}</p></div>) : <p className="px-5 py-8 text-center text-sm text-slate-500">textnoneenglish_textevidence。</p>}</div></div>
      </section>

      {loading ? <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm text-white shadow-lg"><RefreshCw size={16} className="animate-spin" />textreadrealtextevidence</div> : null}

      <Modal open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="texthumantext" width="max-w-2xl"><div className="space-y-4"><p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">textyesenglish_textreal Run english_text，english_text ID textbackendtext。</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-700">Run ID *<input value={correction.runId} onChange={(event) => setCorrection((current) => ({ ...current, runId: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">Listing ID（text）<input value={correction.listingId} onChange={(event) => setCorrection((current) => ({ ...current, listingId: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700 sm:col-span-2">textfields *<input value={correction.field} onChange={(event) => setCorrection((current) => ({ ...current, field: event.target.value }))} placeholder="text：producttitle" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">english_text<input value={correction.before} onChange={(event) => setCorrection((current) => ({ ...current, before: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm text-slate-700">english_text<input value={correction.after} onChange={(event) => setCorrection((current) => ({ ...current, after: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><label className="block text-sm text-slate-700">english_text *<textarea value={correction.reason} onChange={(event) => setCorrection((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="textagentenglish_text，texthumanenglish_text。" className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setCorrectionOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">text</button><button type="button" disabled={busy} onClick={() => void submitCorrection()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">english_textevidence</button></div></div></Modal>

      <Modal open={Boolean(promptAction)} onClose={() => setPromptAction(null)} title="text Prompt statustext"><div className="space-y-4"><p className="text-sm text-slate-700">text <strong>{promptAction?.version}</strong> english_text“{promptAction ? promptStatusLabels[promptAction.status] : ""}”。english_text 5% text，english_texthumantext。</p><label className="block text-sm text-slate-700">english_text *<textarea value={promptReason} onChange={(event) => setPromptReason(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setPromptAction(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">text</button><button type="button" disabled={busy} onClick={() => void submitPromptAction()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">english_text</button></div></div></Modal>
    </div>
  );
}
