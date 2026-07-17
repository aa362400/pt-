import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { agentHealthApi, type AgentChannelHealthSnapshot } from '../api/agentHealth';
import { dailyProductResearchApi } from '../api/dailyProductResearch';
import { pipelineApi, type PipelineItem, type PipelineResponse } from '../api/pipeline';
import { useToast } from '../components/ui/use-toast';
import {
  pipelineItemTitle,
  pipelineUrgency,
  workbenchAction,
  workbenchFailureReason,
  workbenchStage,
  workbenchStageLabelKey,
  type WorkbenchStage,
} from '../utils/pipeline-presentation';

const stages: WorkbenchStage[] = ['selection', 'approval', 'image', 'listing', 'publish'];

export default function WorkbenchV2() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [channels, setChannels] = useState<AgentChannelHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<WorkbenchStage>('selection');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [pipelineResult, channelResult] = await Promise.allSettled([
      pipelineApi.get(),
      agentHealthApi.getChannels(),
    ]);
    if (pipelineResult.status === 'fulfilled') setPipeline(pipelineResult.value);
    if (channelResult.status === 'fulfilled') setChannels(channelResult.value);
    if (!silent && pipelineResult.status === 'rejected') {
      addToast(t('workbench.loadFailed'), 'error');
    }
    setLoading(false);
  }, [addToast, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const actionable = useMemo(
    () => (pipeline?.items ?? [])
      .filter((item) => item.actionRequired)
      .sort((left, right) => pipelineUrgency(left) - pipelineUrgency(right)),
    [pipeline],
  );
  const stageItems = useMemo(
    () => (pipeline?.items ?? []).filter((item) => workbenchStage(item.stage) === selectedStage),
    [pipeline, selectedStage],
  );
  const stageCounts = useMemo(
    () => (pipeline?.items ?? []).reduce<Record<WorkbenchStage, number>>(
      (counts, item) => {
        counts[workbenchStage(item.stage)] += 1;
        return counts;
      },
      { selection: 0, approval: 0, image: 0, listing: 0, publish: 0 },
    ),
    [pipeline],
  );
  const imageChannelDown = Boolean(
    channels && (
      channels.agentConnection !== 'connected' ||
      ['quota_exhausted', 'unavailable', 'unconfigured'].includes(channels.image.status)
    ),
  );

  const runAction = async (item: PipelineItem) => {
    const action = workbenchAction(item);
    if (action.kind !== 'retry' || item.entityType !== 'RESEARCH_RUN') {
      navigate(action.href);
      return;
    }
    if (retryingId) return;
    setRetryingId(item.id);
    try {
      await dailyProductResearchApi.retryRun(item.entityId);
      addToast(t('workbench.retryCreated'), 'success');
      await load(true);
    } catch {
      addToast(t('workbench.retryFailed'), 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const renderItem = (item: PipelineItem, compact = false) => {
    const action = workbenchAction(item);
    const failure = workbenchFailureReason(item.errorCode);
    const failed = Boolean(failure || item.blockedOn?.type === 'CHANNEL_DOWN');
    return (
      <article
        key={item.id}
        className={`flex flex-col gap-3 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center ${failed ? 'border-red-100 bg-red-50/60' : 'border-slate-100 bg-white'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{pipelineItemTitle(item)}</h3>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {t(workbenchStageLabelKey(workbenchStage(item.stage)))}
            </span>
          </div>
          <p className={`mt-1 text-sm ${failed ? 'text-red-700' : 'text-slate-600'}`}>
            {failure ?? item.blockedOn?.label ?? t('workbench.inProgress')}
          </p>
          {!compact ? <p className="mt-1 text-xs text-slate-400">{new Date(item.updatedAt).toLocaleString()}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => void runAction(item)}
          disabled={retryingId !== null}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${failed ? 'bg-red-700 text-white hover:bg-red-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {retryingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {retryingId === item.id ? t('workbench.retrying') : t(action.labelKey)}
        </button>
      </article>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 py-5 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('workbench.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('workbench.description')}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('workbench.refresh')}
        </button>
      </header>

      {imageChannelDown ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <span className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{t('workbench.imageChannelDown')}</span>
          <Link to="/enterprise-readiness?section=channels" className="font-semibold underline">{t('workbench.viewDetails')}</Link>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm" aria-labelledby="workbench-actions-title">
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
          <h2 id="workbench-actions-title" className="font-bold text-amber-950">
            {t('workbench.actionableTitle', { count: pipeline?.summary.needsAttention ?? 0 })}
          </h2>
          <p className="mt-1 text-xs text-amber-800">{t('workbench.actionableDescription')}</p>
        </div>
        {loading && !pipeline ? (
          <div className="flex items-center justify-center py-14 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('workbench.loading')}</div>
        ) : actionable.length > 0 ? actionable.slice(0, 30).map((item) => renderItem(item, true)) : (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" />{t('workbench.noAction')}</div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="pipeline-title">
        <div className="mb-4">
          <h2 id="pipeline-title" className="font-bold text-slate-950">{t('workbench.pipelineTitle')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('workbench.pipelineDescription')}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-5" role="tablist" aria-label={t('workbench.pipelineTitle')}>
          {stages.map((stage, index) => (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={selectedStage === stage}
              onClick={() => setSelectedStage(stage)}
              className={`relative border px-3 py-4 text-left ${selectedStage === stage ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="block text-xs text-slate-500">{index + 1}</span>
              <span className="mt-1 block font-semibold">{t(workbenchStageLabelKey(stage))}</span>
              <span className="mt-2 block text-2xl font-bold">{stageCounts[stage]}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          {stageItems.length > 0 ? stageItems.map((item) => renderItem(item)) : (
            <p className="py-10 text-center text-sm text-slate-500">{t('workbench.stageEmpty')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
