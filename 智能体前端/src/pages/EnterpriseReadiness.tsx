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
  terminal_task_samples: "缺少终态任务样本",
  quality_review_samples: "缺少人工质量审核样本",
  suggestion_samples: "缺少主动建议及采纳样本",
  latency_samples: "缺少任务耗时样本",
  cost_coverage: "任务成本记录未完整覆盖",
  queue_metrics: "BullMQ 队列指标不可用",
};

const gateMeta: Record<
  EnterpriseReadinessGateName,
  { label: string; description: string; icon: typeof ShieldCheck }
> = {
  kms: { label: "AWS KMS", description: "凭据密钥信封加密", icon: CloudCog },
  objectLock: {
    label: "S3 Object Lock",
    description: "审计证据不可篡改归档",
    icon: Database,
  },
  penetrationTest: {
    label: "渗透测试",
    description: "有效的外部安全测试报告",
    icon: FileSearch,
  },
  slo14Day: {
    label: "14 天 SLO",
    description: "连续、完整且每日达标",
    icon: Clock3,
  },
  nonMockAgent: {
    label: "真实 Agent",
    description: "近 7 天非模拟任务成功证据",
    icon: ServerCog,
  },
  mcpTrust: {
    label: "MCP 信任网关",
    description: "Manifest、执行文件与工具集合可信基线",
    icon: PlugZap,
  },
  memoryGovernance: {
    label: "Agent 记忆治理",
    description: "来源、版本、有效期与隔离状态覆盖",
    icon: ShieldCheck,
  },
  judgeCalibration: {
    label: "业务质量人工审核",
    description: "六类业务测试、完整样本确认与审核留痕",
    icon: BrainCircuit,
  },
  ozonReadOnly: {
    label: "Ozon 只读",
    description: "真实店铺读取与审计链完整",
    icon: Store,
  },
  stripeLive: {
    label: "Stripe 实付",
    description: "真实支付及退款闭环证据",
    icon: CreditCard,
  },
};

const gateOrder = Object.keys(gateMeta) as EnterpriseReadinessGateName[];

const judgeCategoryLabels: Record<string, string> = {
  etsy_title: "Etsy 标题检查",
  amazon_title: "Amazon 标题检查",
  temu_pricing: "Temu 核价检查",
  ozon_russian_listing: "Ozon 俄语刊登检查",
  image_consistency: "商品图片一致性检查",
  ip_risk: "知识产权风险检查",
};

const judgeCasePresentations: Record<
  string,
  { title: string; description: string }
> = {
  "etsy-title-valid-001": {
    title: "完整的 Etsy 商品标题",
    description: "标题包含商品、定制方式和送礼场景，应允许继续。",
  },
  "etsy-title-empty-002": {
    title: "Etsy 商品标题为空",
    description: "缺少商品标题时必须阻止继续，不能生成无效刊登。",
  },
  "amazon-title-valid-001": {
    title: "完整的 Amazon 商品标题资料",
    description: "商品名、定制属性和关键词齐全，应允许生成合规标题。",
  },
  "amazon-title-missing-product-002": {
    title: "Amazon 商品名称缺失",
    description: "缺少商品名称时必须阻止继续，不能凭空生成标题。",
  },
  "temu-pricing-profit-001": {
    title: "Temu 核价后仍有利润",
    description: "核准价覆盖胚体、物流和平台费用，应允许进入下一步。",
  },
  "temu-pricing-loss-002": {
    title: "Temu 核价后发生亏损",
    description: "核准价无法覆盖全部成本，系统必须明确拒绝。",
  },
  "ozon-russian-evidence-001": {
    title: "Ozon 俄语刊登证据完整",
    description: "俄语标题、描述和两条来源证据齐全，应允许继续。",
  },
  "ozon-russian-no-evidence-002": {
    title: "Ozon 俄语刊登缺少证据",
    description: "没有来源证据时必须阻止继续，不能提交无依据内容。",
  },
  "image-consistency-high-001": {
    title: "生成图片与原商品高度一致",
    description: "商品结构与外观一致性达到要求，应允许进入审核。",
  },
  "image-consistency-low-002": {
    title: "生成图片与原商品差异过大",
    description: "一致性低于质量门槛时必须阻止使用该图片。",
  },
  "ip-risk-safe-001": {
    title: "商品文案未发现品牌侵权词",
    description: "标题、描述和标签未命中风险品牌，应允许继续。",
  },
  "ip-risk-trademark-002": {
    title: "商品文案包含品牌侵权风险",
    description: "命中受保护品牌词时必须阻止刊登并提示人工处理。",
  },
};

