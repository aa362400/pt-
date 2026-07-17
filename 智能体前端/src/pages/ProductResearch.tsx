import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MergedFeatureNotice } from '../components/navigation/MergedFeatureNotice';
import {
  ArrowUp,
  ChevronDown,
  ExternalLink,
  FileVideo,
  Film,
  Lightbulb,
  Loader2,
  Music,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  ShieldCheck,
  X,
} from 'lucide-react';
import { productResearchApi } from '../api/productResearch';
import type { ResearchDetail } from '../api/productResearch';
import { Dropdown, DropdownItem } from '../components/ui/Dropdown.tsx';
import Modal from '../components/ui/Modal.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import StoreAgentProfileModal from '../components/ui/StoreAgentProfileModal.tsx';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

type ProductOpportunity = ResearchDetail['opportunities'][number];

interface VideoMeta {
  name: string;
  size: string;
  type: string;
  url: string;
}

const platforms = [
  { id: 'ozon', label: 'Ozon', icon: Store, enabled: true },
  { id: 'amazon', label: 'Amazon', icon: ShoppingBag, enabled: false },
  { id: 'etsy', label: 'Etsy', icon: Store, enabled: false },
  { id: 'temu', label: 'Temu', icon: Package, enabled: false },
  { id: 'tiktok', label: 'TikTok Shop', icon: Music, enabled: false },
];

const proofSteps = [
  { label: '文字指令提交', detail: 'POST /product-research 调用真实选品智能体' },
  { label: '报告保存', detail: '后端保存 summary、competitors、priceRange、rating' },
  { label: '前端回读', detail: 'GET /product-research/:id 展示真实字段' },
  { label: '未接入字段', detail: '视频识别、趋势曲线、痛点比例暂无后端合同' },
];

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] px-4 py-5 text-center text-xs leading-relaxed text-[#8B93B5]">
      {children}
    </div>
  );
}

