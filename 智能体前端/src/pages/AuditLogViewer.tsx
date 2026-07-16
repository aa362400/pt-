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
  { key: 'agentRunId', label: 'Agent 任务', placeholder: '输入 Agent 任务 ID' },
  { key: 'automationRunId', label: '自动化运行', placeholder: '输入自动化运行 ID' },
  { key: 'externalSubmissionId', label: 'Ozon 提交', placeholder: '输入 Ozon 提交记录 ID' },
  { key: 'productLaunchId', label: '商品流程', placeholder: '输入商品发布流程 ID' },
  { key: 'traceId', label: 'Trace', placeholder: '输入链路 Trace ID' },
];

const RESOURCE_FILTERS = [
  { value: '', label: '全部业务对象' },
  { value: 'REVIEW_TASK', label: '审批任务' },
  { value: 'ProductResearch', label: '选品研究' },
  { value: 'ProfitCalculation', label: '核价记录' },
  { value: 'AgentRun', label: 'Agent 任务' },
  { value: 'AutomationRun', label: '自动化运行' },
  { value: 'ExternalSubmission', label: 'Ozon 外部提交' },
  { value: 'AgentEvalSnapshot', label: 'Agent 质量评估' },
];

const ACTION_FILTERS = [
  { value: '', label: '全部操作' },
  { value: 'REVIEW_APPROVED', label: '人工批准' },
  { value: 'REVIEW_REJECTED', label: '人工驳回' },
  { value: 'REVIEW_REWORK', label: '要求重新处理' },
  { value: 'product-research.create', label: '生成选品研究' },
  { value: 'product-research.review-created', label: '创建选品审核' },
  { value: 'product-research.evidence-review-created', label: '证据不足转人工' },
  { value: 'ozon.pricing.calculated', label: '完成 Ozon 核价' },
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
    AGENT: 'Agent 任务',
    AUTOMATION: '自动化流程',
    OZON_SUBMISSION: 'Ozon 提交',
    AUDIT: '审计记录',
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
          {hasPayload ? '仅包含已隐藏的技术或敏感字段' : '未记录业务字段'}
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
        <p className="mb-1 text-xs font-semibold text-slate-700">变更前</p>
        {renderItems(beforeItems, Boolean(before))}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-700">变更后</p>
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
      setError(err instanceof Error ? err.message : '加载审计日志失败');
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
      setIncidentError('请先输入需要核查的任务或链路编号');
      return;
    }
    setIncidentLoading(true);
    setIncidentError(null);
    setIncident(null);
    try {
      setIncident(await auditLogsApi.incidentTimeline(buildIncidentSelector(incidentMode, value)));
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : '读取事故时间线失败');
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
            <h1 className="text-xl font-bold text-slate-950">审计与事故时间线</h1>
            <p className="text-sm text-slate-500">查看业务变更、任务状态和外部平台提交证据</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw size={14} /> 刷新记录
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
              {integrity.valid ? '审计记录完整，未发现链路断点' : '审计记录校验失败，需要管理员处理'}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={13} />已校验 {integrity.chainedEntries}/{integrity.totalEntries}
              </span>
              <span>异常断点 {integrity.breaks.length}</span>
              <span>记录序列 #{integrity.lastSequence}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-6 border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">事故回放</h2>
            <p className="mt-1 text-sm text-slate-500">
              按任务编号还原 Agent、自动化与 Ozon 提交经过，帮助定位卡点和实际影响。
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
            <ShieldCheck size={13} />只读回放，不会重新执行任务或触发 Ozon 写入
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
            {incidentLoading ? '正在读取…' : '查看时间线'}
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
                  {incident.summary.needsAttention ? '该链路需要人工关注' : '该链路当前未发现异常'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  共 {incident.summary.eventCount} 个事件 ·
                  {incident.summary.hasExternalWrite ? ' 包含外部平台提交' : ' 未发现外部平台写入'}
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
              <p className="py-8 text-center text-sm text-slate-500">没有找到与该编号相关的业务事件</p>
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
                      {incidentSourceLabel(event.source)} · 状态 {auditStatusLabel(event.status)}
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
          <span className="text-xs font-medium text-slate-500">业务对象</span>
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
          <span className="text-xs font-medium text-slate-500">操作类型</span>
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
            <span className="text-sm">加载审计记录…</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={fetchData} className="mt-3 text-sm text-blue-600 underline">
              重试
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">暂无审计记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">时间</th>
                  <th className="px-5 py-3 font-medium">操作</th>
                  <th className="px-5 py-3 font-medium">业务对象</th>
                  <th className="px-5 py-3 font-medium">对象编号</th>
                  <th className="px-5 py-3 font-medium">操作人</th>
                  <th className="px-5 py-3 text-right font-medium">业务变更</th>
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
                        {log.actorId ? `${log.actorId.slice(0, 8)}…` : '系统'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {log.before || log.after ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {expandedId === log.id ? '收起' : '查看变更'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">无字段变更</span>
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
            <span className="text-xs text-slate-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
