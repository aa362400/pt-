import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  FileSearch,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listingsApi, type ListingDraft } from '../api/listings';
import { reviewApi, type ProductLaunchPreview } from '../api/review';
import { useToast } from '../components/ui/use-toast';
import ListingGenerator from '../pages/ListingGenerator';
import {
  listingPlatformLabel,
  listingStatusLabel,
} from '../utils/listing-presentation';
import { launchStepsPresentation } from '../utils/launch-steps-presentation';

export default function ListingOverviewV2() {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ListingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [activeLaunch, setActiveLaunch] = useState<ProductLaunchPreview | null>(null);
  const queryLaunchOpenedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listingsApi.list({ limit: 100 });
      setItems(result.items);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '商品刊登记录读取失败', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLaunch = useCallback(async (launchId: string) => {
    try {
      const result = await reviewApi.getProductLaunch(launchId);
      setActiveLaunch(result.launch);
      setSelectedListingId(result.launch.listingDraftId ?? null);
      setEditorOpen(true);
    } catch {
      addToast(t('launchWizard.loadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => {
    const launchId = searchParams.get('launch');
    if (!launchId) {
      queryLaunchOpenedRef.current = null;
      return;
    }
    if (queryLaunchOpenedRef.current === launchId) return;
    queryLaunchOpenedRef.current = launchId;
    void loadLaunch(launchId);
  }, [loadLaunch, searchParams]);

  const openEditor = (listingId: string | null) => {
    setActiveLaunch(null);
    queryLaunchOpenedRef.current = null;
    setSelectedListingId(listingId);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setActiveLaunch(null);
    setSelectedListingId(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('launch');
      return next;
    }, { replace: true });
    void load();
  };

  if (editorOpen) {
    const launchSteps = activeLaunch ? launchStepsPresentation(activeLaunch) : [];
    const contentStep = launchSteps.find((step) => step.id === 'content');
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button type="button" onClick={closeEditor} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900">
              <ArrowLeft className="h-4 w-4" />返回刊登列表
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{selectedListingId ? '编辑刊登' : '创建 Ozon 刊登'}</h1>
            <p className="mt-1 text-gray-500">新建时使用空白 Ozon 草稿；只有主动选择历史记录后才会载入旧内容。</p>
          </div>
        </div>
        {activeLaunch ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="launch-wizard-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="launch-wizard-title" className="font-bold text-slate-950">{t('launchWizard.title')}</h2>
                <p className="mt-1 text-xs text-slate-500">{t('launchWizard.description')}</p>
              </div>
              <button type="button" onClick={() => void loadLaunch(activeLaunch.id)} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                <RefreshCw className="h-3.5 w-3.5" />{t('launchWizard.refresh')}
              </button>
            </div>
            <ol className="grid gap-3 md:grid-cols-4">
              {launchSteps.map((step, index) => {
                const Icon = step.state === 'complete' ? CheckCircle2 : step.state === 'failed' ? XCircle : Circle;
                return (
                  <li key={step.id} className={`border p-3 ${step.state === 'current' ? 'border-blue-500 bg-blue-50 text-blue-900' : step.state === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : step.state === 'failed' ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 text-slate-400'}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" /><span>{index + 1}. {t(step.labelKey)}</span></div>
                    <p className="mt-2 text-xs">{t(`launchWizard.states.${step.state}`)}</p>
                    {step.reason ? <p className="mt-2 text-xs font-medium leading-5">{step.reason}</p> : null}
                    {step.state === 'failed' ? (
                      <button type="button" onClick={() => navigate(`/review?task=${encodeURIComponent(activeLaunch.reviewTaskId ?? '')}`)} disabled={!activeLaunch.reviewTaskId} className="mt-3 w-full border border-red-300 bg-white px-2 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">
                        {t('launchWizard.retry')}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        {!activeLaunch || contentStep?.state !== 'pending' ? (
          <section aria-label={t('launchWizard.contentArea')}>
            <ListingGenerator initialListingId={selectedListingId} />
          </section>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {t('launchWizard.contentBlocked')}
          </div>
        )}
      </div>
    );
  }

  const drafts = items.filter((item) => item.status === 'draft').length;
  const completed = items.filter((item) => item.status === 'completed').length;
  const published = items.filter((item) => item.status === 'published').length;

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商品刊登与搜索优化（SEO）</h1>
          <p className="mt-1 text-gray-500">管理真实刊登草稿、标题、要点和搜索优化标签</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => void load()} className="rounded-lg border border-gray-300 p-2.5" aria-label="刷新" title="刷新商品刊登记录">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => openEditor(null)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white">
            <Plus className="h-4 w-4" />创建 Ozon 刊登
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '草稿总数', value: items.length, icon: FileSearch },
          { label: '待编辑', value: drafts, icon: Sparkles },
          { label: '待审核', value: completed, icon: Search },
          { label: '已发布记录', value: published, icon: CheckCircle2 },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <card.icon className="mb-3 h-5 w-5 text-blue-600" />
            <div className="text-3xl font-bold text-gray-900">{card.value}</div>
            <div className="mt-1 text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4"><h2 className="font-bold text-gray-900">刊登草稿</h2></div>
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">正在读取真实草稿...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">暂无真实刊登草稿，不展示示例数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr><th className="px-6 py-3">标题</th><th className="px-6 py-3">商品</th><th className="px-6 py-3">平台</th><th className="px-6 py-3">搜索优化标签</th><th className="px-6 py-3">状态</th><th className="px-6 py-3">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="text-sm">
                    <td className="max-w-sm truncate px-6 py-4 font-medium text-gray-900">{item.title || '标题未生成'}</td>
                    <td className="px-6 py-4 text-gray-600">{item.productName}</td>
                    <td className="px-6 py-4">{listingPlatformLabel(item.platform)}</td>
                    <td className="px-6 py-4 text-gray-500">{item.seoTags?.length ?? 0} 个</td>
                    <td className="px-6 py-4">{listingStatusLabel(item.status)}</td>
                    <td className="px-6 py-4"><button type="button" onClick={() => openEditor(item.id)} className="text-blue-600 hover:underline">打开编辑器</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
