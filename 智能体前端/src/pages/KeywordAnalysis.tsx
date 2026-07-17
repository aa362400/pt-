import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem } from '../components/ui/Dropdown.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import {
  Search,
  TrendingUp,
  Target,
  Trophy,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Zap,
  Lightbulb,
  Star,
  Bot,
  RefreshCw,
  Globe,
  ShoppingBag,
  Music,
  ShoppingCart,
  Store,
  Filter,
  Download,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import AgentInputDock from '../components/ui/AgentInputDock';
import { keywordsApi } from '../api/keywords';
import type { KeywordReport } from '../api/keywords';
import type { KeywordData, LongTailKeyword } from '../types';
import { useAuth } from '../auth/AuthContext.tsx';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

// ─────────────────────────────────────────────────────────
// Platform icon helper
// ─────────────────────────────────────────────────────────
function PlatformIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'shopping-bag':
      return <ShoppingBag size={14} />;
    case 'music':
      return <Music size={14} />;
    case 'shopping-cart':
      return <ShoppingCart size={14} />;
    case 'store':
    case 'ozon':
      return <Store size={14} />;
    default:
      return <Globe size={14} />;
  }
}

// ─────────────────────────────────────────────────────────
// Sparkline mini chart (inline SVG)
// ─────────────────────────────────────────────────────────
function SparklineChart({ data, trend }: { data: number[]; trend: string }) {
  if (data.length < 2) {
    return <span className="text-xs text-[#9CA3AF]">无可核验证据</span>;
  }
  const color =
    trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#6B7280';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const points = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * w).toFixed(1)},${(
          h -
          ((v - min) / range) * h
        ).toFixed(1)}`,
    )
    .join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// Difficulty badge (progress bar + label)
// ─────────────────────────────────────────────────────────
function DifficultyBadge({
  difficulty,
  labels,
}: {
  difficulty: number;
  labels: { high: string; medium: string; low: string };
}) {
  let label: string;
  let color: string;
  if (difficulty >= 70) {
    label = labels.high;
    color = '#EF4444';
  } else if (difficulty >= 40) {
    label = labels.medium;
    color = '#F59E0B';
  } else {
    label = labels.low;
    color = '#10B981';
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[#E8E8F0]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${difficulty}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Opportunity score badge
// ─────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const base = 'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold';
  let className: string;
  if (score >= 80) className = `${base} bg-[#10B981] text-white`;
  else if (score >= 60) className = `${base} bg-[#F59E0B] text-white`;
  else className = `${base} bg-[#EF4444] text-white`;

  return <span className={className}>{score}</span>;
}

