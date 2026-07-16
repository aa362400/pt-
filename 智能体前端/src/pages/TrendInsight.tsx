import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ExternalLink, TrendingUp, Sparkles } from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import AgentInputDock from '../components/ui/AgentInputDock';
import RobotIllustration from '../components/ui/RobotIllustration';
import { useToast } from '../components/ui/use-toast.ts';
import { useTranslation } from 'react-i18next';
import { trendsApi, type TrendInsight as TrendRecord } from '../api/trends';

interface TrendPoint {
  date: string;
  value: number;
}

interface TopCategory {
  name: string;
  growth: number | null;
  vol: string;
  color: string;
  source: string | null;
  evidenceUrl: string | null;
  fetchedAt: string | null;
}

interface SeasonEntry {
  label: string;
  growth: string;
  detail: string;
}

interface TabData {
  trendData: TrendPoint[];
  topCategories: TopCategory[];
  seasonOpp: SeasonEntry[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const trendTabKeys = ['欧美市场', '节日趋势', '礼品场景', '定制元素'];
const chartColors = ['#6C63FF', '#FF6B9D', '#34D399', '#FB923C', '#4A9EFF'];
const DEFAULT_MARKETPLACE = 'ozon';
const DEFAULT_TIMEFRAME = '90d';

const emptyTabData = (): TabData => ({
  trendData: [],
  topCategories: [],
  seasonOpp: [],
});

const createEmptyTabs = () =>
  trendTabKeys.reduce<Record<string, TabData>>((acc, key) => {
    acc[key] = emptyTabData();
    return acc;
  }, {});

const formatGrowth = (value: number | null) => {
  if (value === null) return '未验证';
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
};

const clampBarWidth = (value: number) => `${Math.max(4, Math.min(100, Math.abs(value)))}%`;

const formatEvidenceTime = (value: string | null) => {
  if (!value) return '时间未返回';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
};

const buildTrendPoints = (items: TrendRecord[]): TrendPoint[] => {
  const source = items.find((item) => item.dataPoints.length > 0);
  if (!source) return [];
  return source.dataPoints
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      date: point.date,
      value: point.value,
    }));
};

const buildTabData = (items: TrendRecord[]): TabData => ({
  trendData: buildTrendPoints(items),
  topCategories: items.slice(0, 5).map((item, index) => ({
    name: item.title,
    growth: item.growth,
    vol: item.volume || '后端未返回',
    color: chartColors[index] ?? chartColors[0],
    source: item.source,
    evidenceUrl: item.evidence[0]?.url ?? null,
    fetchedAt: item.evidence[0]?.fetchedAt ?? null,
  })),
  seasonOpp: items
    .filter((item) => item.description.trim().length > 0)
    .slice(0, 4)
    .map((item) => ({
      label: item.title || item.category,
      growth: formatGrowth(item.growth),
      detail: item.description,
    })),
});

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] px-4 py-6 text-center text-xs leading-relaxed text-[#8B93B5]">
      {children}
    </div>
  );
}

