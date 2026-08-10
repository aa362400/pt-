import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CloudCog,
  BrainCircuit,
  CreditCard,
  Database,
  FileSearch,
  PlugZap,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Store,
  XCircle,
} from "lucide-react";
import {
  enterpriseSloApi,
  type EnterpriseReadinessEvidence,
  type EnterpriseReadinessGateName,
  type EnterpriseReadinessGateStatus,
  type JudgeGoldCase,
  type JudgeGoldStatus,
  type EnterpriseSloDay,
  type EnterpriseSloReport,
} from "../api/enterpriseSlo";
import SystemHealthOverview from "../components/ops/SystemHealthOverview";

const evidenceLabels: Record<string, string> = {
  terminal_task_samples: "english_texttasktext",
  quality_review_samples: "texthumantextreviewtext",
  suggestion_samples: "english_text",
  latency_samples: "texttaskenglish_text",
  cost_coverage: "taskcostenglish_text",
  queue_metrics: "BullMQ queueenglish_text",
};

const gateMeta: Record<
  EnterpriseReadinessGateName,
  { label: string; description: string; icon: typeof ShieldCheck }
> = {
  kms: { label: "AWS KMS", description: "credentialsecretenglish_text", icon: CloudCog },
  objectLock: {
    label: "S3 Object Lock",
    description: "textevidenceenglish_text",
    icon: Database,
  },
  penetrationTest: {
    label: "english_text",
    description: "yesenglish_textsecuritytextreport",
    icon: FileSearch,
  },
  slo14Day: {
    label: "14 text SLO",
    description: "text、english_text",
    icon: Clock3,
  },
  nonMockAgent: {
    label: "real Agent",
    description: "text 7 english_texttasksuccessevidence",
    icon: ServerCog,
  },
  mcpTrust: {
    label: "MCP english_text",
    description: "Manifest、textfileenglish_text",
    icon: PlugZap,
  },
  memoryGovernance: {
    label: "Agent english_text",
    description: "source、text、yesenglish_textstatustext",
    icon: ShieldCheck,
  },
  judgeCalibration: {
    label: "english_texthumanreview",
    description: "english_text、english_textreviewtext",
    icon: BrainCircuit,
  },
  ozonReadOnly: {
    label: "Ozon text",
    description: "realstorereadenglish_text",
    icon: Store,
  },
  stripeLive: {
    label: "Stripe text",
    description: "realenglish_textevidence",
    icon: CreditCard,
  },
};

const gateOrder = Object.keys(gateMeta) as EnterpriseReadinessGateName[];

const judgeCategoryLabels: Record<string, string> = {
  etsy_title: "Etsy titletext",
  amazon_title: "Amazon titletext",
  temu_pricing: "Temu pricingtext",
  ozon_russian_listing: "Ozon english_text",
  image_consistency: "productimageconsistencytext",
  ip_risk: "english_textrisktext",
};

const judgeCasePresentations: Record<
  string,
  { title: string; description: string }
> = {
  "etsy-title-valid-001": {
    title: "english_text Etsy producttitle",
    description: "titletextproduct、english_textscene，english_text。",
  },
  "etsy-title-empty-002": {
    title: "Etsy producttitletext",
    description: "textproducttitleenglish_text，textgenerationnoneenglish_text。",
  },
  "amazon-title-valid-001": {
    title: "english_text Amazon producttitletext",
    description: "producttext、english_textkeywordstext，english_textgenerationtexttitle。",
  },
  "amazon-title-missing-product-002": {
    title: "Amazon productenglish_text",
    description: "textproductenglish_text，english_textgenerationtitle。",
  },
  "temu-pricing-profit-001": {
    title: "Temu pricingtextyesprofit",
    description: "english_text、english_textplatformtext，english_text。",
  },
  "temu-pricing-loss-002": {
    title: "Temu pricingenglish_text",
    description: "english_textnoneenglish_textallcost，english_text。",
  },
  "ozon-russian-evidence-001": {
    title: "Ozon english_textevidencetext",
    description: "texttitle、english_textsourceevidencetext，english_text。",
  },
  "ozon-russian-no-evidence-002": {
    title: "Ozon english_textevidence",
    description: "textyessourceevidenceenglish_text，english_textnoneenglish_text。",
  },
  "image-consistency-high-001": {
    title: "generationimagetextproductenglish_text",
    description: "productenglish_textconsistencyenglish_text，english_textreview。",
  },
  "image-consistency-low-002": {
    title: "generationimagetextproductenglish_text",
    description: "consistencyenglish_textimage。",
  },
  "ip-risk-safe-001": {
    title: "productenglish_text",
    description: "title、english_textrisktext，english_text。",
  },
  "ip-risk-trademark-002": {
    title: "productenglish_textrisk",
    description: "english_texthumantext。",
  },
};