const judgeFieldLabels: Record<string, string> = {
  title: "商品标题",
  description: "商品描述",
  productName: "商品名称",
  attributes: "商品属性",
  keywords: "关键词",
  maxChars: "标题长度上限",
  mode: "计算方式",
  blankCost: "胚体成本",
  approvedPrice: "平台核准价",
  logisticsFee: "物流费用",
  platformFeeRate: "平台费率",
  withdrawalFeeRate: "提现费率",
  evidenceCount: "来源证据",
  available: "商品图片",
  avgIdentity: "平均一致性",
  perImageScores: "逐图一致性",
  tags: "商品标签",
};

const gateCustomerMessages: Record<
  EnterpriseReadinessGateName,
  { passed: string; blocked: string }
> = {
  kms: {
    passed: "店铺凭据已使用受控密钥加密。",
    blocked: "尚未配置受控密钥加密，店铺凭据保护未达到企业要求。",
  },
  objectLock: {
    passed: "审计证据已启用不可篡改归档。",
    blocked: "审计证据尚未启用不可篡改归档。",
  },
  penetrationTest: {
    passed: "有效的外部安全测试报告已通过验证。",
    blocked: "尚未提供有效的外部安全测试报告。",
  },
  slo14Day: {
    passed: "已连续 14 天满足稳定性目标。",
    blocked: "尚未积累连续 14 天完整且达标的稳定性记录。",
  },
  nonMockAgent: {
    passed: "近 7 天存在真实智能体任务成功记录。",
    blocked: "近 7 天真实智能体任务成功证据不足。",
  },
  mcpTrust: {
    passed: "MCP 工具清单、程序文件和能力范围已验证。",
    blocked: "MCP 工具的清单、程序文件或能力范围尚未完成可信验证。",
  },
  memoryGovernance: {
    passed: "智能体记忆的来源、版本、有效期和隔离状态完整。",
    blocked: "智能体记忆的来源、版本、有效期或租户隔离证据不完整。",
  },
  judgeCalibration: {
    passed: "业务质量测试已通过真实回归和人工审核。",
    blocked: "业务质量测试尚未完成真实回归或人工审核。",
  },
  ozonReadOnly: {
    passed: "Ozon 真实店铺只读数据链路与审计记录完整。",
    blocked: "Ozon 真实店铺只读数据或连续验证证据不足。",
  },
  stripeLive: {
    passed: "真实支付与退款流程已完成验证。",
    blocked: "真实支付或退款流程尚未完成验证。",
  },
};

const judgeDecisionMeta: Record<string, { label: string; tone: string }> = {
  PASS: { label: "应允许通过", tone: "bg-emerald-50 text-emerald-700" },
  BLOCK: { label: "应阻止继续", tone: "bg-red-50 text-red-700" },
  REJECT: { label: "应明确拒绝", tone: "bg-red-50 text-red-700" },
};

function judgeCasePresentation(item: JudgeGoldCase) {
  return (
    judgeCasePresentations[item.id] ?? {
      title: judgeCategoryLabels[item.category] ?? "业务质量测试",
      description: "请确认系统对该输入的预期处理结果是否正确。",
    }
  );
}

function formatJudgeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "未填写";
  if (typeof value === "boolean") return value ? "已提供" : "未提供";
  if (Array.isArray(value)) {
    if (!value.length) return "未填写";
    const suffix = key === "perImageScores" ? " 分" : "";
    return `${value.map(String).join("、")}${suffix}`;
  }
  if (typeof value === "number") {
    if (key.endsWith("Rate")) return `${(value * 100).toFixed(0)}%`;
    if (["blankCost", "approvedPrice", "logisticsFee"].includes(key)) {
      return `¥${value.toFixed(2)}`;
    }
    if (key === "evidenceCount") return `${value} 条`;
    if (key === "maxChars") return `${value} 个字符`;
    if (key === "avgIdentity") return `${value} 分`;
  }
  if (typeof value === "object") return "已提供结构化数据";
  if (key === "mode" && value === "evaluate") return "按核准价测算利润";
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
  return value === null ? "无样本" : `${value.toFixed(2)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | null): string {
  if (!value) return "尚未验收";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function duration(value: number | null): string {
  if (value === null) return "无样本";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} 秒`;
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
        达标
      </span>
    );
  }
  if (!day.dataComplete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <AlertTriangle size={14} />
        证据不足
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
      <XCircle size={14} />
      未达标
    </span>
  );
}