function formatEvidenceTime(value: string | null): string {
  if (!value) return '时间未返回';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function ProductResearch() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [activePlatform, setActivePlatform] = useState('ozon');
  const [inputValue, setInputValue] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(t('productResearch.catAll'));
  const [selectedTimeRange, setSelectedTimeRange] = useState(t('productResearch.timeLast30Days'));
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [researchData, setResearchData] = useState<ResearchDetail | null>(null);
  const [opportunities, setOpportunities] = useState<ProductOpportunity[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductOpportunity | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const catOptions = [
    t('productResearch.catAll'),
    t('productResearch.catHomeDecor'),
    t('productResearch.catSmartHome'),
    t('productResearch.catPetSupplies'),
    t('productResearch.catOutdoorSports'),
    t('productResearch.catBeautyPersonal'),
  ];

  const timeOptions = [
    t('productResearch.timeLast30Days'),
    t('productResearch.timeLast7Days'),
    t('productResearch.timeLast90Days'),
    t('productResearch.timeLast180Days'),
    t('productResearch.timeYearToDate'),
  ];

  useEffect(() => {
    return () => {
      if (videoMeta?.url) URL.revokeObjectURL(videoMeta.url);
    };
  }, [videoMeta?.url]);

  const fetchLatestResearch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const listRes = await productResearchApi.list({ limit: 1 });
      const latest = listRes.items?.[0];
      if (!latest) {
        setResearchData(null);
        setOpportunities([]);
        return;
      }

      const detail = await productResearchApi.getById(latest.id);
      setResearchData(detail);
      setOpportunities(detail.opportunities);
    } catch (err) {
      if (!silent) {
        setResearchData(null);
        setOpportunities([]);
        const message = err instanceof Error ? err.message : t('productResearch.fetchFailedRetry');
        setResearchError(message);
        addToast(message, 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void fetchLatestResearch();
  }, [fetchLatestResearch]);

  const refreshResearchSilently = useCallback(
    () => fetchLatestResearch(true),
    [fetchLatestResearch],
  );
  useAutoRefresh(refreshResearchSilently, 12000, !isResearching && !researchError);

  const handleStartResearch = async () => {
    if (isResearching) return;
    const query = inputValue.trim();
    if (!query) {
      addToast('请输入选品研究指令，不能空跑智能体。', 'error');
      return;
    }

    setIsResearching(true);
    setResearchError(null);
    try {
      if (videoMeta) {
        addToast('视频仅在前端预览；后端 /product-research 当前没有视频字段，本次只提交文字指令。', 'warning');
      }

      const created = await productResearchApi.create({
        query,
        platform: activePlatform,
        category: selectedCategory,
        timeRange: selectedTimeRange,
      });
      const detail = await productResearchApi.getById(created.id);
      setResearchData(detail);
      setOpportunities(detail.opportunities);
      addToast(t('productResearch.insightGenerated'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('productResearch.fetchFailedRetry');
      setResearchData(null);
      setOpportunities([]);
      setResearchError(message);
      addToast(message, 'error');
    } finally {
      setIsResearching(false);
    }
  };

  const handleVideoSelect = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      addToast('请上传视频文件。当前后端未接收视频，只做本地预览。', 'error');
      return;
    }

    if (videoMeta?.url) URL.revokeObjectURL(videoMeta.url);
    setVideoMeta({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      type: file.type.replace('video/', '').toUpperCase(),
      url: URL.createObjectURL(file),
    });
    addToast('视频已加入本地预览，但未上传到智能体后端。', 'warning');
  };

  const removeVideo = () => {
    if (videoMeta?.url) URL.revokeObjectURL(videoMeta.url);
    setVideoMeta(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const ratingText = researchData?.rating == null ? '后端未返回' : `${researchData.rating}`;
  const priceRangeText = opportunities[0]?.priceRange ?? '后端未返回';
  const competitorCount = opportunities.length;
  const sourceEvidence = researchData?.sourceEvidence ?? null;
  const runtime = researchData?.runtime ?? null;

  return (
    <div className="min-h-screen bg-[#F7F8FC] p-5 lg:p-6">
      <MergedFeatureNotice
        destination="/daily-product-research"
        destinationLabel={t('journeyNavigation.destinations.productSelection')}
      />
      <section className="mb-6 rounded-lg border border-[#E6E8F2] bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 lg:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#F0EEFF] px-3 py-1 text-xs font-semibold text-[#6C63FF]">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 选品研究 Copilot
                </div>
                <h1 className="text-2xl font-bold text-[#111827]">真实选品研究</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7280]">
                  当前页面只提交文字指令到真实 /product-research；视频、图片、趋势曲线和痛点结构化分析没有后端合同，不展示模拟结果。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  [ratingText, '后端 rating'],
                  [competitorCount, '竞品样本'],
                  [priceRangeText, '价格区间'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-md border border-[#E8E8F0] bg-[#FAFBFF] px-3 py-2">
                    <div className="truncate text-base font-bold text-[#1A1A2E]">{value}</div>
                    <div className="text-[11px] text-[#8B93B5]">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor="research-command">研究指令</label>
              <input
                id="research-command"
                type="text"
                data-testid="input-research-copilot"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="例如：分析夏季便携风扇在 Amazon US 的选品机会"
                className="min-h-12 rounded-lg border border-[#DDE1EE] bg-white px-4 text-sm text-[#1A1A2E] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
              <button
                data-testid="btn-start-research-copilot"
                onClick={handleStartResearch}
                disabled={isResearching}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#6C63FF] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#5A52D5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                {isResearching ? '分析中' : '开始研究'}
              </button>
            </div>

            {researchError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                <span className="font-semibold">本次真实选品未生成：</span>
                {researchError}
              </div>
            )}

            <div className="mb-5 flex flex-wrap gap-2">
              {[
                ['智能推荐', Sparkles, t('productResearch.quickFillRecommend')],
                ['类目探索', Search, t('productResearch.quickFillCategory')],
                ['场景灵感', Lightbulb, t('productResearch.quickFillScenario')],
              ].map(([label, Icon, text]) => {
                const ActionIcon = Icon as typeof Sparkles;
                return (
                  <button
                    key={label as string}
                    onClick={() => setInputValue(text as string)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E5F0] bg-white px-3 py-2 text-xs font-medium text-[#4A5578] transition-colors hover:border-[#6C63FF] hover:bg-[#F0EEFF] hover:text-[#6C63FF]"
                  >
                    <ActionIcon className="h-3.5 w-3.5" />
                    {label as string}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {proofSteps.map((step, index) => (
                <div key={step.label} className="rounded-lg border border-[#E8E8F0] bg-[#FAFBFF] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#F0EEFF] text-xs font-bold text-[#6C63FF]">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-[#1A1A2E]">{step.label}</span>
                  </div>
                  <p className="text-xs leading-5 text-[#6B7280]">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="border-t border-[#E8E8F0] bg-[#FBFCFF] p-5 lg:border-l lg:border-t-0">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleVideoSelect(e.target.files?.[0])}
            />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A2E]">视频素材输入</h2>
                <p className="text-xs text-[#8B93B5]">仅本地预览，未接入后端上传/识别</p>
              </div>
              {videoMeta && (
                <button
                  type="button"
                  onClick={removeVideo}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B93B5] transition-colors hover:bg-white hover:text-[#EF4444]"
                  aria-label="移除视频"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-[#DDE1EE] bg-[#111827]">
              {videoMeta ? (
                <video src={videoMeta.url} controls className="aspect-video w-full bg-black" />
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-white"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                    <FileVideo className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-semibold">选择视频文件</span>
                  <span className="max-w-[240px] text-xs leading-5 text-white/60">
                    当前不会上传到智能体；页面不会假装视频已被 AI 分析。
                  </span>
                </button>
              )}
            </div>
            {videoMeta && (
              <div className="mt-3 rounded-lg border border-[#E8E8F0] bg-white p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
                  <Film className="h-4 w-4 text-[#6C63FF]" />
                  <span className="truncate">{videoMeta.name}</span>
                </div>
                <div className="flex gap-2 text-xs text-[#8B93B5]">
                  <span>{videoMeta.type}</span>
                  <span>{videoMeta.size}</span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {platforms.map((p) => {
            const Icon = p.icon;
            const isActive = activePlatform === p.id;
            return (
              <button
                key={p.id}
                data-testid={`tab-${p.id}`}
                onClick={() => p.enabled && setActivePlatform(p.id)}
                disabled={!p.enabled}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm'
                    : p.enabled
                      ? 'border border-purple-100 bg-white/90 text-gray-600 hover:border-purple-200 hover:bg-purple-50'
                      : 'cursor-not-allowed border border-[#E8E8F0] bg-[#F8F9FF] text-[#9CA3AF]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {p.label}{!p.enabled ? '（未接入）' : ''}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Dropdown
            trigger={
              <button data-testid="filter-category" className="inline-flex items-center gap-1 rounded-xl border border-purple-100 bg-white/90 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-purple-50">
                {selectedCategory} <ChevronDown className="h-3 w-3" />
              </button>
            }
          >
            {catOptions.map((opt) => (
              <DropdownItem key={opt} active={selectedCategory === opt} onClick={() => setSelectedCategory(opt)}>
                {opt}
              </DropdownItem>
            ))}
          </Dropdown>
          <Dropdown
            align="right"
            trigger={
              <button data-testid="filter-time" className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm">
                {selectedTimeRange} <ChevronDown className="h-3 w-3" />
              </button>
            }
          >
            {timeOptions.map((opt) => (
              <DropdownItem key={opt} active={selectedTimeRange === opt} onClick={() => setSelectedTimeRange(opt)}>
                {opt}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      <section className="mb-6 border-y border-[#E6E8F2] bg-white px-4 py-4 sm:px-5" aria-live="polite">
        <div className="mb-3 flex justify-end">
          <StoreAgentProfileModal />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#15803D]" />
            <h2 className="text-sm font-semibold text-[#1A1A2E]">Ozon 来源证据</h2>
          </div>
          {sourceEvidence ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#64748B]">
              <span>{sourceEvidence.provider ?? '来源服务未返回'}</span>
              <span>抓取于 {formatEvidenceTime(sourceEvidence.fetchedAt)}</span>
              {sourceEvidence.searchQuery ? (
                <span>实际 Ozon 检索：{sourceEvidence.searchQuery}</span>
              ) : null}
              {sourceEvidence.relevance.matchTerms.length > 0 ? (
                <span>硬匹配：{sourceEvidence.relevance.matchTerms.join('、')}</span>
              ) : null}
              {runtime?.model ? <span>模型 {runtime.model}</span> : null}
              {runtime?.fallbackActive ? <span className="text-[#B45309]">备用密钥运行</span> : null}
            </div>
          ) : null}
        </div>
        {sourceEvidence ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sourceEvidence.items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 items-center justify-between gap-3 border border-[#E8E8F0] bg-[#FBFCFF] px-3 py-2 text-left transition-colors hover:border-[#4A9EFF] hover:bg-white"
              >
                <span className="min-w-0 truncate text-xs font-medium text-[#334155]">{item.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-[#2563EB]">
                  {item.priceRub === null ? '价格未解析' : `${item.priceRub} RUB`}
                  <ExternalLink className="h-3 w-3" />
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p role="alert" className="mt-2 text-xs leading-5 text-[#B91C1C]">
            当前报告缺少可核验的 Ozon 链接、抓取时间或价格证据，不能进入审批列表。
          </p>
        )}
      </section>

      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <Sparkles className="h-5 w-5 text-purple-500" />
        {t('productResearch.aiResearchInsight')}
      </h2>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-900">{t('productResearch.marketDemandTrend')}</h3>
          </div>
          <EmptyPanel>后端 /product-research 未返回趋势曲线或同比增长，未展示本地模拟趋势。</EmptyPanel>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900">后端 rating</h3>
          </div>
          <div className="text-2xl font-bold text-indigo-600">{ratingText}</div>
          <p className="mt-2 text-xs leading-5 text-[#8B93B5]">来自后端 opportunities.rating；没有返回时不补默认值。</p>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">竞品样本</h3>
          </div>
          {opportunities.length ? (
            <div className="flex flex-wrap gap-1.5">
              {opportunities.slice(0, 5).map((item) => (
                <span key={item.id} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {item.name}
                </span>
              ))}
            </div>
          ) : (
            <EmptyPanel>后端未返回 competitors。</EmptyPanel>
          )}
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-pink-500" />
            <h3 className="text-sm font-semibold text-gray-900">{t('productResearch.giftSceneOpportunities')}</h3>
          </div>
          <EmptyPanel>后端未返回礼品场景标签，未展示模拟场景。</EmptyPanel>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-semibold text-gray-900">{t('productResearch.customizationOpportunities')}</h3>
          </div>
          <EmptyPanel>后端未返回定制化机会字段，未展示模拟标签。</EmptyPanel>
        </div>
      </div>

      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
        <Target className="h-5 w-5 text-purple-500" />
        后端竞品样本
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12 text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('productResearch.loadingOpportunities')}
          </div>
        ) : opportunities.length > 0 ? (
          opportunities.slice(0, 4).map((product) => (
            <div key={product.id} className="rounded-2xl border border-purple-100 bg-white/95 p-5 shadow-sm transition-all hover:border-purple-200 hover:shadow-md">
              <div className="mb-4 flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-[#E8E8F0] bg-[#F8F9FF] text-center text-xs text-[#8B93B5]">
                后端未返回商品图片
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-gray-900">{product.name}</h3>
              <p className="mb-3 text-sm text-gray-400">{product.priceRange}</p>
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
                  真实竞品回读
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-gray-400">机会分未接入</span>
                  <span className="text-lg font-bold text-indigo-600">{product.opportunityScore ?? '未接入'}</span>
                </div>
              </div>
              <button
                data-testid={`detail-btn-${product.id}`}
                onClick={() => setSelectedProduct(product)}
                className="w-full rounded-xl bg-purple-50 py-2.5 text-xs font-semibold text-purple-600 transition-all hover:bg-purple-100 active:scale-[0.98]"
              >
                {t('productResearch.viewResearchDetail')}
              </button>
            </div>
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center py-12 text-sm text-gray-400">
            {t('productResearch.noOpportunitiesData')}
          </div>
        )}
      </div>

      <Modal
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        title={selectedProduct?.name ?? ''}
        width="max-w-2xl"
      >
        {selectedProduct && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#E8E8F0] bg-[#F8F9FF] text-center text-[10px] text-[#8B93B5]">
                无图片
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="mb-1 text-lg font-bold text-gray-900">{selectedProduct.name}</h4>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="font-semibold text-indigo-600">{selectedProduct.priceRange}</span>
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                    {selectedProduct.platform}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5 text-indigo-500" />
                    机会分未接入
                    <span className="font-bold text-indigo-600">{selectedProduct.opportunityScore ?? '未接入'}</span>
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Sparkles className="h-4 w-4 text-purple-500" />
                {t('productResearch.productOverview')}
              </h5>
              <p className="text-sm leading-relaxed text-gray-600">
                {researchData?.description || '后端未返回 summary。'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 p-3">
                <p className="mb-1 text-xs text-gray-500">后端字段</p>
                <p className="text-sm font-semibold text-gray-800">opportunities.competitors</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-3">
                <p className="mb-1 text-xs text-gray-500">{t('productResearch.marketSize')}</p>
                <p className="text-sm font-semibold text-gray-800">未接入市场规模字段</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-3">
                <p className="mb-1 text-xs text-gray-500">{t('productResearch.competitionLevelLabel')}</p>
                <p className="text-sm font-semibold text-gray-800">未接入竞争等级字段</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 p-3">
                <p className="mb-1 text-xs text-gray-500">{t('productResearch.salesEstimateLabel')}</p>
                <p className="text-sm font-semibold text-gray-800">未接入销量预估字段</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
