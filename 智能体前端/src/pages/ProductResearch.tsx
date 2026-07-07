import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Sparkles,
  Lightbulb,
  Upload,
  ArrowUp,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  Zap,
  Target,
  ChevronDown,
  ShoppingBag,
  Music,
  Store,
  Package,
  Loader2,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from 'recharts';
import { productResearchApi } from '../api/productResearch';
import type { ResearchDetail } from '../api/productResearch';
import type { ProductOpportunity } from '../types';
import { Dropdown, DropdownItem } from '../components/ui/Dropdown.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import Modal from '../components/ui/Modal.tsx';

// ─── Product detail static data (for modal) ─────────────────────────────────

interface ProductDetailInfo {
  description: string;
  features: string[];
  marketSize: string;
  competitionLevel: string;
  salesEstimate: string;
  trend: string;
}

function buildProductDetailMap(
  t: (key: string, opts?: any) => string,
): Record<string, ProductDetailInfo> {
  return {
    po1: {
      description: t('productResearch.po1_desc'),
      features: [
        t('productResearch.po1_feature_0'),
        t('productResearch.po1_feature_1'),
        t('productResearch.po1_feature_2'),
        t('productResearch.po1_feature_3'),
        t('productResearch.po1_feature_4'),
        t('productResearch.po1_feature_5'),
        t('productResearch.po1_feature_6'),
        t('productResearch.po1_feature_7'),
      ],
      marketSize: t('productResearch.po1_marketSize'),
      competitionLevel: t('productResearch.po1_competition'),
      salesEstimate: t('productResearch.po1_salesEstimate'),
      trend: t('productResearch.po1_trend'),
    },
    po2: {
      description: t('productResearch.po2_desc'),
      features: [
        t('productResearch.po2_feature_0'),
        t('productResearch.po2_feature_1'),
        t('productResearch.po2_feature_2'),
        t('productResearch.po2_feature_3'),
        t('productResearch.po2_feature_4'),
        t('productResearch.po2_feature_5'),
        t('productResearch.po2_feature_6'),
        t('productResearch.po2_feature_7'),
      ],
      marketSize: t('productResearch.po2_marketSize'),
      competitionLevel: t('productResearch.po2_competition'),
      salesEstimate: t('productResearch.po2_salesEstimate'),
      trend: t('productResearch.po2_trend'),
    },
    po3: {
      description: t('productResearch.po3_desc'),
      features: [
        t('productResearch.po3_feature_0'),
        t('productResearch.po3_feature_1'),
        t('productResearch.po3_feature_2'),
        t('productResearch.po3_feature_3'),
        t('productResearch.po3_feature_4'),
        t('productResearch.po3_feature_5'),
        t('productResearch.po3_feature_6'),
        t('productResearch.po3_feature_7'),
      ],
      marketSize: t('productResearch.po3_marketSize'),
      competitionLevel: t('productResearch.po3_competition'),
      salesEstimate: t('productResearch.po3_salesEstimate'),
      trend: t('productResearch.po3_trend'),
    },
    po4: {
      description: t('productResearch.po4_desc'),
      features: [
        t('productResearch.po4_feature_0'),
        t('productResearch.po4_feature_1'),
        t('productResearch.po4_feature_2'),
        t('productResearch.po4_feature_3'),
        t('productResearch.po4_feature_4'),
        t('productResearch.po4_feature_5'),
        t('productResearch.po4_feature_6'),
        t('productResearch.po4_feature_7'),
      ],
      marketSize: t('productResearch.po4_marketSize'),
      competitionLevel: t('productResearch.po4_competition'),
      salesEstimate: t('productResearch.po4_salesEstimate'),
      trend: t('productResearch.po4_trend'),
    },
  };
}

const categoryOptions = [
  '全部类目',
  '家居装饰',
  '智能家居',
  '宠物用品',
  '户外运动',
  '美妆个护',
];

const timeRangeOptions = ['近30天', '近7天', '近90天', '近180天', '今年至今'];

