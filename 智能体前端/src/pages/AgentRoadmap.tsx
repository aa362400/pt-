import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  ExternalLink,
  ListChecks,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  getAgentRoadmap,
  runAgentRoadmapAcceptanceEvidence,
  type AgentRoadmapCheckStatus,
  type AgentRoadmapPhase,
  type AgentRoadmapReport,
  type AgentRoadmapStatus,
} from '../api/agentRoadmap';
import {
  getAgentAutonomyMode,
  updateAgentAutonomyMode,
  type AgentAutonomyMode,
} from '../api/agentAutonomy';

const waveOrder = ['A 适配', 'B 稳定', 'C 聪明', 'D 主动', 'E 记忆'];
const agentRoadmapAutoRefreshMs = 15_000;

const structuredProcessFields = [
  {
    label: 'scenePlan',
    value: '规划、步骤和输入输出在任务结果里结构化呈现',
  },
  {
    label: 'qualityRationale',
    value: '评分依据、人审结果和工作记忆评分统一展示',
  },
  {
    label: 'verifier',
    value: '自检明细、审核兜底和重做原因进入审核中心',
  },
  {
    label: 'failureReason',
    value: '失败原因、缺口和下一步动作在阶段卡片中可追踪',
  },
];

const statusMeta: Record<
  AgentRoadmapStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  passed: {
    label: '通过',
    className: 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]',
    icon: CheckCircle2,
  },
  partial: {
    label: '部分接入',
    className: 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]',
    icon: AlertTriangle,
  },
  backend: {
    label: '后端有，证据不足',
    className: 'border-[#C9D7FF] bg-[#EEF4FF] text-[#3658C9]',
    icon: Clock3,
  },
  missing: {
    label: '未接入',
    className: 'border-[#F8B4B4] bg-[#FFF1F2] text-[#BE123C]',
    icon: XCircle,
  },
};

const checkMeta: Record<
  AgentRoadmapCheckStatus,
  {
    label: string;
    className: string;
  }
> = {
  ok: {
    label: '正常',
    className: 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]',
  },
  warn: {
    label: '警告',
    className: 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]',
  },
  down: {
    label: '失败',
    className: 'border-[#F8B4B4] bg-[#FFF1F2] text-[#BE123C]',
  },
};

