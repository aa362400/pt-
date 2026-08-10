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
  type AgentRoadmapAcceptanceRun,
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

const waveOrder = ['A text', 'B text', 'C text', 'D text', 'E text'];
const agentRoadmapAutoRefreshMs = 15_000;

const structuredProcessFields = [
  {
    label: 'scenePlan',
    value: 'text、english_textinputoutputtexttaskenglish_text',
  },
  {
    label: 'qualityRationale',
    value: 'english_text、english_text',
  },
  {
    label: 'verifier',
    value: 'english_text、reviewenglish_textreviewtext',
  },
  {
    label: 'failureReason',
    value: 'failedtext、english_textstageenglish_text',
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
    label: 'passed',
    className: 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]',
    icon: CheckCircle2,
  },
  partial: {
    label: 'english_text',
    className: 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]',
    icon: AlertTriangle,
  },
  backend: {
    label: 'backendyes，evidencetext',
    className: 'border-[#C9D7FF] bg-[#EEF4FF] text-[#3658C9]',
    icon: Clock3,
  },
  missing: {
    label: 'english_text',
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
    label: 'text',
    className: 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]',
  },
  warn: {
    label: 'text',
    className: 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]',
  },
  down: {
    label: 'failed',
    className: 'border-[#F8B4B4] bg-[#FFF1F2] text-[#BE123C]',
  },
};