const judgeFieldLabels: Record<string, string> = {
  title: "producttitle",
  description: "producttext",
  productName: "producttext",
  attributes: "producttext",
  keywords: "keywords",
  maxChars: "titleenglish_text",
  mode: "english_text",
  blankCost: "textcost",
  approvedPrice: "platformenglish_text",
  logisticsFee: "english_text",
  platformFeeRate: "platformtext",
  withdrawalFeeRate: "english_text",
  evidenceCount: "sourceevidence",
  available: "productimage",
  avgIdentity: "textconsistency",
  perImageScores: "textconsistency",
  tags: "producttext",
};

const gateCustomerMessages: Record<
  EnterpriseReadinessGateName,
  { passed: string; blocked: string }
> = {
  kms: {
    passed: "storecredentialenglish_textsecrettext。",
    blocked: "textconfigurationtextsecrettext，storecredentialenglish_text。",
  },
  objectLock: {
    passed: "textevidenceenglish_text。",
    blocked: "textevidenceenglish_text。",
  },
  penetrationTest: {
    passed: "yesenglish_textsecuritytextreporttextpassedtext。",
    blocked: "english_textyesenglish_textsecuritytextreport。",
  },
  slo14Day: {
    passed: "english_text 14 english_text。",
    blocked: "english_text 14 english_text。",
  },
  nonMockAgent: {
    passed: "text 7 english_textrealagenttasksuccesstext。",
    blocked: "text 7 textrealagenttasksuccessevidencetext。",
  },
  mcpTrust: {
    passed: "MCP english_text、textfileenglish_text。",
    blocked: "MCP english_text、textfileenglish_textcompletedenglish_text。",
  },
  memoryGovernance: {
    passed: "agentenglish_textsource、text、yesenglish_textstatustext。",
    blocked: "agentenglish_textsource、text、yesenglish_textevidenceenglish_text。",
  },
  judgeCalibration: {
    passed: "english_textpassedrealenglish_texthumanreview。",
    blocked: "english_textcompletedrealenglish_texthumanreview。",
  },
  ozonReadOnly: {
    passed: "Ozon realstoretextdataenglish_textaudit recordtext。",
    blocked: "Ozon realstoretextdataenglish_textevidencetext。",
  },
  stripeLive: {
    passed: "realenglish_textflowtextcompletedtext。",
    blocked: "realenglish_textflowtextcompletedtext。",
  },
};

const judgeDecisionMeta: Record<string, { label: string; tone: string }> = {
  PASS: { label: "english_textpassed", tone: "bg-emerald-50 text-emerald-700" },
  BLOCK: { label: "english_text", tone: "bg-red-50 text-red-700" },
  REJECT: { label: "english_text", tone: "bg-red-50 text-red-700" },
};

function judgeCasePresentation(item: JudgeGoldCase) {
  return (
    judgeCasePresentations[item.id] ?? {
      title: judgeCategoryLabels[item.category] ?? "english_text",
      description: "english_textinputenglish_textyesnotext。",
    }
  );
}

function formatJudgeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "english_text";
  if (typeof value === "boolean") return value ? "english_text" : "english_text";
  if (Array.isArray(value)) {
    if (!value.length) return "english_text";
    const suffix = key === "perImageScores" ? " text" : "";
    return `${value.map(String).join("、")}${suffix}`;
  }
  if (typeof value === "number") {
    if (key.endsWith("Rate")) return `${(value * 100).toFixed(0)}%`;
    if (["blankCost", "approvedPrice", "logisticsFee"].includes(key)) {
      return `¥${value.toFixed(2)}`;
    }
    if (key === "evidenceCount") return `${value} text`;
    if (key === "maxChars") return `${value} english_text`;
    if (key === "avgIdentity") return `${value} text`;
  }
  if (typeof value === "object") return "english_textdata";
  if (key === "mode" && value === "evaluate") return "english_textprofit";
  return String(value);
}

function customerGateMessage(
  name: EnterpriseReadinessGateName,
  status?: EnterpriseReadinessGateStatus,
): string {
  return status === "passed"
    ? gateCustomerMessages[name].passed
    : gateCustomerMessages[name].blocked;
}

function rate(value: number | null): string {
  return value === null ? "nonetext" : `${value.toFixed(2)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | null): string {
  if (!value) return "textacceptance";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function duration(value: number | null): string {
  if (value === null) return "nonetext";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} text`;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className="text-xs text-[#667085]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#101828]">{value}</p>
      <p className="mt-1 truncate text-xs text-[#98A2B3]" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function DayStatus({ day }: { day: EnterpriseSloDay }) {
  if (day.passed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={14} />
        text
      </span>
    );
  }
  if (!day.dataComplete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <AlertTriangle size={14} />
        evidencetext
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
      <XCircle size={14} />
      english_text
    </span>
  );
}

function GateStatus({ status }: { status?: EnterpriseReadinessGateStatus }) {
  if (status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={14} />
        passed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <XCircle size={14} />
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
      <AlertTriangle size={14} />
      textconfiguration
    </span>
  );
}

