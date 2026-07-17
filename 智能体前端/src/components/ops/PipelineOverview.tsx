import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type DashboardPipeline } from '../../api/dashboard';
import {
  pipelineItemTitle,
  pipelineStageLabel,
  pipelineStatusSummary,
  type PipelineStage,
} from '../../utils/pipeline-presentation';

const STAGES: PipelineStage[] = [
  'RESEARCH',
  'EVIDENCE_REVIEW',
  'APPROVAL',
  'CONTENT_GENERATION',
  'PUBLISH_SNAPSHOT',
  'PUBLISHING',
  'MONITORING',
];

function itemRoute(item: DashboardPipeline['items'][number]): string {
  if (item.blockedOn?.link) return item.blockedOn.link;
  if (item.entityType === 'RESEARCH_RUN') {
    return `/daily-product-research?run=${encodeURIComponent(item.entityId)}`;
  }
  if (item.entityType === 'REVIEW_TASK') {
    return `/review?task=${encodeURIComponent(item.id)}`;
  }
  return '/review';
}

export default function PipelineOverview() {
  const navigate = useNavigate();
  const [pipeline, setPipeline] = useState<DashboardPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPipeline(await dashboardApi.getPipeline());
    } catch {
      setError('选品到上架流水线暂时无法读取，请刷新后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="选品到上架流水线">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">选品到上架流水线</h2>
          <p className="mt-1 text-xs text-slate-500">聚合真实选品批次、审批任务、发布快照、Ozon 上架与结果监控状态</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}刷新流水线
        </button>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={15}/>{error}</div>
      ) : pipeline ? (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-800">{pipelineStatusSummary(pipeline.summary)}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {STAGES.map((stage, index) => (
              <div key={stage} className="relative rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="text-[10px] text-slate-400">第 {index + 1} 步</span>
                <strong className="mt-1 block text-xs text-slate-800">{pipelineStageLabel(stage)}</strong>
                <span className="mt-2 block text-lg font-bold text-blue-600">{pipeline.summary.byStage[stage] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {pipeline.items.filter((item) => item.actionRequired).slice(0, 6).map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(itemRoute(item))} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left hover:border-amber-300">
                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{pipelineItemTitle(item)}</strong><span className="mt-1 block truncate text-[11px] text-slate-600">{pipelineStageLabel(item.stage)} · {item.blockedOn?.label || '需要人工处理'}</span></span>
                <ArrowRight size={15} className="shrink-0 text-slate-400" />
              </button>
            ))}
            {pipeline.summary.needsAttention === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 size={16}/>当前没有等待人工处理的流水线事项。</div>
            ) : null}
          </div>
        </>
      ) : loading ? <div className="mt-4 h-28 animate-pulse rounded-lg bg-slate-100" /> : null}
    </section>
  );
}
