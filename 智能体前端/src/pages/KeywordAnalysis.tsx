import { useState, useEffect } from 'react';
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

// ─────────────────────────────────────────────────────────
// Local user info (no user API available yet)
// ─────────────────────────────────────────────────────────
const localUser = {
  name: 'Olivia',
  role: '运营主管',
  avatar: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%25%22 y1=%220%25%22 x2=%22100%25%22 y2=%22100%25%22%3E%3Cstop offset=%220%25%22 stop-color=%22%236366f1%22/%3E%3Cstop offset=%22100%25%22 stop-color=%22%23ec4899%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22url(%23g)%22/%3E%3Ctext x=%2250%22 y=%2258%22 text-anchor=%22middle%22 font-size=%2236%22%3E%F0%9F%91%A9%3C/text%3E%3C/svg%3E',
};

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
      return <Store size={14} />;
    default:
      return <Globe size={14} />;
  }
}

// ─────────────────────────────────────────────────────────
// Sparkline mini chart (inline SVG)
// ─────────────────────────────────────────────────────────
function SparklineChart({ data, trend }: { data: number[]; trend: string }) {
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

  // ── Chip rotation sets (built from translations) ──
  const chipSets = [
    [t('keywordAnalysis.chipSet1_1'), t('keywordAnalysis.chipSet1_2'), t('keywordAnalysis.chipSet1_3'), t('keywordAnalysis.chipSet1_4'), t('keywordAnalysis.chipSet1_5'), t('keywordAnalysis.chipSet1_6')],
    [t('keywordAnalysis.chipSet2_1'), t('keywordAnalysis.chipSet2_2'), t('keywordAnalysis.chipSet2_3'), t('keywordAnalysis.chipSet2_4'), t('keywordAnalysis.chipSet2_5'), t('keywordAnalysis.chipSet2_6')],
    [t('keywordAnalysis.chipSet3_1'), t('keywordAnalysis.chipSet3_2'), t('keywordAnalysis.chipSet3_3'), t('keywordAnalysis.chipSet3_4'), t('keywordAnalysis.chipSet3_5'), t('keywordAnalysis.chipSet3_6')],
  ];

  // ── Mock AI reply ──
  const mockAiReply = (msg: string) =>
    t('keywordAnalysis.mockAiReply', { keyword: msg });

  // ── Chart data (static, translated) ──
  const trendChartData = [
    { month: t('common.monthAug'), portable: 8200, personal: 6200, usb: 2100, smoothie: 5200, mini: 3200 },
    { month: t('common.monthSep'), portable: 9100, personal: 6800, usb: 2800, smoothie: 5400, mini: 3600 },
    { month: t('common.monthOct'), portable: 10500, personal: 7500, usb: 3500, smoothie: 5300, mini: 4100 },
    { month: t('common.monthNov'), portable: 11200, personal: 8200, usb: 3800, smoothie: 5500, mini: 4500 },
    { month: t('common.monthDec'), portable: 11800, personal: 8800, usb: 4200, smoothie: 5600, mini: 4800 },
    { month: t('common.monthJan'), portable: 12500, personal: 9200, usb: 4600, smoothie: 5700, mini: 5200 },
    { month: t('common.monthFeb'), portable: 13200, personal: 9800, usb: 5100, smoothie: 5800, mini: 5600 },
    { month: t('common.monthMar'), portable: 13800, personal: 10200, usb: 4800, smoothie: 5900, mini: 5900 },
    { month: t('common.monthApr'), portable: 14200, personal: 10800, usb: 5200, smoothie: 5700, mini: 6200 },
    { month: t('common.monthMay'), portable: 14800, personal: 11200, usb: 5800, smoothie: 5800, mini: 6800 },
    { month: t('common.monthJun'), portable: 15200, personal: 11800, usb: 6200, smoothie: 6000, mini: 7200 },
    { month: t('common.monthJul'), portable: 15800, personal: 12500, usb: 6800, smoothie: 6100, mini: 7800 },
  ];

  const opportunityPieData = [
    { name: t('keywordAnalysis.highOpportunityName80'), value: 45, color: '#10B981' },
    { name: t('keywordAnalysis.mediumOpportunityName60'), value: 30, color: '#F59E0B' },
    { name: t('keywordAnalysis.lowOpportunityName0'), value: 25, color: '#EF4444' },
  ];

  const recommendedKeywords = [
    { keyword: 'portable blender USB rechargeable', volume: 12800, score: 94 },
    { keyword: 'mini smoothie blender cup', volume: 9500, score: 91 },
    { keyword: 'personal blender for travel', volume: 8200, score: 88 },
    { keyword: 'USB-C blender bottle', volume: 6200, score: 86 },
  ];

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

  // ─── Fetch keywords from API ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const listRes = await keywordsApi.list({ limit: 20 });
        if (cancelled) return;
        const reports: KeywordReport[] = listRes.items ?? [];
        // Map API response to the component's KeywordData type (compatible shape)
        setBlenderKeywords(reports.slice(0, 5));

        // Try to fetch long-tail keywords from the first report's detail
        if (reports.length > 0) {
          try {
            const detail = await keywordsApi.getById(reports[0].id);
            if (!cancelled && detail.longTailKeywords) {
              // Map API response items to include an id for React keys
              const mapped: LongTailKeyword[] = detail.longTailKeywords.map(
                (item, i) => ({
                  id: `lt-${i}`,
                  keyword: item.keyword,
                  volume: item.volume,
                  difficulty: item.difficulty,
                }),
              );
              setLongTailKeywords(mapped);
            }
          } catch {
            // ignore — long-tail keywords just stay empty
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error(t('common.error'), err);
          addToast(t('common.error'), 'error');
          setBlenderKeywords([]);
          setLongTailKeywords([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [addToast, t]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [activeFilter, setActiveFilter] = useState(t('keywordAnalysis.filterAllPlatforms'));
  const [chipSetIndex, setChipSetIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(t('keywordAnalysis.categoryAllItems'));
  const [selectedCountry, setSelectedCountry] = useState(t('keywordAnalysis.countryAll'));
  const [tableTitleKeyword, setTableTitleKeyword] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const allSelected = blenderKeywords.length > 0 && selectedIds.size === blenderKeywords.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(blenderKeywords.map((k) => k.id)));
  };

  const filterButtons = [
    t('keywordAnalysis.filterAllPlatforms'),
    'Amazon',
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
              {t('keywordAnalysis.welcomeTitle', { name: localUser.name })}
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
              <DropdownItem onClick={() => addToast(t('keywordAnalysis.filterApplied'))}>
                {t('keywordAnalysis.filterBySearchVolume')}
              </DropdownItem>
              <DropdownItem onClick={() => addToast(t('keywordAnalysis.filterApplied'))}>
                {t('keywordAnalysis.filterByScore')}
              </DropdownItem>
              <DropdownItem onClick={() => addToast(t('keywordAnalysis.filterApplied'))}>
                {t('keywordAnalysis.filterHighOpportunityOnly')}
              </DropdownItem>
            </Dropdown>
            <button
              data-testid="btn-export"
              onClick={() => addToast(t('keywordAnalysis.csvGenerated'))}
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
                <span className="text-[#6C63FF]">1,275</span>{' '}
                {t('keywordAnalysis.foundKeywordsSuffix')}
                {tableTitleKeyword && (
                  <span className="ml-1 text-[#6B7280] font-normal">
                    {t('keywordAnalysis.tableTitleKeywordSuffix', { keyword: tableTitleKeyword })}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                <span>{t('keywordAnalysis.sortByRelevance')}</span>
                <ChevronDown size={14} />
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
                  ) : blenderKeywords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-sm text-[#9CA3AF]">
                        {t('keywordAnalysis.noKeywordData')}
                      </td>
                    </tr>
                  ) : (
                    blenderKeywords.map((kw, idx) => (
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
                          {kw.keyword}
                        </td>
                        {/* Search Volume */}
                        <td className="px-3 py-3 text-right font-medium text-[#1A1A2E]">
                          {kw.searchVolume.toLocaleString()}
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
                            <DifficultyBadge difficulty={kw.difficulty} labels={difficultyLabels} />
                          </div>
                        </td>
                        {/* Opportunity Score */}
                        <td className="px-3 py-3 text-center">
                          <ScoreBadge score={kw.opportunityScore} />
                        </td>
                        {/* Platform */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                            <PlatformIcon icon={kw.platformIcon} />
                            <span>{kw.platform}</span>
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
                <span>1-5 / 1,275</span>
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
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="month"
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
                      dataKey="portable"
                      stroke="#6C63FF"
                      strokeWidth={2}
                      dot={false}
                      name={t('keywordAnalysis.linePortableBlender')}
                    />
                    <Line
                      type="monotone"
                      dataKey="personal"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                      name={t('keywordAnalysis.linePersonalBlender')}
                    />
                    <Line
                      type="monotone"
                      dataKey="usb"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                      name={t('keywordAnalysis.lineUsbBlender')}
                    />
                    <Line
                      type="monotone"
                      dataKey="smoothie"
                      stroke="#EC4899"
                      strokeWidth={2}
                      dot={false}
                      name={t('keywordAnalysis.lineSmoothieBlender')}
                    />
                    <Line
                      type="monotone"
                      dataKey="mini"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={false}
                      name={t('keywordAnalysis.lineMiniBlender')}
                    />
                  </LineChart>
                </ResponsiveContainer>
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
                        {entry.value}%
                      </span>
                    </div>
                  ))}
                </div>
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
                        {t('keywordAnalysis.monthlySearch', { volume: lt.volume.toLocaleString() })}
                      </p>
                    </div>
                    <ScoreBadge score={100 - lt.difficulty} />
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
              {recommendedKeywords.map((rk, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#F8F9FF]"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-sm font-medium text-[#1A1A2E]">
                      {rk.keyword}
                    </p>
                    <p className="mt-0.5 text-xs text-[#9CA3AF]">
                      {t('keywordAnalysis.monthlySearch', { volume: rk.volume.toLocaleString() })}
                    </p>
                  </div>
                  <ScoreBadge score={rk.score} />
                </div>
              ))}
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
                  {t('keywordAnalysis.highOpportunityText')}
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Zap size={14} />
                  <span>{t('keywordAnalysis.trendAlert')}</span>
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {t('keywordAnalysis.trendAlertText')}
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Star size={14} />
                  <span>{t('keywordAnalysis.suggestedStrategy')}</span>
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {t('keywordAnalysis.strategyText')}
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
          setTimeout(() => {
            setAiMessages((prev) => [...prev, { role: 'ai', text: mockAiReply(msg) }]);
          }, 600);
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