export default function EnterpriseReadiness() {
  const [report, setReport] = useState<EnterpriseSloReport | null>(null);
  const [readiness, setReadiness] =
    useState<EnterpriseReadinessEvidence | null>(null);
  const [judgeGold, setJudgeGold] = useState<JudgeGoldStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [judgeDialogOpen, setJudgeDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [judgeSubmitting, setJudgeSubmitting] = useState(false);
  const [reviewedCaseIds, setReviewedCaseIds] = useState<string[]>([]);
  const [judgeReason, setJudgeReason] = useState("");
  const [judgeConfirmation, setJudgeConfirmation] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirmation, setRevokeConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextReport, nextReadiness, nextJudgeGold] = await Promise.all([
        enterpriseSloApi.getReport(),
        enterpriseSloApi.getReadinessGates(),
        enterpriseSloApi.getJudgeGold(),
      ]);
      setReport(nextReport);
      setReadiness(nextReadiness);
      setJudgeGold(nextJudgeGold);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "textacceptancestatusreadfailed",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const collect = async () => {
    setCollecting(true);
    try {
      setReport(await enterpriseSloApi.collect());
      setError(null);
    } catch (collectError) {
      setError(
        collectError instanceof Error
          ? collectError.message
          : "textevidencetextfailed",
      );
    } finally {
      setCollecting(false);
    }
  };

  const today = report?.currentDay ?? null;
  const allJudgeCasesReviewed = Boolean(
    judgeGold?.cases.length && reviewedCaseIds.length === judgeGold.cases.length,
  );
  const toggleJudgeCase = (caseId: string) => {
    setReviewedCaseIds((current) =>
      current.includes(caseId)
        ? current.filter((id) => id !== caseId)
        : [...current, caseId],
    );
  };
  const approveJudgeGold = async () => {
    if (!judgeGold?.datasetHash || !judgeGold.reportHash) return;
    setJudgeSubmitting(true);
    try {
      const next = await enterpriseSloApi.approveJudgeGold({
        datasetHash: judgeGold.datasetHash,
        reportHash: judgeGold.reportHash,
        reviewedCaseIds,
        reason: judgeReason,
        confirmation: judgeConfirmation,
      });
      setJudgeGold(next);
      setJudgeDialogOpen(false);
      setReviewedCaseIds([]);
      setJudgeReason("");
      setJudgeConfirmation("");
      await load();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : "english_textreviewfailed",
      );
    } finally {
      setJudgeSubmitting(false);
    }
  };
  const revokeJudgeGold = async () => {
    setJudgeSubmitting(true);
    try {
      setJudgeGold(
        await enterpriseSloApi.revokeJudgeGold({
          reason: revokeReason,
          confirmation: revokeConfirmation,
        }),
      );
      setRevokeDialogOpen(false);
      setRevokeReason("");
      setRevokeConfirmation("");
      await load();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "english_textreviewtextfailed",
      );
    } finally {
      setJudgeSubmitting(false);
    }
  };
  const readinessStatus = useMemo(() => {
    if (!readiness || readiness.status === "not_verified") {
      return {
        label: "textcompletedacceptance",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
        icon: Clock3,
      };
    }
    if (readiness.claimAllowed) {
      return {
        label: "english_textallpassed",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: CheckCircle2,
      };
    }
    return {
      label: readiness.stale ? "acceptanceevidenceenglish_text" : "english_textpassed",
      tone: "border-red-200 bg-red-50 text-red-900",
      icon: XCircle,
    };
  }, [readiness]);
  const ReadinessIcon = readinessStatus.icon;

  return (
    <div className="space-y-5" data-testid="enterprise-readiness-page">
      <header className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#3157D5]">
            <ShieldCheck size={18} />
            english_textacceptance
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#101828]">
            realevidenceenglish_text
          </h1>
          <p className="mt-1 text-sm text-[#667085]">
            english_text、failedenglish_text，platformenglish_textacceptancepassed。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || collecting}
            title="textreadacceptancetext"
            className="inline-flex h-10 items-center gap-2 border border-[#D0D5DD] bg-white px-3 text-sm font-semibold text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            text
          </button>
          <button
            type="button"
            onClick={() => void collect()}
            disabled={loading || collecting}
            className="inline-flex h-10 items-center gap-2 bg-[#3157D5] px-4 text-sm font-semibold text-white hover:bg-[#2849B8] disabled:opacity-50"
          >
            <Database size={16} />
            {collecting ? "english_text" : "english_text SLO"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <SystemHealthOverview />

      <section className={`border px-5 py-4 ${readinessStatus.tone}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold">
            <ReadinessIcon size={18} />
            {readinessStatus.label}
          </div>
          <span className="text-sm font-semibold">
            textacceptance：{formatTime(readiness?.checkedAt ?? null)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6">
          {readiness?.message ?? "textreadenglish_textrealacceptanceevidence。"}
        </p>
      </section>

      <section className="border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BrainCircuit size={18} className="text-[#3157D5]" />
              <h2 className="text-sm font-bold text-[#101828]">english_texthumanreview</h2>
              <GateStatus status={judgeGold?.gate.status} />
            </div>
            <p className="mt-1 text-xs text-[#667085]">
              english_text，english_text、text、english_text。
            </p>
          </div>
          <div className="flex gap-2">
            {judgeGold?.approval?.decision === "approved" ? (
              <button
                type="button"
                disabled={judgeSubmitting}
                onClick={() => setRevokeDialogOpen(true)}
                className="h-9 border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                textapproval
              </button>
            ) : null}
            <button
              type="button"
              disabled={!judgeGold?.approvable || judgeSubmitting}
              onClick={() => setJudgeDialogOpen(true)}
              className="h-9 bg-[#3157D5] px-4 text-sm font-semibold text-white hover:bg-[#2849B8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              review {judgeGold?.cases.length ?? 0} english_text
            </button>
          </div>
        </div>
        <div className="grid gap-px bg-[#EAECF0] md:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">textplantext</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#101828]">{judgeGold?.datasetVersion ?? "textread"}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">english_text</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{judgeGold?.cases.length ?? 0} text</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">reviewtext</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{judgeGold?.signerConfigured ? "textsecuritytext" : "textconfiguration"}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">textapproval</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">
              {judgeGold?.approval?.decision === "approved"
                ? `english_text ${judgeGold.approval.reviewedCaseCount} text`
                : judgeGold?.approval?.decision === "revoked"
                  ? "english_text"
                  : "texthumanreview"}
            </p>
          </div>
        </div>
        <div className="px-5 py-3 text-xs leading-5 text-[#667085]">
          {judgeGold
            ? customerGateMessage("judgeCalibration", judgeGold.gate.status)
            : "textreadenglish_textevidence。"}
        </div>
      </section>

      <section className="border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#101828]">english_text</h2>
              <p className="mt-1 text-xs text-[#667085]">
                textreadenglish_textacceptanceevidence，textautomaticenglish_textwritetext。
              </p>
            </div>
            {readiness?.stale ? (
              <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                evidenceenglish_text
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {gateOrder.map((name) => {
            const meta = gateMeta[name];
            const gate = readiness?.gates[name];
            const Icon = meta.icon;
            return (
              <div
                key={name}
                className="min-w-0 border-b border-r border-[#EAECF0] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#F2F4F7] text-[#3157D5]">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-[#101828]">
                        {meta.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-[#667085]">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <GateStatus status={gate?.status} />
                </div>
                <p className="mt-3 min-h-10 text-xs leading-5 text-[#667085]">
                  {customerGateMessage(name, gate?.status)}
                </p>
                {gate?.message ? (
                  <details className="mt-2 text-xs text-[#667085]">
                    <summary className="cursor-pointer select-none font-semibold text-[#475467]">
                      english_text
                    </summary>
                    <p className="mt-2 break-words border-l-2 border-[#D0D5DD] pl-2 leading-5">
                      {gate.message}
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="tasksuccesstext"
          value={rate(today?.taskSuccessRate ?? null)}
          detail={`text ≥ ${report?.thresholds.taskSuccessRate ?? 98}%`}
        />
        <Metric
          label="textpassedtext"
          value={rate(today?.qualityPassRate ?? null)}
          detail={`text ≥ ${report?.thresholds.qualityPassRate ?? 95}%`}
        />
        <Metric
          label="P95 text"
          value={duration(today?.p95LatencyMs ?? null)}
          detail="texttask startedAt / finishedAt"
        />
        <Metric
          label="texttaskcost"
          value={
            today?.averageCostPerTask
              ? Number(today.averageCostPerTask).toFixed(4)
              : "nonetext"
          }
          detail={`${today?.costSampleCount ?? 0}/${today?.totalTasks ?? 0} english_texttaskyescost`}
        />
      </section>

      {judgeDialogOpen && judgeGold ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="english_textreview">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-[#101828]">english_textreview</h2>
                <p className="mt-1 text-xs text-[#667085]">
                  english_textinputenglish_textyesnoenglish_text。
                </p>
              </div>
              <button type="button" onClick={() => setJudgeDialogOpen(false)} className="h-9 w-9 border border-[#D0D5DD] text-[#475467]" title="text">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex flex-col gap-3 border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#101828]">english_text {judgeGold.cases.length} english_text</p>
                  <p className="mt-1 text-xs leading-5 text-[#475467]">
                    english_textinputenglish_text，english_textrealenglish_text。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setReviewedCaseIds(
                      allJudgeCasesReviewed ? [] : judgeGold.cases.map((item) => item.id),
                    )
                  }
                  className="h-9 shrink-0 border border-[#3157D5] bg-white px-3 text-sm font-semibold text-[#3157D5] hover:bg-blue-50"
                >
                  {allJudgeCasesReviewed ? "english_text" : `text ${judgeGold.cases.length} text`}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {judgeGold.cases.map((item) => {
                  const presentation = judgeCasePresentation(item);
                  const decision = judgeDecisionMeta[item.expectedDecision] ?? {
                    label: "texthumantext",
                    tone: "bg-amber-50 text-amber-700",
                  };
                  const reviewed = reviewedCaseIds.includes(item.id);
                  return (
                    <article
                      key={item.id}
                      className={`border p-4 ${
                        reviewed
                          ? "border-[#3157D5] bg-blue-50/40"
                          : "border-[#D0D5DD] bg-white"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={() => toggleJudgeCase(item.id)}
                          className="mt-1 h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-start justify-between gap-2">
                            <strong className="text-sm text-[#101828]">{presentation.title}</strong>
                            <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${decision.tone}`}>
                              {decision.label}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-[#3157D5]">
                            {judgeCategoryLabels[item.category] ?? item.category}
                          </span>
                          <span className="mt-2 block text-xs leading-5 text-[#475467]">
                            {presentation.description}
                          </span>
                        </span>
                      </label>
                      <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-[#E5E7EB] pt-3 sm:grid-cols-2">
                        {Object.entries(item.input).map(([key, value]) => (
                          <div key={key} className="min-w-0">
                            <dt className="text-[11px] text-[#667085]">
                              {judgeFieldLabels[key] ?? key}
                            </dt>
                            <dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-[#344054]">
                              {formatJudgeValue(key, value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <details className="mt-3 border-t border-[#E5E7EB] pt-2 text-xs text-[#667085]">
                        <summary className="cursor-pointer select-none font-semibold text-[#475467]">
                          english_text
                        </summary>
                        <p className="mt-2 break-all">english_text：{item.id}</p>
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all bg-[#101828] p-2 text-[11px] leading-5 text-white">
                          {JSON.stringify(item.input, null, 2)}
                        </pre>
                      </details>
                    </article>
                  );
                })}
              </div>
              <label className="mt-4 block text-sm font-semibold text-[#344054]">
                reviewtext
                <textarea value={judgeReason} onChange={(event) => setJudgeReason(event.target.value)} rows={3} className="mt-2 w-full border border-[#D0D5DD] px-3 py-2 text-sm font-normal" placeholder="english_text、english_text（text 10 english_text）" />
              </label>
              <label className="mt-4 flex cursor-pointer items-start gap-3 border border-[#D0D5DD] bg-[#F9FAFB] p-3 text-sm text-[#344054]">
                <input
                  type="checkbox"
                  checked={judgeConfirmation === "english_textdatatext"}
                  onChange={(event) =>
                    setJudgeConfirmation(
                      event.target.checked ? "english_textdatatext" : "",
                    )
                  }
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <strong className="block">english_text</strong>
                  <span className="mt-1 block text-xs leading-5 text-[#667085]">
                    english_textalltext，english_textplatformenglish_text。
                  </span>
                </span>
              </label>
              <details className="mt-4 border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#667085]">
                <summary className="cursor-pointer select-none font-semibold text-[#475467]">
                  english_textdataenglish_text
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>textplantext：{judgeGold.datasetVersion ?? "textread"}</p>
                  <p>english_text：{judgeGold.labelPolicy ?? "textread"}</p>
                  <p className="break-all">datatext：{judgeGold.datasetHash ?? "textgeneration"}</p>
                  <p className="break-all">reporttext：{judgeGold.reportHash ?? "textgeneration"}</p>
                </div>
              </details>
            </div>
            <div className="flex items-center justify-between border-t border-[#E5E7EB] px-5 py-4">
              <span className="text-xs font-semibold text-[#667085]">english_text {reviewedCaseIds.length}/{judgeGold.cases.length} text</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setJudgeDialogOpen(false)} className="h-9 border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]">text</button>
                <button
                  type="button"
                  onClick={() => void approveJudgeGold()}
                  disabled={!allJudgeCasesReviewed || judgeReason.trim().length < 10 || judgeConfirmation !== "english_textdatatext" || judgeSubmitting}
                  className="h-9 bg-[#3157D5] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {judgeSubmitting ? "english_text…" : "textreviewtext"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {revokeDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="english_textreview">
          <div className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-[#101828]">english_textreview</h2>
                <p className="mt-1 text-xs text-red-700">english_textfailed，english_textaudit record。</p>
              </div>
              <button type="button" onClick={() => setRevokeDialogOpen(false)} className="h-9 w-9 border border-[#D0D5DD] text-[#475467]" title="text">×</button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-semibold text-[#344054]">
                english_text
                <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} rows={3} className="mt-2 w-full border border-[#D0D5DD] px-3 py-2 text-sm font-normal" placeholder="english_text（text 10 english_text）" />
              </label>
              <label className="block text-sm font-semibold text-[#344054]">
                english_text
                <input value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} className="mt-2 h-10 w-full border border-[#D0D5DD] px-3 text-sm font-normal" placeholder="input：english_textapproval" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E5E7EB] px-5 py-4">
              <button type="button" onClick={() => setRevokeDialogOpen(false)} className="h-9 border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]">text</button>
              <button type="button" onClick={() => void revokeJudgeGold()} disabled={revokeReason.trim().length < 10 || revokeConfirmation !== "english_textapproval" || judgeSubmitting} className="h-9 bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {judgeSubmitting ? "english_text…" : "english_text"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-[#E5E7EB] px-5 py-4">
            <h2 className="text-sm font-bold text-[#101828]">
              14 text SLO textcompletedenglish_text
            </h2>
            <p className="mt-1 text-xs text-[#667085]">
              english_text；english_text，english_text。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-[#F9FAFB] text-left text-xs text-[#667085]">
                <tr>
                  <th className="px-5 py-3">text</th>
                  <th className="px-5 py-3">status</th>
                  <th className="px-5 py-3">tasksuccess</th>
                  <th className="px-5 py-3">text</th>
                  <th className="px-5 py-3">textcompleted</th>
                  <th className="px-5 py-3">english_text</th>
                  <th className="px-5 py-3">P95</th>
                  <th className="px-5 py-3">queue/text</th>
                  <th className="px-5 py-3">costtext</th>
                </tr>
              </thead>
              <tbody>
                {report?.days.length ? (
                  report.days.map((day) => (
                    <tr key={day.id} className="border-t border-[#EAECF0]">
                      <td className="px-5 py-3 font-medium text-[#101828]">
                        {formatDate(day.date)}
                      </td>
                      <td className="px-5 py-3">
                        <DayStatus day={day} />
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {rate(day.taskSuccessRate)}{" "}
                        <span className="text-xs text-[#98A2B3]">
                          ({day.successfulTasks}/{day.totalTasks})
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {rate(day.qualityPassRate)}{" "}
                        <span className="text-xs text-[#98A2B3]">
                          ({day.qualityPassed}/{day.qualitySamples})
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {rate(day.autonomousCompletionRate)}
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {rate(day.suggestionAdoptionRate)}
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {duration(day.p95LatencyMs)}
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {day.queueEvidenceAvailable
                          ? day.queueBacklog
                          : "english_text"}{" "}
                        / {day.unresolvedDeadLetters}
                      </td>
                      <td className="px-5 py-3 text-[#475467]">
                        {day.costSampleCount}/{day.totalTasks}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-sm text-[#98A2B3]"
                    >
                      textnoneenglish_text。textdatatextpassedacceptance。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#101828]">english_textevidence</h2>
            <div className="mt-3 space-y-2">
              {today?.missingEvidence.length ? (
                today.missingEvidence.map((item) => (
                  <div
                    key={item}
                    className="flex gap-2 text-sm leading-5 text-amber-800"
                  >
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    {evidenceLabels[item] ?? item}
                  </div>
                ))
              ) : (
                <div className="flex gap-2 text-sm text-emerald-700">
                  <CheckCircle2 size={15} />
                  textevidencefieldstext
                </div>
              )}
            </div>
          </section>
          <section className="border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#101828]">SLO securitytext</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">english_text</dt>
                <dd className="font-semibold text-[#101828]">
                  {today?.unauthorizedActionCount ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">english_text</dt>
                <dd className="font-semibold text-amber-700">
                  {today?.blockedUnauthorizedAttemptCount ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">english_text</dt>
                <dd className="font-semibold text-[#101828]">
                  {today?.unresolvedDeadLetters ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">errorenglish_text</dt>
                <dd className="font-semibold text-[#101828]">
                  {rate(today?.errorBudgetConsumed ?? null)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">textpassed</dt>
                <dd className="font-semibold text-[#101828]">
                  {report?.consecutivePassedDays ?? 0}/
                  {report?.requiredDays ?? 14} text
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}
