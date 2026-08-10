import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { auditLogsApi } from '../api/audit-logs';
import type {
  AuditIntegrityReport,
  AuditLog,
  IncidentTimeline,
  IncidentTimelineEvent,
  IncidentTimelineSelector,
} from '../api/audit-logs';
import {
  auditActionLabel,
  auditResourceLabel,
  auditStatusLabel,
  summarizeAuditPayload,
} from '../utils/audit-presentation';

type IncidentSelectorKey =
  | 'agentRunId'
  | 'automationRunId'
  | 'externalSubmissionId'
  | 'productLaunchId'
  | 'traceId';

const INCIDENT_MODES: Array<{ key: IncidentSelectorKey; label: string; placeholder: string }> = [
  { key: 'agentRunId', label: 'Agent task', placeholder: 'input Agent task ID' },
  { key: 'automationRunId', label: 'automaticenglish_text', placeholder: 'inputautomaticenglish_text ID' },
  { key: 'externalSubmissionId', label: 'Ozon text', placeholder: 'input Ozon english_text ID' },
  { key: 'productLaunchId', label: 'productflow', placeholder: 'inputproductpublishflow ID' },
  { key: 'traceId', label: 'Trace', placeholder: 'inputtext Trace ID' },
];

const RESOURCE_FILTERS = [
  { value: '', label: 'allenglish_text' },
  { value: 'REVIEW_TASK', label: 'approvaltask' },
  { value: 'ProductResearch', label: 'product researchtext' },
  { value: 'ProfitCalculation', label: 'pricingtext' },
  { value: 'AgentRun', label: 'Agent task' },
  { value: 'AutomationRun', label: 'automaticenglish_text' },
  { value: 'ExternalSubmission', label: 'Ozon english_text' },
  { value: 'AgentEvalSnapshot', label: 'Agent english_text' },
];

const ACTION_FILTERS = [
  { value: '', label: 'alltext' },
  { value: 'REVIEW_APPROVED', label: 'humantext' },
  { value: 'REVIEW_REJECTED', label: 'humantext' },
  { value: 'REVIEW_REWORK', label: 'english_text' },
  { value: 'product-research.create', label: 'generationproduct researchtext' },
  { value: 'product-research.review-created', label: 'textproduct researchreview' },
  { value: 'product-research.evidence-review-created', label: 'evidenceenglish_texthuman' },
  { value: 'ozon.pricing.calculated', label: 'completed Ozon pricing' },
];

function buildIncidentSelector(key: IncidentSelectorKey, value: string): IncidentTimelineSelector {
  switch (key) {
    case 'agentRunId':
      return { agentRunId: value };
    case 'automationRunId':
      return { automationRunId: value };
    case 'externalSubmissionId':
      return { externalSubmissionId: value };
    case 'productLaunchId':
      return { productLaunchId: value };
    case 'traceId':
      return { traceId: value };
  }
}

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('REJECT') || action.includes('FAIL')) {
    return 'bg-red-50 text-red-600';
  }
  if (action.includes('CREATE') || action.includes('APPROVE') || action.includes('COMPLETE')) {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (action.includes('UPDATE') || action.includes('REWORK') || action.includes('RETRY')) {
    return 'bg-amber-50 text-amber-700';
  }
  return 'bg-blue-50 text-blue-700';
}

function incidentSourceLabel(source: IncidentTimelineEvent['source']): string {
  return {
    AGENT: 'Agent task',
    AUTOMATION: 'automatictextflow',
    OZON_SUBMISSION: 'Ozon text',
    AUDIT: 'audit record',
  }[source];
}