// ─────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────
export default function KeywordAnalysis() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { user } = useAuth();
  const displayName = user?.name ?? user?.email?.split('@')[0] ?? '用户';

  // ── Chip rotation sets (built from translations) ──
  const chipSets = [
    [t('keywordAnalysis.chipSet1_1'), t('keywordAnalysis.chipSet1_2'), t('keywordAnalysis.chipSet1_3'), t('keywordAnalysis.chipSet1_4'), t('keywordAnalysis.chipSet1_5'), t('keywordAnalysis.chipSet1_6')],
    [t('keywordAnalysis.chipSet2_1'), t('keywordAnalysis.chipSet2_2'), t('keywordAnalysis.chipSet2_3'), t('keywordAnalysis.chipSet2_4'), t('keywordAnalysis.chipSet2_5'), t('keywordAnalysis.chipSet2_6')],
    [t('keywordAnalysis.chipSet3_1'), t('keywordAnalysis.chipSet3_2'), t('keywordAnalysis.chipSet3_3'), t('keywordAnalysis.chipSet3_4'), t('keywordAnalysis.chipSet3_5'), t('keywordAnalysis.chipSet3_6')],
  ];

  // AI term suggestions via POST /keywords. Metrics remain unavailable without evidence.
  const requestAiAnalysis = async (msg: string): Promise<string> => {
    const report = await keywordsApi.analyze({ keyword: msg });
    setBlenderKeywords((prev) => [
      report,
      ...prev.filter((item) => item.id !== report.id),
    ].slice(0, 20));
    return report.metricStatus === 'EVIDENCE_BACKED'
      ? `「${report.keyword}」关键词建议已生成。搜索量：${report.searchVolume ?? '无可核验证据'}；竞争难度：${report.difficulty ?? '无可核验证据'}。`
      : `「${report.keyword}」关键词建议已生成；当前没有可核验的搜索量或竞争难度证据，指标保持 DATA_INSUFFICIENT。`;
  };

  // ── Difficulty labels ──
  const difficultyLabels = {
    high: t('keywordAnalysis.difficultyHigh'),
    medium: t('keywordAnalysis.difficultyMedium'),
    low: t('keywordAnalysis.difficultyLow'),
  };

  // ─── API-fetched state ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [blenderKeywords, setBlenderKeywords] = useState<KeywordData[]>([]);
  const [longTailKeywords, setLongTailKeywords] = useState<LongTailKeyword[]>([]);

  const fetchKeywordData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const listRes = await keywordsApi.list({ limit: 20 });
      const reports: KeywordReport[] = listRes.items ?? [];
      setBlenderKeywords(reports.slice(0, 5));

      if (reports.length > 0) {
        try {
          const detail = await keywordsApi.getById(reports[0].id);
          const mapped: LongTailKeyword[] = detail.longTailKeywords.map(
            (item, i) => ({
              id: `lt-${i}`,
              keyword: item.keyword,
              volume: item.volume,
              difficulty: item.difficulty,
              metricStatus: item.metricStatus,
              metricEvidence: item.metricEvidence,
            }),
          );
          setLongTailKeywords(mapped);
        } catch {
          setLongTailKeywords([]);
        }
      } else {
        setLongTailKeywords([]);
      }
    } catch (err) {
      if (!silent) {
        console.error(t('common.error'), err);
        addToast(t('common.error'), 'error');
        setBlenderKeywords([]);
        setLongTailKeywords([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void fetchKeywordData();
  }, [fetchKeywordData]);

  const refreshKeywordsSilently = useCallback(
    () => fetchKeywordData(true),
    [fetchKeywordData],
  );
  useAutoRefresh(refreshKeywordsSilently, 12000);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState(t('keywordAnalysis.filterAllPlatforms'));
  const [chipSetIndex, setChipSetIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(t('keywordAnalysis.categoryAllItems'));
  const [selectedCountry, setSelectedCountry] = useState(t('keywordAnalysis.countryAll'));
  const [tableTitleKeyword, setTableTitleKeyword] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [tableFilter, setTableFilter] = useState<'none' | 'volume' | 'score' | 'high'>('none');

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filterButtons = [
    t('keywordAnalysis.filterAllPlatforms'),
    'Amazon',
    'Ozon',
    'Etsy',
    'Temu',
    'Google',
  ];

  const categoryOptions = [
    t('keywordAnalysis.categoryAllItems'),
    t('keywordAnalysis.categoryHomeKitchen'),
    t('keywordAnalysis.categoryBeautyPersonal'),
    t('keywordAnalysis.category3CDigital'),
    t('keywordAnalysis.categorySportsOutdoor'),
    t('keywordAnalysis.categoryPetSupplies'),
  ];

  const countryOptions = [
    t('keywordAnalysis.countryAll'),
    t('keywordAnalysis.countryUS'),
    t('keywordAnalysis.countryJapan'),
    t('keywordAnalysis.countryGermany'),
    t('keywordAnalysis.countryUK'),
    t('keywordAnalysis.countrySoutheastAsia'),
  ];

  const chipKeywords = chipSets[chipSetIndex];
  const platformFilteredKeywords = blenderKeywords.filter((kw) => {
    if (activeFilter === t('keywordAnalysis.filterAllPlatforms')) return true;
    return kw.platform.toLowerCase().includes(activeFilter.toLowerCase());
  });
  const displayedKeywords = [...platformFilteredKeywords]
    .filter((kw) => tableFilter !== 'high' || (kw.opportunityScore ?? 0) >= 80)
    .sort((a, b) => {
      if (tableFilter === 'volume') {
        return (b.searchVolume ?? -1) - (a.searchVolume ?? -1);
      }
      if (tableFilter === 'score' || tableFilter === 'high') {
        return (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1);
      }
      return 0;
    });
  const backendKeywordTotal = blenderKeywords.reduce(
    (sum, item) => sum + (item.totalKeywords ?? 0),
    0,
  );
  const visibleTotal = backendKeywordTotal > 0 ? backendKeywordTotal : blenderKeywords.length;
  const trendSource = blenderKeywords.find((kw) => kw.trendData.length > 1);
  const trendChartData =
    trendSource?.trendData.map((value, index) => ({ point: `${index + 1}`, value })) ?? [];
  const opportunityBuckets = [
    {
      name: t('keywordAnalysis.highOpportunityName80'),
      value: blenderKeywords.filter((kw) => (kw.opportunityScore ?? -1) >= 80).length,
      color: '#10B981',
    },
    {
      name: t('keywordAnalysis.mediumOpportunityName60'),
      value: blenderKeywords.filter((kw) => {
        const score = kw.opportunityScore;
        return score !== null && score >= 60 && score < 80;
      }).length,
      color: '#F59E0B',
    },
    {
      name: t('keywordAnalysis.lowOpportunityName0'),
      value: blenderKeywords.filter((kw) => {
        const score = kw.opportunityScore;
        return score !== null && score < 60;
      }).length,
      color: '#EF4444',
    },
  ];
  const opportunityPieData = opportunityBuckets.filter((item) => item.value > 0);
  const recommendedKeywords = [...blenderKeywords]
    .filter((kw) => kw.opportunityScore !== null)
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 4);
  const topRecommendedKeyword = recommendedKeywords[0] ?? null;
  const highOpportunityInsight = topRecommendedKeyword
    ? `${topRecommendedKeyword.keyword} 机会评分 ${topRecommendedKeyword.opportunityScore}，来自后端关键词报告。`
    : '没有可核验的机会评分，页面不会生成高机会结论。';
  const trendAlertInsight = trendSource
    ? `${trendSource.keyword} 返回了 ${trendSource.trendData.length} 个有来源证据的趋势点，可在左侧趋势图查看。`
    : '没有可核验的趋势序列，页面不会展示模型推测曲线。';
  const strategyInsight =
    blenderKeywords.length > 0
      ? '请将上方词条视为关键词建议；只有标记“证据已核验”的搜索量和难度才可用于 Listing 决策。'
      : '暂无后端关键词报告，页面不会生成固定策略文案。';
  const allSelected = displayedKeywords.length > 0 && selectedIds.size === displayedKeywords.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayedKeywords.map((k) => k.id)));
  };

  const handleExportSuggestedData = () => {
    if (displayedKeywords.length === 0) {
      addToast('没有可导出的关键词建议记录。', 'warning');
      return;
    }
    const rows = [
      [
        'suggestedKeyword',
        'searchVolume',
        'difficulty',
        'opportunityScore',
        'metricStatus',
        'provider',
        'sourceUrl',
        'sourceReference',
        'observedAt',
        'method',
        'sourceKind',
        'platform',
      ],
      ...displayedKeywords.map((kw) => [
        kw.keyword,
        kw.searchVolume ?? '',
        kw.difficulty ?? '',
        kw.opportunityScore ?? '',
        kw.metricStatus,
        kw.metricEvidence?.provider ?? '',
        kw.metricEvidence?.sourceUrl ?? '',
        kw.metricEvidence?.sourceReference ?? '',
        kw.metricEvidence?.observedAt ?? '',
        kw.metricEvidence?.method ?? '',
        kw.metricEvidence?.sourceKind ?? '',
        kw.platform,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `keyword-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast(`已导出 ${displayedKeywords.length} 条关键词建议及证据状态。`, 'success');
  };

  // ── Trend direction icon ──
  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up')
      return <ArrowUp size={12} className="text-[#10B981]" />;
    if (trend === 'down')
      return <ArrowDown size={12} className="text-[#EF4444]" />;
    return null;
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-6">
      {/* ═══════════════════════════════════════════════════
          Welcome Section
      ════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#6C63FF] via-[#7C73FF] to-[#8B83FF] p-8 text-white">
        <div className="relative z-10 flex items-start justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold leading-tight">
              {t('keywordAnalysis.welcomeTitle', { name: displayName })}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {t('keywordAnalysis.welcomeSubtitle')}
            </p>
          </div>
          {/* Robot illustration */}
          <div className="hidden shrink-0 lg:block">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
              <Bot size={48} className="text-white/30" />
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative z-10 mt-6">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              data-testid="search-input"
              placeholder={t('keywordAnalysis.placeholderSearchKeyword')}
              className="w-full rounded-xl border-0 bg-white/15 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-white/50 backdrop-blur-sm outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>

            {/* Keyword capsules */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/70">预设搜索建议（非热度数据）：</span>
            {chipKeywords.map((kw) => (
              <button
                key={kw}
                onClick={() => {
                  setSearchInput(kw);
                  setTableTitleKeyword(kw);
                }}
                data-testid={`chip-${kw}`}
                className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/20"
              >
                {kw}
              </button>
            ))}
            <button
              onClick={() => setChipSetIndex((i) => (i + 1) % chipSets.length)}
              data-testid="btn-change-batch"
              className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/20"
            >
              <RefreshCw size={12} />
              {t('keywordAnalysis.changeBatch')}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          Filter Bar
      ════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn}
              data-testid={`filter-tab-${btn}`}
              onClick={() => setActiveFilter(btn)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeFilter === btn
                  ? 'bg-[#6C63FF] text-white shadow-sm'
                  : 'border border-[#E8E8F0] bg-white text-[#4B5563] hover:border-[#6C63FF] hover:text-[#6C63FF]'
              }`}
            >
              {btn}
            </button>
          ))}
          <Dropdown
            trigger={
              <button
                data-testid="btn-category"
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedCategory !== t('keywordAnalysis.categoryAllItems')
                    ? 'border-[#6C63FF] bg-[#F0EEFF] text-[#6C63FF]'
                    : 'border-[#E8E8F0] bg-white text-[#4B5563] hover:border-[#6C63FF] hover:text-[#6C63FF]'
                }`}
              >
                {selectedCategory}
                <ChevronDown size={14} />
              </button>
            }
          >
            {categoryOptions.map((c) => (
              <DropdownItem
                key={c}
                active={selectedCategory === c}
                onClick={() => setSelectedCategory(c)}
              >
                {c}
              </DropdownItem>
            ))}
          </Dropdown>
          <Dropdown
            trigger={
              <button
                data-testid="btn-country"
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedCountry !== t('keywordAnalysis.countryAll')
                    ? 'border-[#6C63FF] bg-[#F0EEFF] text-[#6C63FF]'
                    : 'border-[#E8E8F0] bg-white text-[#4B5563] hover:border-[#6C63FF] hover:text-[#6C63FF]'
                }`}
              >
                {selectedCountry}
                <ChevronDown size={14} />
              </button>
            }
          >
            {countryOptions.map((c) => (
              <DropdownItem
                key={c}
                active={selectedCountry === c}
                onClick={() => setSelectedCountry(c)}
              >
                {c}
              </DropdownItem>
            ))}
          </Dropdown>
          <div className="ml-auto flex items-center gap-2">
            <Dropdown
              align="right"
              trigger={
                <button
                  data-testid="btn-filter"
                  className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-sm text-[#4B5563] transition-colors hover:border-[#6C63FF] hover:text-[#6C63FF]"
                >
                  <Filter size={14} />
                  {t('keywordAnalysis.categoryFilter')}
                </button>
              }
            >
              <DropdownItem onClick={() => setTableFilter('volume')}>
                {t('keywordAnalysis.filterBySearchVolume')}
              </DropdownItem>
              <DropdownItem onClick={() => setTableFilter('score')}>
                {t('keywordAnalysis.filterByScore')}
              </DropdownItem>
              <DropdownItem onClick={() => setTableFilter('high')}>
                {t('keywordAnalysis.filterHighOpportunityOnly')}
              </DropdownItem>
            </Dropdown>
            <button
              data-testid="btn-export"
              onClick={handleExportSuggestedData}
              className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-sm text-[#4B5563] transition-colors hover:border-[#6C63FF] hover:text-[#6C63FF]"
            >
              <Download size={14} />
              {t('keywordAnalysis.exportData')}
            </button>
          </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          Main Content (70 / 30 split)
      ════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ─── Left Panel (70%) ─── */}
        <div className="flex flex-col gap-6 lg:w-[70%]">
          {/* ● Keyword Table Card */}
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-6 py-4">
              <h2 className="text-base font-semibold text-[#1A1A2E]">
                {t('keywordAnalysis.foundKeywordsPrefix')}{' '}
                <span className="text-[#6C63FF]">{visibleTotal}</span>{' '}
                {t('keywordAnalysis.foundKeywordsSuffix')}
                {tableTitleKeyword && (
                  <span className="ml-1 text-[#6B7280] font-normal">
                    {t('keywordAnalysis.tableTitleKeywordSuffix', { keyword: tableTitleKeyword })}
                  </span>
                )}
              </h2>
              <div className="text-right text-xs text-[#6B7280]">
                <div>关键词建议，不代表真实搜索量</div>
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  <span>{t('keywordAnalysis.sortByRelevance')}</span>
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table data-testid="keyword-table" className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E8E8F0] bg-[#F8F9FF] text-xs font-medium text-[#6B7280]">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        data-testid="checkbox-select-all"
                        className="h-4 w-4 rounded border-[#D1D5DB] text-[#6C63FF] accent-[#6C63FF]"
                      />
                    </th>
                    <th className="px-3 py-3">{t('keywordAnalysis.rank')}</th>
                    <th className="px-3 py-3">{t('keywordAnalysis.colKeyword')}</th>
                    <th className="px-3 py-3 text-right">{t('keywordAnalysis.colSearchVolume')}</th>
                    <th className="px-3 py-3 text-center">{t('keywordAnalysis.colTrend')}</th>
                    <th className="px-3 py-3 text-center">{t('keywordAnalysis.colDifficulty')}</th>
                    <th className="px-3 py-3 text-center">{t('keywordAnalysis.colScore')}</th>
                    <th className="px-3 py-3">{t('keywordAnalysis.colPlatform')}</th>
                    <th className="px-3 py-3 text-center">{t('keywordAnalysis.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-sm text-[#9CA3AF]">
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('keywordAnalysis.loadingKeywords')}
                        </span>
                      </td>
                    </tr>
                  ) : displayedKeywords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-sm text-[#9CA3AF]">
                        {t('keywordAnalysis.noKeywordData')}
                      </td>
                    </tr>
                  ) : (
                    displayedKeywords.map((kw, idx) => (
                      <tr
                        key={kw.id}
                        className={`border-b border-[#E8E8F0] transition-colors hover:bg-[#F8F9FF] ${
                          selectedIds.has(kw.id) ? 'bg-[#F0EEFF]' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(kw.id)}
                            onChange={() => toggleSelect(kw.id)}
                            data-testid={`checkbox-${kw.id}`}
                            className="h-4 w-4 rounded border-[#D1D5DB] text-[#6C63FF] accent-[#6C63FF]"
                          />
                        </td>
                        {/* Rank */}
                        <td className="px-3 py-3 text-[#6B7280]">{idx + 1}</td>
                        {/* Keyword */}
                        <td className="px-3 py-3 font-medium text-[#1A1A2E]">
                          <div>{kw.keyword}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-[#8B93B5]">
                            <span className="rounded bg-[#F0EEFF] px-1.5 py-0.5 text-[#5B52D6]">
                              AI 关键词建议
                            </span>
                            {kw.metricStatus === 'EVIDENCE_BACKED' && kw.metricEvidence ? (
                              kw.metricEvidence.sourceUrl ? (
                                <a
                                  href={kw.metricEvidence.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-[#5B52D6] hover:underline"
                                  title={`${kw.metricEvidence.method} · ${kw.metricEvidence.observedAt}`}
                                >
                                  指标来源：{kw.metricEvidence.provider}
                                </a>
                              ) : (
                                <span title={`${kw.metricEvidence.sourceReference} · ${kw.metricEvidence.observedAt}`}>
                                  指标来源：{kw.metricEvidence.provider}
                                </span>
                              )
                            ) : (
                              <span>指标：数据不足</span>
                            )}
                          </div>
                        </td>
                        {/* Search Volume */}
                        <td className="px-3 py-3 text-right font-medium text-[#1A1A2E]">
                          {kw.searchVolume === null ? '无可核验证据' : kw.searchVolume.toLocaleString()}
                        </td>
                        {/* Trend (sparkline) */}
                        <td className="px-3 py-3 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <SparklineChart data={kw.trendData} trend={kw.trend} />
                            <TrendIcon trend={kw.trend} />
                          </div>
                        </td>
                        {/* Competition / Difficulty */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            {kw.difficulty === null ? (
                              <span className="text-xs text-[#9CA3AF]">无可核验证据</span>
                            ) : (
                              <DifficultyBadge difficulty={kw.difficulty} labels={difficultyLabels} />
                            )}
                          </div>
                        </td>
                        {/* Opportunity Score */}
                        <td className="px-3 py-3 text-center">
                          {kw.opportunityScore === null ? (
                            <span className="text-xs text-[#9CA3AF]">无可核验证据</span>
                          ) : (
                            <ScoreBadge score={kw.opportunityScore} />
                          )}
                        </td>
                        {/* Platform */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                            <PlatformIcon icon={kw.platformIcon} />
                            <span>{kw.platform || '后端未返回'}</span>
                          </div>
                        </td>
                        {/* Action */}
                        <td className="px-3 py-3 text-center">
                          <button className="rounded-lg p-1.5 text-[#9CA3AF] transition-colors hover:bg-[#F0EEFF] hover:text-[#6C63FF]">
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="flex items-center justify-between border-t border-[#E8E8F0] px-6 py-3">
              <span className="text-xs text-[#6B7280]">
                {t('keywordAnalysis.selectedKeywords', { count: selectedIds.size })}
              </span>
              <div className="flex items-center gap-1 text-xs text-[#6B7280]">
                <span>{displayedKeywords.length} / {visibleTotal}</span>
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* ● Charts Row (side by side) */}
          <div className="flex flex-col gap-6 sm:flex-row">
            {/* Search Trend Line Chart */}
            <div className="flex-1 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">
                  {t('keywordAnalysis.searchTrend')}
                </h3>
                <TrendingUp size={16} className="text-[#6C63FF]" />
              </div>
              <div className="h-52">
                {trendChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis
                        dataKey="point"
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6C63FF"
                        strokeWidth={2}
                        dot={false}
                        name={trendSource?.keyword ?? t('keywordAnalysis.searchTrend')}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] px-4 text-center text-xs text-[#8B93B5]">
                    没有来源完整的趋势证据，页面不展示模型推测曲线。
                  </div>
                )}
              </div>
            </div>

            {/* Opportunity Distribution Pie Chart */}
            <div className="flex-1 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">
                  {t('keywordAnalysis.keywordOpportunityDistribution')}
                </h3>
                <Target size={16} className="text-[#6C63FF]" />
              </div>
              <div className="flex h-52 items-center justify-center">
                {opportunityPieData.length > 0 ? (
                  <>
                    <div className="h-full w-full max-w-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={opportunityPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={42}
                            outerRadius={72}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {opportunityPieData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                stroke="none"
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="ml-4 flex flex-col gap-2.5 text-xs">
                      {opportunityPieData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-[#4B5563]">{entry.name}</span>
                          <span className="font-semibold text-[#1A1A2E]">
                            {entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] px-4 py-8 text-center text-xs text-[#8B93B5]">
                    后端未返回机会分，页面未展示固定机会分布。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Panel (30%) ─── */}
        <div className="flex flex-col gap-6 lg:w-[30%]">
          {/* ● Hot Long-Tail Keywords */}
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#1A1A2E]">
                🔥 {t('keywordAnalysis.hotLongTail')}
              </h3>
              <button className="text-xs text-[#6C63FF] hover:underline">
                {t('common.viewAll')}
              </button>
            </div>
            <div className="divide-y divide-[#E8E8F0]">
              {longTailKeywords.length > 0 ? (
                longTailKeywords.slice(0, 6).map((lt) => (
                  <div
                    key={lt.id}
                    className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#F8F9FF]"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-sm font-medium text-[#1A1A2E]">
                        {lt.keyword}
                      </p>
                      <p className="mt-0.5 text-xs text-[#9CA3AF]">
                        {lt.volume === null
                          ? '搜索量：无可核验证据'
                          : t('keywordAnalysis.monthlySearch', { volume: lt.volume.toLocaleString() })}
                      </p>
                    </div>
                    {lt.difficulty === null ? (
                      <span className="text-xs text-[#9CA3AF]">无可核验证据</span>
                    ) : (
                      <DifficultyBadge difficulty={lt.difficulty} labels={difficultyLabels} />
                    )}
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-xs text-[#9CA3AF]">
                  {loading ? t('common.loading') : t('keywordAnalysis.noLongTailData')}
                </div>
              )}
            </div>
          </div>

          {/* ● Recommended Listing Keywords */}
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#1A1A2E]">
                ⭐ {t('keywordAnalysis.recommendedListingKeywords')}
              </h3>
              <button className="text-xs text-[#6C63FF] hover:underline">
                {t('common.more')}
              </button>
            </div>
            <div className="divide-y divide-[#E8E8F0]">
              {recommendedKeywords.length > 0 ? (
                recommendedKeywords.map((rk) => (
                  <div
                    key={rk.id}
                    className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#F8F9FF]"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-sm font-medium text-[#1A1A2E]">
                        {rk.keyword}
                      </p>
                      <p className="mt-0.5 text-xs text-[#9CA3AF]">
                        {rk.searchVolume === null
                          ? '搜索量：无可核验证据'
                          : t('keywordAnalysis.monthlySearch', { volume: rk.searchVolume.toLocaleString() })}
                      </p>
                    </div>
                    {rk.opportunityScore === null ? (
                      <span className="text-xs text-[#9CA3AF]">无可核验证据</span>
                    ) : (
                      <ScoreBadge score={rk.opportunityScore} />
                    )}
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-xs text-[#9CA3AF]">
                  后端未返回机会分，未展示本地推荐关键词。
                </div>
              )}
            </div>
          </div>

          {/* ● Keyword Insight Card (gradient with trophy) */}
          <div className="rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#8B5CF6] p-5 text-white shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Trophy size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold">{t('keywordAnalysis.keywordInsight')}</h3>
                <p className="text-xs text-white/70">{t('keywordAnalysis.aiAnalysisReport')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-white/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Lightbulb size={14} />
                  <span>{t('keywordAnalysis.highOpportunityKeywords')}</span>
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {highOpportunityInsight}
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Zap size={14} />
                  <span>{t('keywordAnalysis.trendAlert')}</span>
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {trendAlertInsight}
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Star size={14} />
                  <span>{t('keywordAnalysis.suggestedStrategy')}</span>
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {strategyInsight}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          AI Input Dock
      ════════════════════════════════════════════════════ */}
      <AgentInputDock
        placeholder={t('keywordAnalysis.aiDockPlaceholder')}
        data-testid="ai-input-dock"
        onSendMessage={(msg) => {
          setAiMessages((prev) => [...prev, { role: 'user', text: msg }]);
          requestAiAnalysis(msg)
            .then((reply) => {
              setAiMessages((prev) => [...prev, { role: 'ai', text: reply }]);
            })
            .catch(() => {
              setAiMessages((prev) => [
                ...prev,
                { role: 'ai', text: t('keywordAnalysis.analyzeFailed', '关键词分析请求失败，请稍后重试。') },
              ]);
            });
        }}
      />

      {/* AI Conversation Thread */}
      {aiMessages.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm" data-testid="ai-conversation">
          {aiMessages.map((m, i) => (
            <div
              key={i}
              data-testid={m.role === 'user' ? 'msg-user' : 'msg-ai'}
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-[#6C63FF] text-white'
                    : 'bg-[#F8F9FF] text-[#1A1A2E]'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