function fallbackReport(errorMessage: string): AgentRoadmapReport {
  const phases: AgentRoadmapPhase[] = Array.from({ length: 20 }, (_, index) => {
    const id = index + 1;
    const wave =
      id <= 4
        ? 'A 适配'
        : id <= 8
          ? 'B 稳定'
          : id <= 12
            ? 'C 聪明'
            : id <= 17
              ? 'D 主动'
              : 'E 记忆';
    const titles = [
      '接口契约固化',
      '事件推送替代轮询',
      '前端体验适配',
      '身份与租户贯通',
      '可靠性基线',
      '压测与容量',
      '质量评分体系可信化',
      'SLO 98% 数据证明',
      '平台数据回灌知识库',
      '工具能力接平台真通道',
      '任务规划器 Planner',
      '自检器 Verifier',
      '平台事件感知',
      '主动建议',
      '自动排程',
      '授权分级与护栏',
      '全功能平台代理',
      '工作记忆',
      '复盘学习',
      '自治闭环验收',
    ];
    return {
      id,
      title: titles[index],
      wave,
      priority: id <= 8 || id === 11 || id === 12 || id >= 13 ? 'P0' : 'P1',
      status: 'missing',
      visibleSurface: '后端验收接口不可用',
      strictFinding: '当前只显示降级占位，不作为验收依据。',
      nextAction: '修复 /api/v1/agent-roadmap 后重新刷新。',
      evidence: [],
      blockers: [errorMessage],
      linkedSurfaces: ['/agent-roadmap'],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'frontend-fallback',
    organizationId: 'unknown',
    contract: { version: 'unknown', taskTypes: [], providerTaskTypes: [] },
    summary: {
      totals: { passed: 0, partial: 0, backend: 0, missing: 20 },
      completionScore: 0,
    },
    operationSafety: {
      connectedStoreChannels: 0,
      externalWriteAdapterConnected: false,
      highRiskActionMode: 'human_confirmation_required',
      approvalNotificationKind: 'high_risk_action_review',
      actions: [
        '改变真实店铺商品',
        '发布 Listing 到平台',
        '自动调价',
        '自动投广告',
        '处理订单/退款',
        '影响外部店铺的高风险动作',
      ].map((label, index) => ({
        key: `fallback-${index}`,
        label,
        action: '后端未返回',
        approvalStatus: 'notification_center_ready',
        externalExecutionStatus: 'not_connected',
        notificationKind: '后端未返回',
        detail: '后端验收接口不可用，当前只显示安全占位。',
      })),
    },
    metrics: {
      agentRunTotal: 0,
      agentRunCompleted: 0,
      agentRunFailed: 0,
      agentRunRunning: 0,
      agentRunSuccessRate: null,
      scoredWorkMemories: 0,
      qualityPassRate: null,
      workMemories: 0,
      experienceCards: 0,
      readinessSamples: 0,
      readinessPassedSamples: 0,
      readinessConsecutivePassedDays: 0,
      readinessLatestPassedDate: null,
      suggestionsCreated: 0,
      suggestionsScheduled: 0,
      unauthorizedAgentActions: 0,
      deadLetterJobs: 0,
      unresolvedDeadLetterJobs: 0,
      reviewScoredTasks: 0,
      reviewAutoApprovedTasks: 0,
      reviewRegenerationTasks: 0,
      toolRegistryActions: 0,
      toolRegistryPermissionLevels: 0,
      agentProxyCoveredActions: 0,
      agentProxyUncoveredActions: [],
      capacityReportAvailable: false,
      capacityReportSummary: 'n/a',
    },
    liveChecks: [
      {
        key: 'roadmap-api',
        label: '后端验收接口',
        status: 'down',
        detail: errorMessage,
      },
    ],
    phases,
  };
}

function AgentRoadmap() {
  const [report, setReport] = useState<AgentRoadmapReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptanceRunning, setAcceptanceRunning] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const [lastAcceptanceMessage, setLastAcceptanceMessage] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [autonomyMode, setAutonomyMode] = useState<AgentAutonomyMode | null>(null);
  const [autonomySaving, setAutonomySaving] = useState(false);
  const [autonomyError, setAutonomyError] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  useEffect(() => {
    getAgentAutonomyMode()
      .then(setAutonomyMode)
      .catch((modeError: unknown) =>
        setAutonomyError(
          modeError instanceof Error ? modeError.message : '无法读取 L2 自主模式',
        ),
      );
  }, []);

  const toggleAutonomyMode = async () => {
    if (!autonomyMode || autonomySaving) return;
    setAutonomySaving(true);
    setAutonomyError(null);
    try {
      setAutonomyMode(
        await updateAgentAutonomyMode(
          !autonomyMode.autoResearchAndDraftEnabled,
        ),
      );
    } catch (modeError) {
      setAutonomyError(
        modeError instanceof Error ? modeError.message : '更新 L2 自主模式失败',
      );
    } finally {
      setAutonomySaving(false);
    }
  };

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;
    if (mode === 'initial') {
      setLoading(true);
    } else if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const data = await getAgentRoadmap();
      setReport(data);
      setError(null);
      setLastRefreshAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setReport(fallbackReport(message));
      setLastRefreshAt(new Date().toISOString());
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadInFlightRef.current = false;
    }
  }, []);

  const runAcceptance = useCallback(async () => {
    setAcceptanceRunning(true);
    setAcceptanceError(null);
    try {
      const result = await runAgentRoadmapAcceptanceEvidence();
      setReport(result.report);
      setLastAcceptanceMessage(result.message);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAcceptanceError(message);
    } finally {
      setAcceptanceRunning(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (acceptanceRunning || document.visibilityState !== 'visible') {
        return;
      }

      void load('background');
    }, agentRoadmapAutoRefreshMs);

    return () => window.clearInterval(interval);
  }, [acceptanceRunning, load]);

  const phases = report?.phases ?? [];
  const isBackendLive = report?.source === 'backend-live' && !error;
  const grouped = waveOrder.map((wave) => ({
    wave,
    phases: phases.filter((phase) => phase.wave === wave),
  }));

  if (loading && !report) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" data-testid="agent-roadmap-page">
        <div className="flex items-center gap-3 text-[#6C63FF]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6C63FF] border-t-transparent" />
          <span className="text-sm font-medium">正在读取后端验收接口...</span>
        </div>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="space-y-5" data-testid="agent-roadmap-page">
      <section className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6C63FF]">
              <ClipboardCheck size={18} />
              1-20 阶段真实接入验收
              <span className="rounded-full border border-[#C9D7FF] bg-[#EEF4FF] px-2 py-0.5 text-xs text-[#3658C9]">
                {isBackendLive ? '后端实时接口' : '前端降级占位'}
              </span>
              {error ? (
                <span className="rounded-full border border-[#F8B4B4] bg-[#FFF1F2] px-2 py-0.5 text-xs text-[#BE123C]">
                  降级占位
                </span>
              ) : null}
            </div>
            <h2 className="text-2xl font-bold text-[#1A1A2E]">
              现在不是写死表格，而是从后端验收 API 读取状态
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5F6B8A]">
              严格口径：只有 UI 可见、链路真实、数据有证据的阶段才算通过。后端已有但没有前端闭环或没有样本的阶段，会显示为“后端有，证据不足”或“部分接入”。
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#8B93B5]">
              <span>组织：{report.organizationId}</span>
              <span>生成：{formatDateTime(report.generatedAt)}</span>
              <span>自动回读：每 {agentRoadmapAutoRefreshMs / 1000} 秒</span>
              {lastRefreshAt ? <span>最后回读：{formatDateTime(lastRefreshAt)}</span> : null}
              <span>契约：{report.contract.version}</span>
              <span>taskType：{report.contract.taskTypes.length}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[500px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Metric label="通过" value={report.summary.totals.passed} tone="green" />
              <Metric label="部分" value={report.summary.totals.partial} tone="amber" />
              <Metric label="后端有" value={report.summary.totals.backend} tone="blue" />
              <Metric label="未接入" value={report.summary.totals.missing} tone="red" />
              <Metric label="总分" value={`${report.summary.completionScore}%`} tone="purple" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void load('refresh')}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm font-semibold text-[#35405F] hover:bg-[#F7F8FF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={refreshing || acceptanceRunning}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                刷新验收状态
              </button>
              <button
                type="button"
                onClick={() => void runAcceptance()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#6C63FF] bg-[#6C63FF] px-3 text-sm font-semibold text-white hover:bg-[#5B54E8] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={refreshing || acceptanceRunning}
                title="只核验数据库中的现有证据，不创建样本或修改自治配置"
              >
                <PlayCircle size={16} className={acceptanceRunning ? 'animate-pulse' : ''} />
                {acceptanceRunning ? '证据核验中' : '核验当前真实证据'}
              </button>
            </div>
            {lastAcceptanceMessage ? (
              <p className="rounded-lg border border-[#B8E8CC] bg-[#ECFDF3] px-3 py-2 text-xs leading-5 text-[#15803D]">
                已从现有持久化证据重新计算；未创建验收样本，也未修改自治配置。
              </p>
            ) : null}
            {acceptanceError ? (
              <p className="rounded-lg border border-[#F8B4B4] bg-[#FFF1F2] px-3 py-2 text-xs leading-5 text-[#BE123C]">
                {acceptanceError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border border-[#E8E8F0] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <Bot size={18} className="text-[#6C63FF]" />
              L2 草稿自主模式
              <span className={`border px-2 py-0.5 text-xs font-semibold ${
                autonomyMode?.autoResearchAndDraftEnabled
                  ? 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]'
                  : 'border-[#DDE1F2] bg-[#F7F8FF] text-[#5F6B8A]'
              }`}>
                {autonomyMode?.autoResearchAndDraftEnabled ? '已开启' : '已暂停'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#5F6B8A]">
              商品创建或更新后，自动执行真实调研、生成本地 Listing 草稿并进入人工审核。
            </p>
            <div className="mt-3 grid gap-2 text-xs text-[#4A5578] sm:grid-cols-2">
              <span>允许：商品调研、Listing 草稿</span>
              <span>禁止：发布、调价、库存、广告、订单、退款、付费</span>
              <span>调研证据不足：阻断草稿</span>
              <span>外部店铺写入：必须人工确认</span>
            </div>
            {autonomyError ? (
              <p className="mt-3 text-xs text-[#BE123C]">{autonomyError}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void toggleAutonomyMode()}
            disabled={!autonomyMode || autonomySaving}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
              autonomyMode?.autoResearchAndDraftEnabled
                ? 'border-[#F8B4B4] bg-white text-[#BE123C] hover:bg-[#FFF1F2]'
                : 'border-[#6C63FF] bg-[#6C63FF] text-white hover:bg-[#5B54E8]'
            }`}
          >
            <Bot size={16} />
            {autonomySaving
              ? '正在更新...'
              : autonomyMode?.autoResearchAndDraftEnabled
                ? '暂停 L2 模式'
                : '开启 L2 模式'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <LiveChecks report={report} />
          <OperationSafetyPanel report={report} />

          {grouped.map((group) => (
            <div key={group.wave} className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1A2E]">{group.wave}</h3>
                <span className="text-xs text-[#8B93B5]">{group.phases.length} 个阶段</span>
              </div>
              <div className="grid gap-3 2xl:grid-cols-2">
                {group.phases.map((phase) => (
                  <PhaseCard key={phase.id} phase={phase} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <Database size={18} className="text-[#6C63FF]" />
              当前真实样本
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="任务总数" value={report.metrics.agentRunTotal} />
              <MiniStat label="成功率" value={formatRate(report.metrics.agentRunSuccessRate)} />
              <MiniStat label="评分样本" value={report.metrics.scoredWorkMemories} />
              <MiniStat label="质量通过率" value={formatRate(report.metrics.qualityPassRate)} />
              <MiniStat label="工作记忆" value={report.metrics.workMemories} />
              <MiniStat label="经验卡" value={report.metrics.experienceCards} />
              <MiniStat label="主动建议" value={report.metrics.suggestionsCreated} />
              <MiniStat label="已排程建议" value={report.metrics.suggestionsScheduled} />
              <MiniStat label="连续试运行" value={`${report.metrics.readinessConsecutivePassedDays}/14`} />
              <MiniStat label="越权拦截" value={report.metrics.unauthorizedAgentActions} />
              <MiniStat label="死信未处理" value={report.metrics.unresolvedDeadLetterJobs} />
              <MiniStat label="审核分数" value={report.metrics.reviewScoredTasks} />
              <MiniStat label="工具覆盖" value={`${report.metrics.agentProxyCoveredActions}/${report.metrics.toolRegistryActions}`} />
              <MiniStat label="自动重做" value={report.metrics.reviewRegenerationTasks} />
              <MiniStat label="容量报告" value={report.metrics.capacityReportAvailable ? '已接入' : '缺失'} />
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <ListChecks size={18} className="text-[#6C63FF]" />
              结构化过程视图
            </div>
            <div className="space-y-2">
              {structuredProcessFields.map((item) => (
                <ProcessEvidenceRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {['/image-prompt', '/assistant', '/review', '/agent-roadmap'].map((surface) => (
                <span key={surface} className="rounded-full bg-[#F7F8FF] px-2 py-1 text-[11px] font-medium text-[#6C63FF] ring-1 ring-[#E0DEFF]">
                  {surface}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <ShieldCheck size={18} className="text-[#6C63FF]" />
              验收规则
            </div>
            <div className="space-y-3 text-sm leading-6 text-[#5F6B8A]">
              <p>“后端有”不等于“完成”。它只说明代码路径存在，但 UI、真实样本、端到端证据还没齐。</p>
              <p>“通过”必须能被当前接口证明。第 20 阶段必须有连续 14 个自然日的 readiness passed 样本，否则不能宣称自治闭环完成。</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <ExternalLink size={18} className="text-[#6C63FF]" />
              入口
            </div>
            <ul className="space-y-2 text-sm text-[#5F6B8A]">
              <li>智能助手：真实 assistant_chat / 双智能体核心</li>
              <li>AI 图片工作台：出图任务、进度、结果</li>
              <li>审核中心：人审与质量闭环</li>
              <li>审计日志：授权和越权轨迹</li>
              <li>本页：20 阶段验收驾驶舱</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

function ProcessEvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#EEF0FA] bg-[#FCFCFF] px-3 py-2">
      <div className="text-xs font-bold text-[#4A5578]">{label}</div>
      <div className="mt-1 text-xs leading-5 text-[#5F6B8A]">{value}</div>
    </div>
  );
}

function LiveChecks({ report }: { report: AgentRoadmapReport }) {
  return (
    <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1A1A2E]">实时链路检查</h3>
        <span className="text-xs text-[#8B93B5]">GET /api/v1/agent-roadmap</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {report.liveChecks.map((check) => {
          const meta = checkMeta[check.status];
          return (
            <div key={check.key} className="rounded-lg border border-[#EEF0FA] bg-[#FCFCFF] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#1A1A2E]">{check.label}</div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                  {meta.label}
                </span>
              </div>
              <p className="break-words text-xs leading-5 text-[#5F6B8A]">{check.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperationSafetyPanel({ report }: { report: AgentRoadmapReport }) {
  const safety = report.operationSafety;
  const guardedAdapterCount = safety.actions.filter(
    (item) => item.externalExecutionStatus === 'guarded_adapter_connected',
  ).length;
  const externalWriteFullyCovered =
    guardedAdapterCount > 0 && guardedAdapterCount === safety.actions.length;
  const externalWriteLabel = guardedAdapterCount > 0
    ? `受控写入 ${guardedAdapterCount}/${safety.actions.length}`
    : '外部写入未接入';

  return (
    <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1A1A2E]">
            店铺智能体运营安全闸
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#5F6B8A]">
            智能体可以提出运营动作并进入通知中心；会影响外部店铺的动作必须人工确认。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[#C9D7FF] bg-[#EEF4FF] px-2.5 py-1 text-[#3658C9]">
            已同步渠道 {safety.connectedStoreChannels}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 ${
              externalWriteFullyCovered
                ? 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]'
                : 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]'
            }`}
          >
            {externalWriteLabel}
          </span>
          <span className="rounded-full border border-[#F8DDA7] bg-[#FFF7E6] px-2.5 py-1 text-[#B45309]">
            默认人工确认
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {safety.actions.map((item) => {
          const hasGuardedAdapter =
            item.externalExecutionStatus === 'guarded_adapter_connected';

          return (
            <div key={item.key} className="rounded-lg border border-[#EEF0FA] bg-[#FCFCFF] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#1A1A2E]">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs text-[#8B93B5]">{item.action}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#B8E8CC] bg-[#ECFDF3] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                    通知中心已接入
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      hasGuardedAdapter
                        ? 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]'
                        : 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]'
                    }`}
                  >
                    {hasGuardedAdapter ? '受控写入已接入' : '仅审批不写店铺'}
                  </span>
                  <span className="rounded-full border border-[#F8DDA7] bg-[#FFF7E6] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                    不会无确认执行
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#5F6B8A]">{item.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'green' | 'amber' | 'blue' | 'red' | 'purple';
}) {
  const colorMap = {
    green: 'bg-[#ECFDF3] text-[#15803D]',
    amber: 'bg-[#FFF7E6] text-[#B45309]',
    blue: 'bg-[#EEF4FF] text-[#3658C9]',
    red: 'bg-[#FFF1F2] text-[#BE123C]',
    purple: 'bg-[#F3F0FF] text-[#6C43C9]',
  };

  return (
    <div className={`rounded-lg px-3 py-2 ${colorMap[tone]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-[#F7F8FF] px-3 py-2">
      <div className="text-base font-bold text-[#1A1A2E]">{value}</div>
      <div className="text-xs text-[#6B7280]">{label}</div>
    </div>
  );
}

function PhaseCard({ phase }: { phase: AgentRoadmapPhase }) {
  const meta = statusMeta[phase.status];
  const StatusIcon = meta.icon;

  return (
    <article className="rounded-lg border border-[#EEF0FA] bg-[#FCFCFF] p-4" data-testid={`phase-${phase.id}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#8B93B5]">
            阶段 {phase.id} · {phase.priority}
          </div>
          <h4 className="mt-1 text-sm font-bold text-[#1A1A2E]">{phase.title}</h4>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
          <StatusIcon size={13} />
          {meta.label}
        </span>
      </div>

      <dl className="space-y-3 text-xs leading-5">
        <Field label="前端/后端入口" value={phase.visibleSurface} />
        <Field label="严格发现" value={phase.strictFinding} />
        <Field label="下一步" value={phase.nextAction} />
      </dl>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ListBlock title="证据" items={phase.evidence} empty="暂无可验收样本" />
        <ListBlock title="缺口" items={phase.blockers} empty="暂无阻塞项" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {phase.linkedSurfaces.map((surface, index) => (
          <span key={`${surface}-${index}`} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#6C63FF] ring-1 ring-[#E0DEFF]">
            {surface}
          </span>
        ))}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-[#4A5578]">{label}</dt>
      <dd className="text-[#5F6B8A]">{value}</dd>
    </div>
  );
}

function ListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-[#EEF0FA] bg-white p-3">
      <div className="mb-2 text-xs font-bold text-[#4A5578]">{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs leading-5 text-[#5F6B8A]">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#8B93B5]">{empty}</p>
      )}
    </div>
  );
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${value}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default AgentRoadmap;