function TrendInsight() {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('欧美市场');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tabData, setTabData] = useState<Record<string, TabData>>(createEmptyTabs);
  const [loading, setLoading] = useState(true);

  const tabs = useMemo(
    () =>
      trendTabKeys.map((key) => ({
        key,
        label:
          key === '欧美市场'
            ? t('trendInsight.tabUsEurope')
            : key === '节日趋势'
              ? t('trendInsight.tabHolidayTrend')
              : key === '礼品场景'
                ? t('trendInsight.tabGiftScene')
                : t('trendInsight.tabCustomElements'),
      })),
    [t],
  );
  const current = tabData[activeTab] ?? emptyTabData();

  useEffect(() => {
    let cancelled = false;

    async function fetchTrends() {
      setLoading(true);
      try {
        const insights = await trendsApi.list({
          limit: 20,
          category: activeTab,
          marketplace: DEFAULT_MARKETPLACE,
          timeframe: DEFAULT_TIMEFRAME,
        });
        if (cancelled) return;
        setTabData((prev) => ({
          ...prev,
          [activeTab]: buildTabData(insights.items ?? []),
        }));
      } catch (err) {
        if (!cancelled) {
          addToast(err instanceof Error ? err.message : t('trendInsight.loadFailed'), 'error');
          setTabData((prev) => ({
            ...prev,
            [activeTab]: emptyTabData(),
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchTrends();
    return () => {
      cancelled = true;
    };
  }, [activeTab, addToast, t]);

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await trendsApi.analyze({
        category: text,
        marketplace: DEFAULT_MARKETPLACE,
        timeframe: DEFAULT_TIMEFRAME,
      });
      const analyzed = result.items.slice(0, 20);
      setTabData((prev) => ({
        ...prev,
        [activeTab]: buildTabData(analyzed),
      }));

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            result.count > 0
              ? `已通过 /trends/analyze 调用真实趋势智能体，后端保存并返回 ${result.count} 条趋势洞察。`
              : '真实趋势智能体调用完成，但后端返回 0 条趋势洞察；页面未填充本地模拟结果。',
        },
      ]);
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('trendInsight.loadFailed'), 'error');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '趋势智能体调用失败，页面没有生成本地假结果。',
        },
      ]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{t('trendInsight.title')}</h2>
          <p className="mt-1 text-sm text-[#6B7280]">{t('trendInsight.subtitle')}</p>
        </div>
        <div className="relative">
          <RobotIllustration size="md" variant="working" />
          <div className="absolute -right-2 -top-2 whitespace-nowrap rounded-full border border-[#E8E8F0] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6C63FF] shadow-sm">
            {t('trendInsight.badgeText')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`trend-tab-${tab.key}`}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#6C63FF] text-white'
                : 'border border-[#E8E8F0] bg-white text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#E8E8F0] bg-white px-4 py-3 text-xs leading-relaxed text-[#6B7280] shadow-sm">
        当前标签会读取真实后端 <span className="font-medium text-[#1A1A2E]">GET /trends?category={activeTab}&marketplace={DEFAULT_MARKETPLACE}</span>。
        如果库里没有趋势记录，后端会自动调用趋势智能体并使用联网搜索证据；没有后端字段的图表仍显示未接入，不使用本地静态趋势。
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <ChartCard title={t('trendInsight.trendOverview')} className="xl:col-span-5">
          <div className="h-52">
            {loading ? (
              <EmptyState>正在调用真实趋势智能体和联网搜索，等待后端返回趋势样本...</EmptyState>
            ) : current.trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={current.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F8" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#6C63FF" strokeWidth={2} dot={false} name={t('trendInsight.searchHeat')} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState>后端趋势记录没有返回 data.dataPoints，未绘制本地模拟曲线。</EmptyState>
            )}
          </div>
        </ChartCard>

        <ChartCard title={t('trendInsight.seasonOpportunityMap')} className="xl:col-span-4">
          {loading ? (
            <EmptyState>正在读取智能体返回的 seasonality 字段...</EmptyState>
          ) : current.seasonOpp.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {current.seasonOpp.map((entry) => (
                <div key={`${entry.label}-${entry.detail}`} className="rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-[#1A1A2E]">{entry.label}</p>
                    <p className="shrink-0 text-xs font-bold text-[#34D399]">{entry.growth}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#8B93B5]">{entry.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>后端未返回 data.seasonality 样本，未展示本地季节机会地图。</EmptyState>
          )}
        </ChartCard>

        <ChartCard title={t('trendInsight.risingCategoriesTop5')} className="xl:col-span-3">
          {loading ? (
            <EmptyState>正在读取真实趋势智能体榜单...</EmptyState>
          ) : current.topCategories.length > 0 ? (
            <div className="space-y-3">
              {current.topCategories.map((cat, i) => (
                <div key={`${cat.name}-${i}`} className="flex items-center gap-3">
                  <span className="w-4 text-xs font-bold text-[#8B93B5]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#1A1A2E]">{cat.name}</p>
                    {cat.evidenceUrl ? (
                      <a
                        href={cat.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[10px] text-[#2563EB] hover:underline"
                      >
                        {cat.source ?? 'Ozon'} · {formatEvidenceTime(cat.fetchedAt)}
                        <ExternalLink size={10} />
                      </a>
                    ) : null}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F0F0F8]">
                      {cat.growth !== null ? (
                        <div className="h-full rounded-full" style={{ width: clampBarWidth(cat.growth), backgroundColor: cat.color }} />
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[#34D399]">{formatGrowth(cat.growth)}</p>
                    <p className="text-[10px] text-[#9CA3AF]">{cat.vol}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>后端没有返回当前标签的趋势记录，未展示本地 Top 5。</EmptyState>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <ChartCard title={t('trendInsight.socialHotTopics')} className="xl:col-span-4">
          <EmptyState>后端 /trends 合同不包含社媒平台、话题播放量字段，未展示模拟社媒热词。</EmptyState>
        </ChartCard>

        <ChartCard title={t('trendInsight.sceneInsights')} className="xl:col-span-4">
          <EmptyState>后端 /trends 合同不包含消费场景占比字段，未展示模拟饼图。</EmptyState>
        </ChartCard>

        <ChartCard title={t('trendInsight.regionGrowthRanking')} className="xl:col-span-4">
          <EmptyState>后端 /trends 合同不包含区域增长字段，未展示模拟地区排行榜。</EmptyState>
        </ChartCard>
      </div>

      {messages.length > 0 && (
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          {messages.map((msg, i) => (
            <div key={`${msg.role}-${i}`} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6C63FF] text-white">
                  <Sparkles size={16} />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#6C63FF] text-white'
                    : 'bg-[#F8F9FF] text-[#1A1A2E]'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8E8F0] text-[#6B7280]">
                  <TrendingUp size={16} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AgentInputDock
        placeholder={t('trendInsight.aiPlaceholder')}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

export default TrendInsight;