function incidentTone(severity: IncidentTimelineEvent['severity']): string {
  return {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
  }[severity];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function AuditChangeDetails({ before, after }: Pick<AuditLog, 'before' | 'after'>) {
  const beforeItems = summarizeAuditPayload(before);
  const afterItems = summarizeAuditPayload(after);

  const renderItems = (items: ReturnType<typeof summarizeAuditPayload>, hasPayload: boolean) => {
    if (items.length === 0) {
      return (
        <p className="py-3 text-xs text-slate-500">
          {hasPayload ? 'english_textfields' : 'english_textfields'}
        </p>
      );
    }
    return (
      <dl className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={`${item.label}-${item.value}`} className="grid grid-cols-[120px_1fr] gap-3 py-2">
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className="break-words text-xs font-medium text-slate-800">{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-700">english_text</p>
        {renderItems(beforeItems, Boolean(before))}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-700">english_text</p>
        {renderItems(afterItems, Boolean(after))}
      </div>
    </div>
  );
}

export default function AuditLogViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<AuditIntegrityReport | null>(null);
  const [incidentMode, setIncidentMode] = useState<IncidentSelectorKey>('agentRunId');
  const [incidentId, setIncidentId] = useState('');
  const [incident, setIncident] = useState<IncidentTimeline | null>(null);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const limit = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, integrityReport] = await Promise.all([
        auditLogsApi.list({
          page,
          limit,
          ...(resourceType ? { resourceType } : {}),
          ...(action ? { action } : {}),
        }),
        auditLogsApi.verifyIntegrity(),
      ]);
      setLogs(res.items);
      setTotal(res.total);
      setIntegrity(integrityReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'english_textfailed');
    } finally {
      setLoading(false);
    }
  }, [page, resourceType, action]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchIncident = async () => {
    const value = incidentId.trim();
    if (!value) {
      setIncidentError('textinputenglish_texttaskenglish_text');
      return;
    }
    setIncidentLoading(true);
    setIncidentError(null);
    setIncident(null);
    try {
      setIncident(await auditLogsApi.incidentTimeline(buildIncidentSelector(incidentMode, value)));
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : 'readenglish_textfailed');
    } finally {
      setIncidentLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const activeIncidentMode = INCIDENT_MODES.find((mode) => mode.key === incidentMode)!;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <ScrollText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">english_text</h1>
            <p className="text-sm text-slate-500">english_text、taskstatusenglish_textplatformtextevidence</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw size={14} /> english_text
        </button>
      </div>

      {integrity ? (
        <section
          className={`mb-5 border px-4 py-3 ${
            integrity.valid
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold">
              {integrity.valid ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
              {integrity.valid ? 'audit recordtext，english_text' : 'audit recordtextfailed，english_text'}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={13} />english_text {integrity.chainedEntries}/{integrity.totalEntries}
              </span>
              <span>english_text {integrity.breaks.length}</span>
              <span>english_text #{integrity.lastSequence}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-6 border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">english_text</h2>
            <p className="mt-1 text-sm text-slate-500">
              texttaskenglish_text Agent、automatictext Ozon english_text，english_text。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
            <ShieldCheck size={13} />english_text，english_texttaskenglish_text Ozon write
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200 pb-3">
          {INCIDENT_MODES.map((mode) => (
            <button
              type="button"
              key={mode.key}
              onClick={() => {
                setIncidentMode(mode.key);
                setIncident(null);
                setIncidentError(null);
              }}
              className={`px-3 py-1.5 text-sm font-medium ${
                incidentMode === mode.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-blue-500">
            <Search size={15} className="shrink-0 text-slate-400" />
            <span className="sr-only">{activeIncidentMode.placeholder}</span>
            <input
              value={incidentId}
              onChange={(event) => setIncidentId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void fetchIncident();
              }}
              placeholder={activeIncidentMode.placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void fetchIncident()}
            disabled={incidentLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {incidentLoading ? 'textread…' : 'english_text'}
          </button>
        </div>

        {incidentError ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle size={15} />{incidentError}
          </p>
        ) : null}

        {incident ? (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <div
              className={`mb-4 flex flex-col gap-3 border px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${
                incident.summary.needsAttention
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
                  {incident.summary.needsAttention ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  {incident.summary.needsAttention ? 'english_texthumantext' : 'english_text'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  text {incident.summary.eventCount} english_text ·
                  {incident.summary.hasExternalWrite ? ' english_textplatformtext' : ' english_textplatformwrite'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {incident.summary.sources.map((source) => (
                  <span key={source} className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                    {incidentSourceLabel(source)}
                  </span>
                ))}
              </div>
            </div>

            {incident.events.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">textyesenglish_text</p>
            ) : (
              <ol className="space-y-3">
                {incident.events.map((event) => (
                  <li key={event.id} className={`border-l-4 px-4 py-3 ${incidentTone(event.severity)}`}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-bold">{event.title}</p>
                      <time className="flex items-center gap-1 text-xs opacity-75">
                        <Clock3 size={12} />{formatDate(event.occurredAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm leading-6">{event.detail}</p>
                    <p className="mt-2 text-xs opacity-70">
                      {incidentSourceLabel(event.source)} · status {auditStatusLabel(event.status)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </section>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <span className="text-xs font-medium text-slate-500">english_text</span>
          <select
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPage(1);
            }}
            className="w-40 bg-transparent text-sm text-slate-900 focus:outline-none"
          >
            {RESOURCE_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <span className="text-xs font-medium text-slate-500">english_text</span>
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            className="w-40 bg-transparent text-sm text-slate-900 focus:outline-none"
          >
            {ACTION_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-blue-600">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm">textaudit record…</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={fetchData} className="mt-3 text-sm text-blue-600 underline">
              text
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">textnoneaudit record</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">text</th>
                  <th className="px-5 py-3 font-medium">text</th>
                  <th className="px-5 py-3 font-medium">english_text</th>
                  <th className="px-5 py-3 font-medium">english_text</th>
                  <th className="px-5 py-3 font-medium">english_text</th>
                  <th className="px-5 py-3 text-right font-medium">english_text</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeClass(log.action)}`}>
                          {auditActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {auditResourceLabel(log.resourceType)}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">
                        {log.resourceId ? `${log.resourceId.slice(0, 8)}…` : '-'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">
                        {log.actorId ? `${log.actorId.slice(0, 8)}…` : 'text'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {log.before || log.after ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {expandedId === log.id ? 'text' : 'english_text'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">nonefieldstext</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id ? (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={6} className="px-5 py-4">
                          <AuditChangeDetails before={log.before} after={log.after} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && total > limit ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <span className="text-xs text-slate-500">text {total} text · text {page}/{totalPages} text</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-40"
              >
                english_text
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-40"
              >
                english_text
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