const capabilities = [
  {
    id: 'c1',
    label: '多平台数据洞察',
    icon: Search,
    gradient: 'from-indigo-500 to-purple-500',
    bg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  {
    id: 'c2',
    label: '需求趋势预测',
    icon: TrendingUp,
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'c3',
    label: '竞争格局分析',
    icon: PieChartIcon,
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  {
    id: 'c4',
    label: '精准机会评分',
    icon: Target,
    gradient: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
];

const platforms = [
  { id: 'etsy', label: 'Etsy', icon: Store },
  { id: 'amazon', label: 'Amazon', icon: ShoppingBag },
  { id: 'temu', label: 'Temu', icon: Package },
  { id: 'tiktok', label: 'TikTok Shop', icon: Music },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ProductResearch() {
  const { t } = useTranslation();
  const [activePlatform, setActivePlatform] = useState('amazon');
  const [inputValue, setInputValue] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [researchVersion, setResearchVersion] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState(t('productResearch.catAll'));
  const [selectedTimeRange, setSelectedTimeRange] = useState(t('productResearch.timeLast30Days'));
  const { addToast } = useToast();

  // ─── API data state ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [researchData, setResearchData] = useState<ResearchDetail | null>(null);
  const [opportunities, setOpportunities] = useState<ProductOpportunity[]>([]);
  const hasFetchedOnce = useRef(false);

  // ─── Build product detail map from translations ──────────────────────────
  const productDetailMap = buildProductDetailMap(t);

  // ─── Category / time range options (translated) ──────────────────────────
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

  // ─── Capabilities (translated) ───────────────────────────────────────────
  const capList = [
    {
      id: 'c1',
      label: t('productResearch.capabilityMultiPlatform'),
      icon: Search,
      gradient: 'from-indigo-500 to-purple-500',
      bg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    },
    {
      id: 'c2',
      label: t('productResearch.capabilityTrendForecast'),
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    {
      id: 'c3',
      label: t('productResearch.capabilityCompetitionLandscape'),
      icon: PieChartIcon,
      gradient: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    },
    {
      id: 'c4',
      label: t('productResearch.capabilityPreciseScoring'),
      icon: Target,
      gradient: 'from-rose-500 to-pink-500',
      bg: 'bg-rose-50',
      iconColor: 'text-rose-600',
    },
  ];

  // ─── Fetch data from API ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const listRes = await productResearchApi.list({ limit: 5 });
        if (cancelled) return;
        const reports = listRes.items ?? [];
        if (reports.length > 0) {
          const detail = await productResearchApi.getById(reports[0].id);
          if (cancelled) return;
          setResearchData(detail);
          setOpportunities(detail.opportunities ?? []);
        } else {
          setResearchData(null);
          setOpportunities([]);
        }
        if (hasFetchedOnce.current) {
          addToast(t('productResearch.insightGenerated'), 'success');
        }
        hasFetchedOnce.current = true;
      } catch (err) {
        if (!cancelled) {
          console.error(t('productResearch.fetchFailedRetry'), err);
          if (hasFetchedOnce.current) {
            addToast(t('productResearch.fetchFailedRetry'), 'error');
          }
          hasFetchedOnce.current = true;
          setResearchData(null);
          setOpportunities([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [researchVersion, addToast, t]);

  const isFresh = researchVersion === 1;

  // ─── Derive data from API response ───────────────────────────────────────
  const activeSparkline =
    researchData?.marketTrend.sparkline?.map((s) => ({
      w: s.week,
      v: s.value,
    })) ?? [];
  const activeCompetition = researchData
    ? [
        { name: t('productResearch.competitionHighPotential'), value: researchData.competition.highPotential, color: '#6366f1' },
        { name: t('productResearch.competitionLow'), value: researchData.competition.lowCompetition, color: '#10b981' },
        { name: t('productResearch.competitionMedium'), value: researchData.competition.mediumCompetition, color: '#f59e0b' },
        { name: t('productResearch.competitionHigh'), value: researchData.competition.highCompetition, color: '#ef4444' },
      ]
    : [];
  const activePainPoints = researchData?.painPoints ?? [];
  const activeGiftScenarios = researchData?.giftScenarios ?? [];
  const activeCustomization = researchData?.customizationOptions ?? [];
  const activeHotWords = researchData?.marketTrend.hotWords ?? [];
  const growthRate = researchData?.marketTrend.growth ?? 0;

  const handleStartResearch = () => {
    if (isResearching) return;
    setIsResearching(true);
    setTimeout(() => {
      setResearchVersion((v) => (v === 0 ? 1 : 0));
      setIsResearching(false);
    }, 500);
  };

  const handleQuickFill = (text: string) => {
    setInputValue(text);
  };

  const handleUpload = () => {
    addToast(t('productResearch.imageUploadOpened'), 'info');
  };

  const handleViewDetail = (product: any) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  const modalDetail = selectedProduct
    ? productDetailMap[selectedProduct.id] || productDetailMap.po1
    : null;

  return (
    <div className="min-h-screen bg-[#f5f0ff] p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 mb-8">
        {/* Robot illustration */}
        <div className="hidden lg:flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 shadow-inner">
          <span className="text-4xl" role="img" aria-label="robot">
            🔍🤖
          </span>
        </div>

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            {t('productResearch.workspaceTitle')}{' '}
            <span className="inline-block animate-pulse">✨</span>
          </h1>
          <p className="text-gray-500 mt-1 text-base">
            {t('productResearch.pageSubtitle')}
          </p>
        </div>
      </div>

      {/* ── Capability Buttons ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {capList.map((cap) => {
          const Icon = cap.icon;
          return (
            <button
              key={cap.id}
              data-testid={`cap-${cap.id}`}
              className="group flex items-center gap-3 p-4 rounded-2xl bg-white/90 backdrop-blur-sm border border-purple-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all duration-200"
            >
              <div
                className={`p-2.5 rounded-xl ${cap.bg} ${cap.iconColor} group-hover:scale-105 transition-transform`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-medium text-gray-800 text-sm">
                {cap.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Input Card ──────────────────────────────────────────────────── */}
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-purple-100 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {t('productResearch.inputTitle')}
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          {t('productResearch.inputDescription')}
        </p>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            data-testid="input-research"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('productResearch.inputPlaceholder')}
            className="flex-1 px-5 py-3.5 rounded-xl border border-purple-200 bg-purple-50/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400 placeholder:text-gray-400 text-sm transition-all"
          />
          <button
            data-testid="btn-start-research"
            onClick={handleStartResearch}
            disabled={isResearching}
            className={`flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 active:scale-[0.97] transition-all shadow-sm text-sm ${
              isResearching ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isResearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
            {isResearching ? t('productResearch.researching') : t('productResearch.startResearch')}
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            data-testid="btn-quick-recommend"
            onClick={() => handleQuickFill(t('productResearch.quickFillRecommend'))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {t('productResearch.smartRecommend')}
          </button>
          <button
            data-testid="btn-quick-category"
            onClick={() => handleQuickFill(t('productResearch.quickFillCategory'))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
          >
            <Search className="w-4 h-4" />
            {t('productResearch.categoryExplore')}
          </button>
          <button
            data-testid="btn-quick-scenario"
            onClick={() => handleQuickFill(t('productResearch.quickFillScenario'))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            {t('productResearch.sceneInspiration')}
          </button>
          <button
            data-testid="btn-upload"
            onClick={handleUpload}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t('productResearch.uploadImage')}
          </button>
        </div>
      </div>

      {/* ── Platform Tabs + Filters ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {platforms.map((p) => {
            const Icon = p.icon;
            const isActive = activePlatform === p.id;
            return (
              <button
                key={p.id}
                data-testid={`tab-${p.id}`}
                onClick={() => setActivePlatform(p.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white/90 text-gray-600 border border-purple-100 hover:bg-purple-50 hover:border-purple-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Dropdown
            trigger={
              <button
                data-testid="filter-category"
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-white/90 text-gray-600 text-sm font-medium border border-purple-100 hover:bg-purple-50 transition-colors"
              >
                {selectedCategory} <ChevronDown className="w-3 h-3" />
              </button>
            }
          >
            {catOptions.map((opt) => (
              <DropdownItem
                key={opt}
                active={selectedCategory === opt}
                onClick={() => setSelectedCategory(opt)}
              >
                {opt}
              </DropdownItem>
            ))}
          </Dropdown>
          <Dropdown
            align="right"
            trigger={
              <button
                data-testid="filter-time"
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium shadow-sm"
              >
                {selectedTimeRange} <ChevronDown className="w-3 h-3" />
              </button>
            }
          >
            {timeOptions.map((opt) => (
              <DropdownItem
                key={opt}
                active={selectedTimeRange === opt}
                onClick={() => setSelectedTimeRange(opt)}
              >
                {opt}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ── AI 研究洞察 ─────────────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-500" />
        {t('productResearch.aiResearchInsight')}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Card 1 — 市场需求趋势 */}
        <div
          data-testid="insight-card-1"
          className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-50">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('productResearch.marketDemandTrend')}
            </h3>
          </div>
          <div className="text-2xl font-bold text-emerald-500 mb-1">
            {growthRate > 0 ? `+${growthRate}%` : '+0%'}
          </div>
          <p className="text-xs text-gray-400 mb-2">{t('productResearch.vsLastMonth')}</p>
          <div className="h-10 mb-3">
            {activeSparkline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeSparkline}>
                  <defs>
                    <linearGradient
                      id="sparklineGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: '#10b981' }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${value}`, t('productResearch.heat')]}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-xs">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {activeHotWords.length > 0 ? (
              activeHotWords.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[11px] rounded-full font-medium"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="px-2 py-0.5 text-gray-300 text-[11px]">
                {loading ? t('common.loading') : t('productResearch.noHotWords')}
              </span>
            )}
          </div>
        </div>

        {/* Card 2 — 竞争格局分析 */}
        <div
          data-testid="insight-card-2"
          className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-indigo-50">
              <PieChartIcon className="w-4 h-4 text-indigo-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('productResearch.capabilityCompetitionLandscape')}
            </h3>
          </div>
          <div className="h-[110px]">
            {activeCompetition.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activeCompetition}
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={46}
                    dataKey="value"
                    stroke="none"
                  >
                    {activeCompetition.map((_entry, idx) => (
                      <Cell key={idx} fill={activeCompetition[idx].color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${value}%`, t('productResearch.proportion')]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-xs">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </div>
            )}
          </div>
          <div className="space-y-1.5 mt-2">
            {activeCompetition.length > 0 ? (
              activeCompetition.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-500">{item.name}</span>
                  </div>
                  <span className="font-semibold text-gray-700">
                    {item.value}%
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center text-xs text-gray-300 py-4">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </div>
            )}
          </div>
        </div>

        {/* Card 3 — 用户痛点洞察 */}
        <div
          data-testid="insight-card-3"
          className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-amber-50">
              <BarChart3 className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('productResearch.userPainPoints')}
            </h3>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-3">
            {activePainPoints.length > 0 ? (
              activePainPoints.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 truncate pr-2">
                      {item.label}
                    </span>
                    <span className="font-semibold text-gray-700 shrink-0">
                      {item.value}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-400 to-indigo-500 transition-all duration-500"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center text-xs text-gray-300 py-8">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </div>
            )}
          </div>
        </div>

        {/* Card 4 — 礼品场景机会 */}
        <div
          data-testid="insight-card-4"
          className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-pink-50">
              <Zap className="w-4 h-4 text-pink-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('productResearch.giftSceneOpportunities')}
            </h3>
          </div>
          <p className="text-xs text-gray-400 mb-3">{t('productResearch.hotGiftSceneTags')}</p>
          <div className="flex flex-wrap gap-2">
            {activeGiftScenarios.length > 0 ? (
              activeGiftScenarios.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-br from-pink-50 to-rose-50 text-pink-600 text-[11px] font-medium rounded-lg border border-pink-100"
                >
                  🎁 {tag}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-300">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </span>
            )}
          </div>
        </div>

        {/* Card 5 — 定制化机会 */}
        <div
          data-testid="insight-card-5"
          className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-cyan-50">
              <Target className="w-4 h-4 text-cyan-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('productResearch.customizationOpportunities')}
            </h3>
          </div>
          <p className="text-xs text-gray-400 mb-3">{t('productResearch.hotCustomizationTags')}</p>
          <div className="flex flex-wrap gap-2">
            {activeCustomization.length > 0 ? (
              activeCustomization.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600 text-[11px] font-medium rounded-lg border border-cyan-100"
                >
                  ✨ {tag}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-300">
                {loading ? t('common.loading') : t('productResearch.noData')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 高潜力选品机会 ─────────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-purple-500" />
        {t('productResearch.highPotentialProducts')}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {opportunities.length > 0 ? (
          opportunities.slice(0, 4).map((product) => (
            <div
              key={product.id}
              className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-purple-100 hover:shadow-md hover:border-purple-200 transition-all duration-200 group"
            >
              {/* Image placeholder */}
              <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center mb-4 text-5xl group-hover:scale-105 transition-transform duration-300">
                {product.image}
              </div>

              <h3 className="font-semibold text-gray-900 text-sm mb-1.5">
                {product.name}
              </h3>

              <p className="text-sm text-gray-400 mb-3">{product.priceRange}</p>

              <div className="flex items-center justify-between mb-4">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    product.demandTrend === 'up'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  {product.demandTrend === 'up' ? t('productResearch.demandRising') : t('productResearch.demandStable')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-400 font-medium">
                    {t('productResearch.opportunityScore')}
                  </span>
                  <span className="text-lg font-bold text-indigo-600">
                    {product.opportunityScore}
                  </span>
                </div>
              </div>

              <button
                data-testid={`detail-btn-${product.id}`}
                onClick={() => handleViewDetail(product)}
                className="w-full py-2.5 text-xs font-semibold text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 active:scale-[0.98] transition-all"
              >
                {t('productResearch.viewResearchDetail')}
              </button>
            </div>
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center py-12 text-gray-300 text-sm">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('productResearch.loadingOpportunities')}
              </span>
            ) : (
              t('productResearch.noOpportunitiesData')
            )}
          </div>
        )}
      </div>

      {/* ── Product Detail Modal ────────────────────────────────────────── */}
      <Modal
        open={!!selectedProduct}
        onClose={handleCloseModal}
        title={selectedProduct?.name ?? ''}
        width="max-w-2xl"
      >
        {selectedProduct && modalDetail && (
          <div className="space-y-5">
            {/* Header with image and basic info */}
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center text-4xl shrink-0">
                {selectedProduct.image}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-bold text-gray-900 mb-1">
                  {selectedProduct.name}
                </h4>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="font-semibold text-indigo-600">
                    {selectedProduct.priceRange}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-xs font-medium">
                    {selectedProduct.platform}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-indigo-500" />
                    {t('productResearch.opportunityScore')}
                    <span className="font-bold text-indigo-600">
                      {selectedProduct.opportunityScore}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <h5 className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-500" />
                {t('productResearch.productOverview')}
              </h5>
              <p className="text-sm text-gray-600 leading-relaxed">
                {modalDetail.description}
              </p>
            </div>

            {/* Key Features */}
            <div>
              <h5 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                {t('productResearch.keyFeatures')}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {modalDetail.features.map((feature, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700"
                  >
                    <span className="text-indigo-400 mt-0.5 shrink-0">✦</span>
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            {/* Market Data */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                  {t('productResearch.marketTrendLabel')}
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {modalDetail.trend}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                  {t('productResearch.marketSize')}
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {modalDetail.marketSize}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <Target className="w-3.5 h-3.5 text-amber-500" />
                  {t('productResearch.competitionLevelLabel')}
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {modalDetail.competitionLevel}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-pink-50 to-rose-50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-pink-500" />
                  {t('productResearch.salesEstimateLabel')}
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {modalDetail.salesEstimate}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
