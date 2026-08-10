import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Layers3,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import {
  capabilityCenterApi,
  type CapabilityCenterReport,
  type PlatformCapability,
} from '../api/capabilityCenter';
import type { AgentRoadmapStatus } from '../api/agentRoadmap';
import { useToast } from '../components/ui/use-toast';

const statusConfig: Record<AgentRoadmapStatus, { label: string; cls: string; dot: string }> = {
  passed: { label: 'english_text', cls: 'border-green-200 bg-green-50 text-green-700', dot: 'bg-green-500' },
  partial: { label: 'english_text', cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  backend: { label: 'textbackend', cls: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  missing: { label: 'english_text', cls: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
};

const riskLabel = {
  read_only: 'english_textautomatictext',
  local_write: 'textlocalwrite',
  human_confirmation: 'textrisktexthumantext',
  not_connected: 'realenglish_text',
};

const categories = ['all', 'text', 'product', 'text', 'store', 'Agent', 'text'] as const;

function CapabilityCard({ item, onOpen }: { item: PlatformCapability; onOpen: (path: string) => void }) {
  const status = statusConfig[item.overallState];
  return (
    <article className="flex min-h-[248px] flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-gray-900">{item.label}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-gray-500">{item.summary}</p>
        </div>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item.category}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-gray-50 px-2 py-2"><span className="block text-gray-400">frontend</span><strong className="mt-1 block text-green-700">textconnection</strong></div>
        <div className="rounded-md bg-gray-50 px-2 py-2"><span className="block text-gray-400">backend</span><strong className={`mt-1 block ${item.backendState === 'connected' ? 'text-green-700' : 'text-red-600'}`}>{item.backendState === 'connected' ? 'textconnection' : 'english_text'}</strong></div>
        <div className="rounded-md bg-gray-50 px-2 py-2"><span className="block text-gray-400">Agent</span><strong className="mt-1 block text-gray-700">{statusConfig[item.agentState].label}</strong></div>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span>{riskLabel[item.risk]}</span>
      </div>

      {item.blockers.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{item.blockers[0]}</span>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button onClick={() => onOpen(item.frontendPath)} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
          english_text <ArrowRight className="h-4 w-4" />
        </button>
        {item.operationPath && (
          <button onClick={() => onOpen(item.operationPath!)} title="english_text" aria-label={`${item.label}english_text`} className="grid h-9 w-9 place-items-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

export default function CapabilityCenter() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [report, setReport] = useState<CapabilityCenterReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof categories)[number]>('all');
  const [onlyCovered, setOnlyCovered] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await capabilityCenterApi.get());
    } catch (error) {
      setReport(null);
      addToast(error instanceof Error ? error.message : 'textstatusreadfailed', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => (report?.items ?? []).filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (onlyCovered && !item.operationPath) return false;
    return true;
  }), [category, onlyCovered, report]);

  const summaryCards = [
    { label: 'english_text', value: report?.summary.total ?? 0, icon: Boxes, color: 'text-blue-600' },
    { label: 'english_text', value: report?.summary.passed ?? 0, icon: CheckCircle2, color: 'text-green-600' },
    { label: 'english_text', value: report?.summary.partial ?? 0, icon: Layers3, color: 'text-amber-600' },
    { label: 'english_text', value: report?.summary.missing ?? 0, icon: AlertTriangle, color: 'text-red-600' },
  ];

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">english_text</h1>
          <p className="mt-1 text-gray-500">english_text UI english_text，english_textfrontend、backendtext Agent yesnorealtext</p>
        </div>
        <button onClick={() => void load()} className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />textevidence
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><div className="text-3xl font-bold text-gray-900">{card.value}</div><div className="mt-1 text-sm text-gray-500">{card.label}</div></div><card.icon className={`h-6 w-6 ${card.color}`} /></div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${category === item ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{item}</button>)}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={onlyCovered} onChange={(event) => setOnlyCovered(event.target.checked)} className="rounded border-gray-300 text-blue-600" />english_text</label>
      </div>

      {report && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <span className="inline-flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />source：backendenglish_text</span>
          <span className="inline-flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" />storetext：{report.operationSafety.connectedStoreChannels}</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />textrisktext：humantext</span>
          <span>english_text：{new Date(report.generatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        </div>
      )}

      {loading && <div className="rounded-lg border border-gray-200 bg-white py-20 text-center text-sm text-gray-500">english_text...</div>}
      {!loading && !report && <div className="rounded-lg border border-red-200 bg-red-50 py-20 text-center text-sm text-red-700">english_textreadfailed，english_textstatus。</div>}
      {!loading && report && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <CapabilityCard key={item.id} item={item} onOpen={navigate} />)}</div>}
    </div>
  );
}