function fallbackReport(errorMessage: string): AgentRoadmapReport {
  const phases: AgentRoadmapPhase[] = Array.from({ length: 20 }, (_, index) => {
    const id = index + 1;
    const wave =
      id <= 4
        ? 'A text'
        : id <= 8
          ? 'B text'
          : id <= 12
            ? 'C text'
            : id <= 17
              ? 'D text'
              : 'E text';
    const titles = [
      'APIenglish_text',
      'english_text',
      'frontendenglish_text',
      'english_text',
      'english_text',
      'english_text',
      'english_text',
      'SLO 98% datatext',
      'platformdataenglish_text',
      'english_textplatformenglish_text',
      'taskenglish_text Planner',
      'english_text Verifier',
      'platformenglish_text',
      'english_text',
      'automatictext',
      'english_text',
      'english_textplatformtext',
      'english_text',
      'english_text',
      'english_textacceptance',
    ];
    return {
      id,
      title: titles[index],
      wave,
      priority: id <= 8 || id === 11 || id === 12 || id >= 13 ? 'P0' : 'P1',
      status: 'missing',
      visibleSurface: 'backendacceptanceAPIenglish_text',
      strictFinding: 'english_text，english_textacceptancetext。',
      nextAction: 'text /api/v1/agent-roadmap english_text。',
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
        'textrealstoreproduct',
        'publish Listing textplatform',
        'automatictext',
        'automaticenglish_text',
        'textorders/text',
        'english_textstoretextrisktext',
      ].map((label, index) => ({
        key: `fallback-${index}`,
        label,
        action: 'backendenglish_text',
        approvalStatus: 'notification_center_ready',
        externalExecutionStatus: 'not_connected',
        notificationKind: 'backendenglish_text',
        detail: 'backendacceptanceAPIenglish_text，english_textsecuritytext。',
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
        label: 'backendacceptanceAPI',
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
  const [lastAcceptance, setLastAcceptance] = useState<
    AgentRoadmapAcceptanceRun['created'] | null
  >(null);
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
          modeError instanceof Error ? modeError.message : 'nonetextread L2 english_text',
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
        modeError instanceof Error ? modeError.message : 'text L2 english_textfailed',
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
      setLastAcceptance(result.created);
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
          <span className="text-sm font-medium">textreadbackendacceptanceAPI...</span>
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
              1-20 stagerealtextacceptance
              <span className="rounded-full border border-[#C9D7FF] bg-[#EEF4FF] px-2 py-0.5 text-xs text-[#3658C9]">
                {isBackendLive ? 'backendtextAPI' : 'frontendenglish_text'}
              </span>
              {error ? (
                <span className="rounded-full border border-[#F8B4B4] bg-[#FFF1F2] px-2 py-0.5 text-xs text-[#BE123C]">
                  english_text
                </span>
              ) : null}
            </div>
            <h2 className="text-2xl font-bold text-[#1A1A2E]">
              english_textyesenglish_text，textyestextbackendacceptance API readstatus
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5F6B8A]">
              english_text：textyes UI text、textreal、datayesevidencetextstagetextpassed。backendtextyestextyesfrontendenglish_textyesenglish_textstage，english_text“backendyes，evidencetext”text“english_text”。
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#8B93B5]">
              <span>text：{report.organizationId}</span>
              <span>generation：{formatDateTime(report.generatedAt)}</span>
              <span>automatictext：text {agentRoadmapAutoRefreshMs / 1000} text</span>
              {lastRefreshAt ? <span>english_text：{formatDateTime(lastRefreshAt)}</span> : null}
              <span>text：{report.contract.version}</span>
              <span>taskType：{report.contract.taskTypes.length}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[500px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Metric label="passed" value={report.summary.totals.passed} tone="green" />
              <Metric label="text" value={report.summary.totals.partial} tone="amber" />
              <Metric label="backendyes" value={report.summary.totals.backend} tone="blue" />
              <Metric label="english_text" value={report.summary.totals.missing} tone="red" />
              <Metric label="text" value={`${report.summary.completionScore}%`} tone="purple" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void load('refresh')}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm font-semibold text-[#35405F] hover:bg-[#F7F8FF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={refreshing || acceptanceRunning}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                textacceptancestatus
              </button>
              <button
                type="button"
                onClick={() => void runAcceptance()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#6C63FF] bg-[#6C63FF] px-3 text-sm font-semibold text-white hover:bg-[#5B54E8] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={refreshing || acceptanceRunning}
                title="writerealtask、text、text、english_text、english_text readiness evidence"
              >
                <PlayCircle size={16} className={acceptanceRunning ? 'animate-pulse' : ''} />
                {acceptanceRunning ? 'acceptancerunning' : 'textrealacceptancetext'}
              </button>
            </div>
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
              L2 english_text
              <span className={`border px-2 py-0.5 text-xs font-semibold ${
                autonomyMode?.autoResearchAndDraftEnabled
                  ? 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]'
                  : 'border-[#DDE1F2] bg-[#F7F8FF] text-[#5F6B8A]'
              }`}>
                {autonomyMode?.autoResearchAndDraftEnabled ? 'english_text' : 'english_text'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#5F6B8A]">
              productenglish_text，automatictextrealtext、textcosttext Listing english_texthumanreview。
            </p>
            <div className="mt-3 grid gap-2 text-xs text-[#4A5578] sm:grid-cols-2">
              <span>text：producttext、Listing text</span>
              <span>text：publish、text、text、text、orders、text、text</span>
              <span>textevidencetext：english_text</span>
              <span>textstorewrite：texthumantext</span>
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
              ? 'english_text...'
              : autonomyMode?.autoResearchAndDraftEnabled
                ? 'text L2 text'
                : 'text L2 text'}
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
                <span className="text-xs text-[#8B93B5]">{group.phases.length} textstage</span>
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
              textrealtext
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="tasktext" value={report.metrics.agentRunTotal} />
              <MiniStat label="successtext" value={formatRate(report.metrics.agentRunSuccessRate)} />
              <MiniStat label="english_text" value={report.metrics.scoredWorkMemories} />
              <MiniStat label="textpassedtext" value={formatRate(report.metrics.qualityPassRate)} />
              <MiniStat label="english_text" value={report.metrics.workMemories} />
              <MiniStat label="english_text" value={report.metrics.experienceCards} />
              <MiniStat label="english_text" value={report.metrics.suggestionsCreated} />
              <MiniStat label="english_text" value={report.metrics.suggestionsScheduled} />
              <MiniStat label="english_text" value={`${report.metrics.readinessConsecutivePassedDays}/14`} />
              <MiniStat label="english_text" value={report.metrics.unauthorizedAgentActions} />
              <MiniStat label="english_text" value={report.metrics.unresolvedDeadLetterJobs} />
              <MiniStat label="reviewtext" value={report.metrics.reviewScoredTasks} />
              <MiniStat label="english_text" value={`${report.metrics.agentProxyCoveredActions}/${report.metrics.toolRegistryActions}`} />
              <MiniStat label="automatictext" value={report.metrics.reviewRegenerationTasks} />
              <MiniStat label="textreport" value={report.metrics.capacityReportAvailable ? 'english_text' : 'text'} />
            </div>
          </div>

          {lastAcceptance ? (
            <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
                <ClipboardCheck size={18} className="text-[#6C63FF]" />
                textacceptancewrite
              </div>
              <div className="space-y-2">
                <EvidenceRow label="texttask" value={lastAcceptance.awarenessTaskId} />
                <EvidenceRow label="textnotification" value={lastAcceptance.suggestionNotificationId} />
                <EvidenceRow label="texttask" value={lastAcceptance.scheduledTaskId} />
                <EvidenceRow label="english_text" value={lastAcceptance.scheduledFlowId} />
                <EvidenceRow label="AgentRun" value={lastAcceptance.operatorAgentRunId} />
                <EvidenceRow label="Operatortext" value={lastAcceptance.operatorFlowId} />
                <EvidenceRow label="reviewtask" value={lastAcceptance.reviewTaskId} />
                <EvidenceRow label="english_text" value={lastAcceptance.workMemoryId} />
                <EvidenceRow label="english_text" value={lastAcceptance.experienceCardId} />
                <EvidenceRow label="Readiness" value={lastAcceptance.readinessPassed} />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <ListChecks size={18} className="text-[#6C63FF]" />
              english_text
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
              acceptancetext
            </div>
            <div className="space-y-3 text-sm leading-6 text-[#5F6B8A]">
              <p>“backendyes”english_text“completed”。english_text，text UI、realtext、english_textevidenceenglish_text。</p>
              <p>“passed”english_textAPItext。text 20 stagetextyestext 14 english_text readiness passed text，noenglish_textcompleted。</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1A1A2E]">
              <ExternalLink size={18} className="text-[#6C63FF]" />
              text
            </div>
            <ul className="space-y-2 text-sm text-[#5F6B8A]">
              <li>english_text：real assistant_chat / textagenttext</li>
              <li>AI imageenglish_text：texttask、text、text</li>
              <li>reviewtext：english_text</li>
              <li>english_text：english_text</li>
              <li>text：20 stageacceptanceenglish_text</li>
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
        <h3 className="text-sm font-bold text-[#1A1A2E]">english_text</h3>
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
    ? `textwrite ${guardedAdapterCount}/${safety.actions.length}`
    : 'textwriteenglish_text';

  return (
    <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1A1A2E]">
            storeagenttextsecuritytext
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#5F6B8A]">
            agentenglish_textnotificationtext；english_textstoreenglish_texthumantext。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[#C9D7FF] bg-[#EEF4FF] px-2.5 py-1 text-[#3658C9]">
            textsynctext {safety.connectedStoreChannels}
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
            texthumantext
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
                    notificationenglish_text
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      hasGuardedAdapter
                        ? 'border-[#B8E8CC] bg-[#ECFDF3] text-[#15803D]'
                        : 'border-[#F8DDA7] bg-[#FFF7E6] text-[#B45309]'
                    }`}
                  >
                    {hasGuardedAdapter ? 'textwriteenglish_text' : 'textapprovaltextstore'}
                  </span>
                  <span className="rounded-full border border-[#F8DDA7] bg-[#FFF7E6] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                    textnoneenglish_text
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

function EvidenceRow({
  label,
  value,
}: {
  label: string;
  value?: string | boolean;
}) {
  if (value === undefined) {
    return null;
  }

  return (
    <div className="rounded-lg bg-[#F7F8FF] px-3 py-2">
      <div className="text-xs font-semibold text-[#6B7280]">{label}</div>
      <div className="break-all text-xs font-medium leading-5 text-[#1A1A2E]">
        {typeof value === 'boolean' ? (value ? 'passed' : 'textpassed') : value}
      </div>
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
            stage {phase.id} · {phase.priority}
          </div>
          <h4 className="mt-1 text-sm font-bold text-[#1A1A2E]">{phase.title}</h4>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
          <StatusIcon size={13} />
          {meta.label}
        </span>
      </div>

      <dl className="space-y-3 text-xs leading-5">
        <Field label="frontend/backendtext" value={phase.visibleSurface} />
        <Field label="english_text" value={phase.strictFinding} />
        <Field label="english_text" value={phase.nextAction} />
      </dl>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ListBlock title="evidence" items={phase.evidence} empty="textnonetextacceptancetext" />
        <ListBlock title="text" items={phase.blockers} empty="textnoneenglish_text" />
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
