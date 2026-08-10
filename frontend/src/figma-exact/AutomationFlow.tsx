import { useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Eye,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';

export interface AutomationFlowItem {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'error';
  trigger: string;
  platform: string;
  executionCount: number | string;
  successRate: string;
  lastRun: string;
  steps: Array<{
    name: string;
    type: 'trigger' | 'action' | 'condition' | 'approval' | 'waiting';
    status: string;
  }>;
  createdBy: string;
  createdAt: string;
}

export interface AutomationFlowStat {
  label: string;
  value: string;
  icon: typeof Workflow;
  color: string;
}

export interface AutomationTemplate {
  id: 'daily-research' | 'research-to-draft' | 'image-review';
  name: string;
  description: string;
  safety: string;
}

interface AutomationFlowProps {
  automationFlows: AutomationFlowItem[];
  stats: AutomationFlowStat[];
  templates?: AutomationTemplate[];
  loading?: boolean;
  busyAction?: string | null;
  onCreate?: () => void;
  onCreateTemplate?: (template: AutomationTemplate) => void;
  onRefresh?: () => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onCopy?: (id: string) => void;
  onRun?: (id: string) => void;
  onToggle?: (id: string, active: boolean) => void;
  onDelete?: (id: string) => void;
}

const statusConfig = {
  draft: {
    label: 'Draft',
    color: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  active: {
    label: 'Running',
    color: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  paused: {
    label: 'Paused',
    color: 'border-gray-200 bg-gray-50 text-gray-700',
  },
  error: {
    label: 'Failed',
    color: 'border-red-200 bg-red-50 text-red-700',
  },
};

const stepTypeConfig = {
  trigger: 'bg-blue-50 text-blue-700',
  action: 'bg-indigo-50 text-indigo-700',
  condition: 'bg-amber-50 text-amber-700',
  approval: 'bg-yellow-50 text-yellow-700',
  waiting: 'bg-gray-100 text-gray-700',
};

const triggerLabels: Record<string, string> = {
  MANUAL: 'Manual run',
  SCHEDULE: 'Scheduled',
  WEBHOOK: 'External notification trigger',
  CONDITION: 'Condition trigger',
  EVENT: 'Business event trigger',
};

export function AutomationFlow({
  automationFlows,
  stats,
  templates = [],
  loading = false,
  busyAction,
  onCreate,
  onCreateTemplate,
  onRefresh,
  onView,
  onEdit,
  onCopy,
  onRun,
  onToggle,
  onDelete,
}: AutomationFlowProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'paused' | 'error'>('all');

  const filteredFlows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return automationFlows.filter((flow) => {
      if (statusFilter !== 'all' && flow.status !== statusFilter) return false;
      if (!keyword) return true;
      return `${flow.name} ${flow.description}`.toLocaleLowerCase().includes(keyword);
    });
  }, [automationFlows, search, statusFilter]);

  const isBusy = (action: string, id?: string) =>
    busyAction === `${action}:${id ?? 'page'}`;

  return (
    <div className="p-0">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Flow</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, run and track real workflows. External writes still require human confirmation.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!onCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create new flow
        </button>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Flow metrics">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-md bg-gray-50 ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mb-6 border border-blue-200 bg-blue-50 p-5" aria-labelledby="recommended-flows-title">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-blue-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 id="recommended-flows-title" className="text-sm font-bold text-gray-900">Recommended flows safe to create</h2>
            <p className="mt-0.5 text-xs text-gray-600">只展示当前 Worker 已支持的能力，创建后先保存为本地Draft。</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-md border border-blue-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
                <span className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {template.safety}
                </span>
              </div>
              <p className="mt-2 min-h-10 text-xs leading-5 text-gray-600">{template.description}</p>
              <button
                type="button"
                onClick={() => onCreateTemplate?.(template)}
                disabled={!onCreateTemplate || isBusy('template', template.id)}
                className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy('template', template.id) ? 'Loading...' : 'Configure template ->'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-gray-200 bg-white shadow-sm" aria-label="Automation Flow列表">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <label className="relative max-w-md flex-1">
              <span className="sr-only">Search flows</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search flows名称或描述"
                className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={!onRefresh || loading}
              title="Refresh real flow data"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="按状态Filter">
            {([
              ['all', 'All'],
              ['draft', 'Draft'],
              ['active', 'Running'],
              ['paused', 'Paused'],
              ['error', 'Failed'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
                className={`h-9 rounded-md px-3 text-sm font-medium ${
                  statusFilter === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {loading ? (
            <div className="py-14 text-center text-sm text-gray-500">Reading real flows...</div>
          ) : filteredFlows.length === 0 ? (
            <div className="py-14 text-center">
              <Workflow className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">
                {automationFlows.length ? '没有符合Filter条件的流程' : '还没有Automation Flow'}
              </p>
              <button type="button" onClick={onCreate} className="mt-3 text-sm font-semibold text-blue-600">
                Create the first flow
              </button>
            </div>
          ) : (
            filteredFlows.map((flow) => {
              const status = statusConfig[flow.status];
              return (
                <article key={flow.id} className="rounded-md border border-gray-200 p-5 hover:border-blue-200 hover:shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">{flow.name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status.color}`}>
                          {status.label}
                        </span>
                        {flow.createdBy === 'AI Agent' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            <Bot className="h-3 w-3" /> AI 创建
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-5 text-gray-600">{flow.description || '未填写流程说明'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => onView?.(flow.id)} disabled={!onView || isBusy('view', flow.id)} title="View details和运行记录" aria-label={`查看 ${flow.name}`} className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-40">
                        <Eye className="h-4 w-4 text-gray-600" />
                      </button>
                      <button type="button" onClick={() => onEdit?.(flow.id)} disabled={!onEdit || isBusy('edit', flow.id)} title="编辑流程" aria-label={`编辑 ${flow.name}`} className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-40">
                        <Edit className="h-4 w-4 text-gray-600" />
                      </button>
                      <button type="button" onClick={() => onCopy?.(flow.id)} disabled={!onCopy || isBusy('copy', flow.id)} title="复制为新Draft" aria-label={`复制 ${flow.name}`} className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-40">
                        <Copy className="h-4 w-4 text-gray-600" />
                      </button>
                      <button type="button" onClick={() => onRun?.(flow.id)} disabled={!onRun || isBusy('run', flow.id)} title={flow.status === 'error' ? '恢复并重试' : '立即运行一次'} aria-label={`${flow.status === 'error' ? '恢复并重试' : '立即运行'} ${flow.name}`} className="rounded-md p-2 hover:bg-emerald-50 disabled:opacity-40">
                        {flow.status === 'error' ? <RotateCcw className="h-4 w-4 text-amber-600" /> : <Zap className="h-4 w-4 text-emerald-600" />}
                      </button>
                      {flow.status !== 'error' ? (
                        <button type="button" onClick={() => onToggle?.(flow.id, flow.status !== 'active')} disabled={!onToggle || isBusy('toggle', flow.id)} title={flow.status === 'active' ? '暂停自动调度' : '启用自动调度'} aria-label={`${flow.status === 'active' ? '暂停' : '启用'} ${flow.name}`} className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-40">
                          {flow.status === 'active' ? <Pause className="h-4 w-4 text-orange-600" /> : <Play className="h-4 w-4 text-green-600" />}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => onDelete?.(flow.id)} disabled={!onDelete || isBusy('delete', flow.id)} title="删除流程" aria-label={`删除 ${flow.name}`} className="rounded-md p-2 hover:bg-red-50 disabled:opacity-40">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {flow.steps.length ? (
                    <div className="mt-4 flex items-center gap-2 overflow-x-auto border-t border-gray-100 pt-4">
                      {flow.steps.map((step, index) => (
                        <div key={`${flow.id}-${index}`} className="flex shrink-0 items-center gap-2">
                          {index ? <span className="text-gray-300">→</span> : null}
                          <span className={`rounded-md px-3 py-2 text-xs font-medium ${stepTypeConfig[step.type]}`}>
                            {step.name}
                          </span>
                          {step.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                          {step.status === 'pending' || step.status === 'waiting' ? <Clock className="h-4 w-4 text-gray-400" /> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <dl className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 xl:grid-cols-5">
                    <div><dt className="text-xs text-gray-500">触发方式</dt><dd className="mt-1 text-sm font-medium text-gray-900">{triggerLabels[flow.trigger] ?? flow.trigger}</dd></div>
                    <div><dt className="text-xs text-gray-500">数据来源</dt><dd className="mt-1 text-sm font-medium text-gray-900">{flow.platform}</dd></div>
                    <div><dt className="text-xs text-gray-500">执行次数</dt><dd className="mt-1 text-sm font-medium text-gray-900">{flow.executionCount}</dd></div>
                    <div><dt className="text-xs text-gray-500">成功率</dt><dd className="mt-1 text-sm font-medium text-emerald-700">{flow.successRate}</dd></div>
                    <div><dt className="text-xs text-gray-500">最近执行</dt><dd className="mt-1 text-sm font-medium text-gray-900">{flow.lastRun}</dd></div>
                  </dl>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-6 border border-gray-200 bg-white p-6 text-center">
        <Workflow className="mx-auto h-8 w-8 text-blue-600" />
        <h2 className="mt-3 text-lg font-bold text-gray-900">创建自定义流程</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          选择后端已支持的执行步骤，保存后可查看运行记录。Product publishing、改价、库存和Refund不会绕过人工确认。
        </p>
        <button type="button" onClick={onCreate} disabled={!onCreate} className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> 创建自定义流程
        </button>
      </section>
    </div>
  );
}
