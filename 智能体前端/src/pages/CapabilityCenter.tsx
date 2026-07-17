import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  capabilityCenterApi,
  type CapabilityCenterReport,
  type PlatformCapability,
} from '../api/capabilityCenter';
import type { AgentRoadmapStatus } from '../api/agentRoadmap';
import { useToast } from '../components/ui/use-toast';
import {
  capabilityActionForBlocker,
  capabilityStatusKey,
  type CapabilityAction,
} from '../utils/capability-actions';

const statusConfig: Record<AgentRoadmapStatus, { cls: string; dot: string }> = {
  passed: { cls: 'border-green-200 bg-green-50 text-green-700', dot: 'bg-green-500' },
  partial: { cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  backend: { cls: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
  missing: { cls: 'border-gray-300 bg-gray-100 text-gray-700', dot: 'bg-gray-500' },
};

const riskLabel = {
  read_only: '只读可自动执行',
  local_write: '仅本地写入',
  human_confirmation: '高风险需人工确认',
  not_connected: '真实通道未接入',
};

const categories = ['全部', '运营', '商品', '内容', '店铺', 'Agent', '治理'] as const;

function categoryLabel(value: string) {
  return value === 'Agent' ? '智能体' : value;
}

function CapabilityCard({
  item,
  onOpen,
  onAction,
}: {
  item: PlatformCapability;
  onOpen: (path: string) => void;
  onAction: (action: CapabilityAction) => void;
}) {
  const { t } = useTranslation();
  const status = statusConfig[item.overallState];
  return (
    <article className="flex min-h-[248px] flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-gray-900">{item.label}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {t(capabilityStatusKey(item.overallState))}
            </span>
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-gray-500">{item.summary}</p>
        </div>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{categoryLabel(item.category)}</span>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span>{riskLabel[item.risk]}</span>
      </div>

      {item.blockers.length > 0 ? (
        <div className="mt-3 space-y-2">
          {item.blockers.map((blocker, index) => {
            const action = capabilityActionForBlocker(blocker);
            return (
              <div
                key={`${item.id}-${index}`}
                className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{t(action.messageKey)}</span>
                <button
                  type="button"
                  onClick={() => onAction(action)}
                  className="shrink-0 rounded border border-red-200 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  {t(action.actionLabelKey)}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button onClick={() => onOpen(item.frontendPath)} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
          打开功能 <ArrowRight className="h-4 w-4" />
        </button>
        {item.operationPath && (
          <button onClick={() => onOpen(item.operationPath!)} title="打开完整操作页" aria-label={`${item.label}完整操作页`} className="grid h-9 w-9 place-items-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

export default function CapabilityCenter() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [report, setReport] = useState<CapabilityCenterReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [onlyCovered, setOnlyCovered] = useState(false);
  const [guidance, setGuidance] = useState<Extract<CapabilityAction, { kind: 'DIALOG' }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await capabilityCenterApi.get());
    } catch (error) {
      setReport(null);
      addToast(error instanceof Error ? error.message : '功能状态读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => (report?.items ?? []).filter((item) => {
    if (category !== '全部' && item.category !== category) return false;
    if (onlyCovered && !item.operationPath) return false;
    return true;
  }), [category, onlyCovered, report]);

  const summaryCards = [
    { label: t('capabilityCenter.summary.total'), value: report?.summary.total ?? 0, icon: Boxes, color: 'text-blue-600' },
    { label: t('capabilityCenter.status.available'), value: report?.summary.passed ?? 0, icon: CheckCircle2, color: 'text-green-600' },
    { label: t('capabilityCenter.status.needsConfiguration'), value: report?.summary.partial ?? 0, icon: AlertTriangle, color: 'text-amber-600' },
    { label: t('capabilityCenter.status.dependencyFailure'), value: report?.summary.backendOnly ?? 0, icon: AlertTriangle, color: 'text-red-600' },
    { label: t('capabilityCenter.status.notConnected'), value: report?.summary.missing ?? 0, icon: AlertTriangle, color: 'text-gray-600' },
  ];

  const handleAction = (action: CapabilityAction) => {
    if (action.kind === 'NAVIGATE') navigate(action.path);
    else setGuidance(action);
  };

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">功能操作中心</h1>
          <p className="mt-1 text-gray-500">{t('capabilityCenter.description')}</p>
        </div>
        <button onClick={() => void load()} className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新证据
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><div className="text-3xl font-bold text-gray-900">{card.value}</div><div className="mt-1 text-sm text-gray-500">{card.label}</div></div><card.icon className={`h-6 w-6 ${card.color}`} /></div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${category === item ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{categoryLabel(item)}</button>)}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={onlyCovered} onChange={(event) => setOnlyCovered(event.target.checked)} className="rounded border-gray-300 text-blue-600" />仅显示新版覆盖的完整操作</label>
      </div>

      {report && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <span className="inline-flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />来源：后端实时注册表</span>
          <span className="inline-flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" />店铺通道：{report.operationSafety.connectedStoreChannels}</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />高风险动作：人工确认</span>
          <span>更新时间：{new Date(report.generatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        </div>
      )}

      {loading && <div className="rounded-lg border border-gray-200 bg-white py-20 text-center text-sm text-gray-500">{t('capabilityCenter.loading')}</div>}
      {!loading && !report && <div className="rounded-lg border border-red-200 bg-red-50 py-20 text-center text-sm text-red-700">能力注册表读取失败，不能显示假状态。</div>}
      {!loading && report && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <CapabilityCard key={item.id} item={item} onOpen={navigate} onAction={handleAction} />)}</div>}

      {guidance ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={() => setGuidance(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="capability-guidance-title"
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="capability-guidance-title" className="text-lg font-bold text-gray-900">
                  {t(guidance.dialogTitleKey)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{t(guidance.dialogBodyKey)}</p>
              </div>
              <button type="button" aria-label={t('common.close')} onClick={() => setGuidance(null)} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