function GateStatus({ status }: { status?: EnterpriseReadinessGateStatus }) {
  if (status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={14} />
        通过
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
        <XCircle size={14} />
        失败
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
      <AlertTriangle size={14} />
      未配置
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
        loadError instanceof Error ? loadError.message : "企业验收状态读取失败",
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
          : "今日证据采集失败",
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
        approveError instanceof Error ? approveError.message : "质量测试样本审核失败",
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
        revokeError instanceof Error ? revokeError.message : "质量测试审核撤销失败",
      );
    } finally {
      setJudgeSubmitting(false);
    }
  };
  const readinessStatus = useMemo(() => {
    if (!readiness || readiness.status === "not_verified") {
      return {
        label: "尚未完成验收",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
        icon: Clock3,
      };
    }
    if (readiness.claimAllowed) {
      return {
        label: "企业级硬门禁全部通过",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: CheckCircle2,
      };
    }
    return {
      label: readiness.stale ? "验收证据已过期" : "企业级硬门禁未通过",
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
            企业级验收
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#101828]">
            真实证据与硬门禁
          </h1>
          <p className="mt-1 text-sm text-[#667085]">
            任何一项缺失、失败或过期，平台都禁止显示为企业级验收通过。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || collecting}
            title="重新读取验收结果"
            className="inline-flex h-10 items-center gap-2 border border-[#D0D5DD] bg-white px-3 text-sm font-semibold text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void collect()}
            disabled={loading || collecting}
            className="inline-flex h-10 items-center gap-2 bg-[#3157D5] px-4 text-sm font-semibold text-white hover:bg-[#2849B8] disabled:opacity-50"
          >
            <Database size={16} />
            {collecting ? "采集中" : "采集今日 SLO"}
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
            最近验收：{formatTime(readiness?.checkedAt ?? null)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6">
          {readiness?.message ?? "正在读取最近一次真实验收证据。"}
        </p>
      </section>

      <section className="border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BrainCircuit size={18} className="text-[#3157D5]" />
              <h2 className="text-sm font-bold text-[#101828]">业务质量人工审核</h2>
              <GateStatus status={judgeGold?.gate.status} />
            </div>
            <p className="mt-1 text-xs text-[#667085]">
              确认系统能够放行合格结果，并阻止缺失、亏损、失真或侵权结果。
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
                撤销审批
              </button>
            ) : null}
            <button
              type="button"
              disabled={!judgeGold?.approvable || judgeSubmitting}
              onClick={() => setJudgeDialogOpen(true)}
              className="h-9 bg-[#3157D5] px-4 text-sm font-semibold text-white hover:bg-[#2849B8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              审核 {judgeGold?.cases.length ?? 0} 个样本
            </button>
          </div>
        </div>
        <div className="grid gap-px bg-[#EAECF0] md:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">测试方案版本</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#101828]">{judgeGold?.datasetVersion ?? "未读取"}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">样本覆盖</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{judgeGold?.cases.length ?? 0} 个</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">审核留痕</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{judgeGold?.signerConfigured ? "可安全保存" : "尚未配置"}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs text-[#667085]">当前审批</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">
              {judgeGold?.approval?.decision === "approved"
                ? `已批准 ${judgeGold.approval.reviewedCaseCount} 个`
                : judgeGold?.approval?.decision === "revoked"
                  ? "已撤销"
                  : "待人工审核"}
            </p>
          </div>
        </div>
        <div className="px-5 py-3 text-xs leading-5 text-[#667085]">
          {judgeGold
            ? customerGateMessage("judgeCalibration", judgeGold.gate.status)
            : "正在读取业务质量测试证据。"}
        </div>
      </section>

      <section className="border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#101828]">企业级硬门禁</h2>
              <p className="mt-1 text-xs text-[#667085]">
                页面读取最近一次管理员验收证据，不会自动触发云端写入探测。
              </p>
            </div>
            {readiness?.stale ? (
              <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                证据已过期
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
                      管理员排查信息
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
          label="任务成功率"
          value={rate(today?.taskSuccessRate ?? null)}
          detail={`门槛 ≥ ${report?.thresholds.taskSuccessRate ?? 98}%`}
        />
        <Metric
          label="质量通过率"
          value={rate(today?.qualityPassRate ?? null)}
          detail={`门槛 ≥ ${report?.thresholds.qualityPassRate ?? 95}%`}
        />
        <Metric
          label="P95 延迟"
          value={duration(today?.p95LatencyMs ?? null)}
          detail="来自任务 startedAt / finishedAt"
        />
        <Metric
          label="平均任务成本"
          value={
            today?.averageCostPerTask
              ? Number(today.averageCostPerTask).toFixed(4)
              : "无样本"
          }
          detail={`${today?.costSampleCount ?? 0}/${today?.totalTasks ?? 0} 个终态任务有成本`}
        />
      </section>

      {judgeDialogOpen && judgeGold ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="业务质量测试审核">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-[#101828]">质量测试样本审核</h2>
                <p className="mt-1 text-xs text-[#667085]">
                  逐项确认系统对正常和异常业务输入的处理是否符合预期。
                </p>
              </div>
              <button type="button" onClick={() => setJudgeDialogOpen(false)} className="h-9 w-9 border border-[#D0D5DD] text-[#475467]" title="关闭">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex flex-col gap-3 border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#101828]">需要确认 {judgeGold.cases.length} 项业务测试</p>
                  <p className="mt-1 text-xs leading-5 text-[#475467]">
                    勾选表示您已核对输入条件和预期处理结果，不代表跳过真实回归测试。
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
                  {allJudgeCasesReviewed ? "取消全选" : `全选 ${judgeGold.cases.length} 项`}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {judgeGold.cases.map((item) => {
                  const presentation = judgeCasePresentation(item);
                  const decision = judgeDecisionMeta[item.expectedDecision] ?? {
                    label: "请人工判断",
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
                          管理员排查信息
                        </summary>
                        <p className="mt-2 break-all">样本编号：{item.id}</p>
                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all bg-[#101828] p-2 text-[11px] leading-5 text-white">
                          {JSON.stringify(item.input, null, 2)}
                        </pre>
                      </details>
                    </article>
                  );
                })}
              </div>
              <label className="mt-4 block text-sm font-semibold text-[#344054]">
                审核说明
                <textarea value={judgeReason} onChange={(event) => setJudgeReason(event.target.value)} rows={3} className="mt-2 w-full border border-[#D0D5DD] px-3 py-2 text-sm font-normal" placeholder="说明抽检方法、判断依据和批准理由（至少 10 个字符）" />
              </label>
              <label className="mt-4 flex cursor-pointer items-start gap-3 border border-[#D0D5DD] bg-[#F9FAFB] p-3 text-sm text-[#344054]">
                <input
                  type="checkbox"
                  checked={judgeConfirmation === "确认批准金标数据集"}
                  onChange={(event) =>
                    setJudgeConfirmation(
                      event.target.checked ? "确认批准金标数据集" : "",
                    )
                  }
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <strong className="block">最终确认</strong>
                  <span className="mt-1 block text-xs leading-5 text-[#667085]">
                    我已核对全部样本，并确认上述预期结果可作为平台质量判断标准。
                  </span>
                </span>
              </label>
              <details className="mt-4 border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#667085]">
                <summary className="cursor-pointer select-none font-semibold text-[#475467]">
                  管理员数据版本与签名信息
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>测试方案版本：{judgeGold.datasetVersion ?? "未读取"}</p>
                  <p>标签规则：{judgeGold.labelPolicy ?? "未读取"}</p>
                  <p className="break-all">数据指纹：{judgeGold.datasetHash ?? "未生成"}</p>
                  <p className="break-all">报告指纹：{judgeGold.reportHash ?? "未生成"}</p>
                </div>
              </details>
            </div>
            <div className="flex items-center justify-between border-t border-[#E5E7EB] px-5 py-4">
              <span className="text-xs font-semibold text-[#667085]">已确认 {reviewedCaseIds.length}/{judgeGold.cases.length} 项</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setJudgeDialogOpen(false)} className="h-9 border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]">取消</button>
                <button
                  type="button"
                  onClick={() => void approveJudgeGold()}
                  disabled={!allJudgeCasesReviewed || judgeReason.trim().length < 10 || judgeConfirmation !== "确认批准金标数据集" || judgeSubmitting}
                  className="h-9 bg-[#3157D5] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {judgeSubmitting ? "正在保存…" : "确认审核结果"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {revokeDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="撤销质量测试审核">
          <div className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-[#101828]">撤销质量测试审核</h2>
                <p className="mt-1 text-xs text-red-700">撤销后该企业门禁会立即变为失败，并保留完整审计记录。</p>
              </div>
              <button type="button" onClick={() => setRevokeDialogOpen(false)} className="h-9 w-9 border border-[#D0D5DD] text-[#475467]" title="关闭">×</button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-semibold text-[#344054]">
                撤销原因
                <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} rows={3} className="mt-2 w-full border border-[#D0D5DD] px-3 py-2 text-sm font-normal" placeholder="说明撤销依据（至少 10 个字符）" />
              </label>
              <label className="block text-sm font-semibold text-[#344054]">
                最终确认
                <input value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} className="mt-2 h-10 w-full border border-[#D0D5DD] px-3 text-sm font-normal" placeholder="输入：确认撤销金标审批" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E5E7EB] px-5 py-4">
              <button type="button" onClick={() => setRevokeDialogOpen(false)} className="h-9 border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]">取消</button>
              <button type="button" onClick={() => void revokeJudgeGold()} disabled={revokeReason.trim().length < 10 || revokeConfirmation !== "确认撤销金标审批" || judgeSubmitting} className="h-9 bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {judgeSubmitting ? "撤销中…" : "确认撤销"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-[#E5E7EB] px-5 py-4">
            <h2 className="text-sm font-bold text-[#101828]">
              14 天 SLO 已完成日快照
            </h2>
            <p className="mt-1 text-xs text-[#667085]">
              仅统计已结束业务日；当前日单独实时展示，不计入连续窗口。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-[#F9FAFB] text-left text-xs text-[#667085]">
                <tr>
                  <th className="px-5 py-3">日期</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">任务成功</th>
                  <th className="px-5 py-3">质量</th>
                  <th className="px-5 py-3">自主完成</th>
                  <th className="px-5 py-3">建议采纳</th>
                  <th className="px-5 py-3">P95</th>
                  <th className="px-5 py-3">队列/死信</th>
                  <th className="px-5 py-3">成本覆盖</th>
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
                          : "不可用"}{" "}
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
                      尚无日快照。空数据不会通过验收。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#101828]">今日缺失证据</h2>
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
                  今日证据字段完整
                </div>
              )}
            </div>
          </section>
          <section className="border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-[#101828]">SLO 安全门禁</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">越权操作</dt>
                <dd className="font-semibold text-[#101828]">
                  {today?.unauthorizedActionCount ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">已拦截越权尝试</dt>
                <dd className="font-semibold text-amber-700">
                  {today?.blockedUnauthorizedAttemptCount ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">未处理死信</dt>
                <dd className="font-semibold text-[#101828]">
                  {today?.unresolvedDeadLetters ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">错误预算消耗</dt>
                <dd className="font-semibold text-[#101828]">
                  {rate(today?.errorBudgetConsumed ?? null)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#667085]">连续通过</dt>
                <dd className="font-semibold text-[#101828]">
                  {report?.consecutivePassedDays ?? 0}/
                  {report?.requiredDays ?? 14} 天
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}
