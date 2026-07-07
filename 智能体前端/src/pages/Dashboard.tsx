import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Zap, TrendingUp, Calculator, Hash,
  Trophy, ArrowUpRight, Bot
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import StatsCard from '../components/ui/StatsCard';
import AgentInputDock from '../components/ui/AgentInputDock';
import RobotIllustration from '../components/ui/RobotIllustration';
import { useToast } from '../components/ui/use-toast.ts';
import { dashboardApi } from '../api/dashboard';
import { api } from '../api/client';

const profitData = [
  { name: '产品成本', value: 6.50 },
  { name: '包装运费', value: 2.00 },
  { name: '平台费', value: 2.25 },
  { name: '广告费', value: 1.50 },
  { name: '利润', value: 10.26 },
];

interface OpportunityItem {
  name: string;
  growth: string;
  competition: string;
  price: string;
}

interface HotProduct {
  rank: number;
  name: string;
  sales: string;
  growth: string;
}

interface KwSuggestion {
  kw: string;
  score: number;
  difficulty: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function Dashboard({ tab }: { tab?: string }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [opportunityItems, setOpportunityItems] = useState<OpportunityItem[]>([]);
  const [hotProducts, setHotProducts] = useState<HotProduct[]>([]);
  const [kwSuggestions, setKwSuggestions] = useState<KwSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ todayOpportunities: '-', hotInsights: '-', profitEstimate: '-', kwSuggestCount: '-' });

  const opportunityRef = useRef<HTMLDivElement>(null);
  const hotProductsRef = useRef<HTMLDivElement>(null);

  // Scroll to relevant section when tab changes
  useEffect(() => {
    if (tab === 'opportunity') {
      opportunityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (tab === 'hot-products') {
      hotProductsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [tab]);

  // Fetch real data from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, oppData, hotData, trendData] = await Promise.all([
          dashboardApi.getStats().catch(() => null),
          dashboardApi.getOpportunities().catch(() => null),
          dashboardApi.getHotProducts().catch(() => null),
          dashboardApi.getTrendInsights().catch(() => null),
        ]);

        if (statsData) {
          const metrics = statsData.metrics || [];
          const metricsMap: Record<string, string> = {};
          metrics.forEach(m => { metricsMap[m.title] = String(m.value); });
          setStats({
            todayOpportunities: metricsMap['今日机会'] || '-',
            hotInsights: metricsMap['爆品洞察'] || '-',
            profitEstimate: metricsMap['利润预估'] || '-',
            kwSuggestCount: metricsMap['关键词建议'] || '-',
          });
        }

        // No fallback mock data on purpose: an API failure must be visible
        // (empty state + toast), never silently replaced by fake numbers.
        if (oppData) {
          setOpportunityItems(oppData.map(o => ({
            name: o.name,
            growth: o.growth,
            competition: o.competition,
            price: o.price,
          })));
        }

        if (hotData) {
          setHotProducts(hotData.map(h => ({
            rank: h.rank,
            name: h.name,
            sales: h.sales,
            growth: h.growth,
          })));
        }

        if (trendData && trendData.trendingKeywords) {
          setKwSuggestions(trendData.trendingKeywords.map((k, i) => ({
            kw: k.keyword,
            score: Math.max(100 - i * 10, 50),
            difficulty: i % 2 === 0 ? '中' : '低',
          })));
        }

        if (!statsData && !oppData && !hotData && !trendData) {
          addToast(t('dashboard.loadFailed', '仪表盘数据加载失败，请稍后重试'), 'error');
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        addToast(t('dashboard.loadFailed', '仪表盘数据加载失败，请稍后重试'), 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleQuickAction = (text: string) => {
    setInputValue(text);
    addToast(t('dashboard.toastFilled', { text }), 'info');
  };

  const handleSendMessage = async (message: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    try {
      const res = await api.post<{ reply: string }>('/agent-runs', { message });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.reply || t('dashboard.fallbackReply') },
      ]);
    } catch (err) {
      console.error('AI request failed:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t('dashboard.aiUnavailable') },
      ]);
    }
  };

  const quickActions = useMemo(() => [
    t('dashboard.quickActionProductResearch'),
    t('dashboard.quickActionListingGenerator'),
    t('dashboard.quickActionKeywordAnalysis'),
    t('dashboard.quickActionProfitCalc'),
    t('dashboard.quickActionTrendInsight'),
    t('dashboard.quickActionCompetition'),
  ], [t]);

  return (
    <div className="space-y-6">
      {/* Welcome Hero */}
      <div className="relative flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#F8F0FF] via-[#F0EEFF] to-[#E8F4FF] px-8 py-7 overflow-hidden min-h-[200px]">
        <div className="z-10">
          <h2 className="text-2xl font-bold text-[#1A1A2E]">{t('dashboard.welcome', { name: 'Olivia' })}</h2>
          <p className="mt-1 text-sm text-[#6B7280]">{t('dashboard.welcomeDescription')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickActions.map((btn) => (
              <button
                key={btn}
                data-testid={`quick-action-${btn}`}
                onClick={() => handleQuickAction(btn)}
                className="rounded-lg bg-white/80 border border-[#E8E8F0] px-3.5 py-1.5 text-xs font-medium text-[#4A5578] hover:bg-white hover:border-[#6C63FF] hover:text-[#6C63FF] transition-all shadow-sm"
              >
                {btn}
              </button>
            ))}
          </div>
        </div>
        <div className="z-10 shrink-0">
          <RobotIllustration size="lg" variant="welcome" />
        </div>
        {/* Background glow */}
        <div className="absolute right-20 top-5 h-40 w-40 rounded-full bg-[#6C63FF]/5 blur-3xl" />
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-4 gap-5">
        <StatsCard
          icon={<Zap size={22} />}
          value={stats.todayOpportunities}
          label={t('dashboard.todayOpportunities')}
          trend={{ value: 23, isUp: true }}
          color="#6C63FF"
        />
        <StatsCard
          icon={<TrendingUp size={22} />}
          value={stats.hotInsights}
          label={t('dashboard.hotProducts')}
          trend={{ value: 15, isUp: true }}
          color="#FF6B9D"
        />
        <StatsCard
          icon={<Calculator size={22} />}
          value={stats.profitEstimate}
          label={t('dashboard.profitEstimate')}
          trend={{ value: 12, isUp: true }}
          color="#34D399"
        />
        <StatsCard
          icon={<Hash size={22} />}
          value={stats.kwSuggestCount}
          label={t('dashboard.kwSuggestCount')}
          trend={{ value: 8, isUp: true }}
          color="#FB923C"
        />
      </div>

      {/* Second Row: Opportunities + Hot Products + Profit + Keywords */}
      <div className="grid grid-cols-4 gap-5">
        {/* 今日机会 */}
        <div ref={opportunityRef} className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('dashboard.todayOpportunities')}</h3>
            <span className="text-xs text-[#6C63FF]">{t('common.viewAll')} →</span>
          </div>
          <div className="space-y-3">
            {opportunityItems.length === 0 && (
              <p className="py-4 text-center text-xs text-[#8B93B5]">暂无数据</p>
            )}
            {opportunityItems.map((item) => (
              <div key={item.name} className="flex items-center gap-3 pb-3 border-b border-[#F0F0F8] last:border-0 last:pb-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F0EEFF] text-xs font-bold text-[#6C63FF]">
                  <Zap size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1A2E] truncate">{item.name}</p>
                  <p className="text-xs text-[#8B93B5]">{t('dashboard.opportunityItem', { competition: item.competition, price: item.price })}</p>
                </div>
                <span className="text-xs font-semibold text-[#34D399]">{item.growth}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 爆品洞察 */}
        <div ref={hotProductsRef} className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('dashboard.hotProducts')}</h3>
            <span className="text-xs text-[#6C63FF]">{t('common.viewAll')} →</span>
          </div>
          <div className="space-y-3">
            {hotProducts.length === 0 && (
              <p className="py-4 text-center text-xs text-[#8B93B5]">暂无数据</p>
            )}
            {hotProducts.map((item) => (
              <div key={item.rank} className="flex items-center gap-3 pb-3 border-b border-[#F0F0F8] last:border-0 last:pb-0">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  item.rank === 1 ? 'bg-[#FF6B9D]' : item.rank === 2 ? 'bg-[#FB923C]' : 'bg-[#4A9EFF]'
                }`}>
                  {item.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1A2E] truncate">{item.name}</p>
                  <p className="text-xs text-[#8B93B5]">{t('dashboard.monthlySales', { sales: item.sales })}</p>
                </div>
                <span className="text-xs font-semibold text-[#34D399]">{item.growth}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 利润预估 */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('dashboard.profitEstimate')}</h3>
            <span className="text-xs text-[#6C63FF]">{t('common.details')} →</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6C63FF]/20 to-[#8B7CFF]/20">
              <Calculator size={24} className="text-[#6C63FF]" />
            </div>
            <div>
              <p className="text-xs text-[#8B93B5]">便携式搅拌机</p>
              <p className="text-lg font-bold text-[#1A1A2E]">$24.99</p>
              <p className="text-xs text-[#34D399]">{t('dashboard.estimatedProfit', { profit: '$10.26' })}</p>
            </div>
          </div>
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profitData}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6C63FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#6C63FF" fill="url(#profitGrad)" strokeWidth={1.5} />
                <XAxis dataKey="name" hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 关键词建议 */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('dashboard.kwSuggestCount')}</h3>
            <span className="text-xs text-[#6C63FF]">{t('common.more')} →</span>
          </div>
          <div className="space-y-2.5">
            {kwSuggestions.length === 0 && (
              <p className="py-4 text-center text-xs text-[#8B93B5]">暂无数据</p>
            )}
            {kwSuggestions.map((item) => (
              <div key={item.kw} className="flex items-center justify-between pb-2.5 border-b border-[#F0F0F8] last:border-0 last:pb-0">
                <span className="text-sm text-[#1A1A2E]">{item.kw}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6C63FF] font-medium">{t('dashboard.score', { score: item.score })}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    item.difficulty === '低' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#FB923C]/10 text-[#FB923C]'
                  }`}>
                    {item.difficulty === '低' ? t('keywordAnalysis.competitionLow') : item.difficulty === '中' ? t('keywordAnalysis.competitionMedium') : item.difficulty === '高' ? t('keywordAnalysis.competitionHigh') : item.difficulty}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Third Row: Trend Insight + Achievement */}
      <div className="grid grid-cols-4 gap-5">
        {/* 趋势洞察 - spans 3 cols */}
        <div className="col-span-3 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1A1A2E]">{t('dashboard.trendInsights')}</h3>
            <select className="rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] bg-white">
              <option>{t('dashboard.selectRecentMonths')}</option>
              <option>{t('dashboard.selectRecentDays')}</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {/* 季节性趋势 */}
            <div>
              <h4 className="text-xs font-semibold text-[#8B93B5] uppercase mb-3">{t('dashboard.seasonalTrend')}</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-[#6B7280] mb-1">{t('dashboard.summerHot')}</p>
                  <div className="space-y-1">
                    {['便携风扇 +182%', '户外水壶 +145%', '防晒帽 +98%'].map((t) => (
                      <div key={t} className="flex items-center justify-between text-xs text-[#1A1A2E]">
                        <span>{t.split('+')[0]}</span>
                        <span className="text-[#34D399]">+{t.split('+')[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280] mb-1">{t('dashboard.giftScene')}</p>
                  <div className="space-y-1">
                    {['定制饰品 +210%', '礼品套装 +167%'].map((t) => (
                      <div key={t} className="flex items-center justify-between text-xs text-[#1A1A2E]">
                        <span>{t.split('+')[0]}</span>
                        <span className="text-[#34D399]">+{t.split('+')[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* 地区增长榜 */}
            <div>
              <h4 className="text-xs font-semibold text-[#8B93B5] uppercase mb-3">{t('dashboard.regionGrowth')}</h4>
              <div className="space-y-3">
                {[
                  { region: t('trendInsight.regionNorthAmerica'), growth: 32 },
                  { region: t('trendInsight.regionEurope'), growth: 28 },
                  { region: t('trendInsight.regionSoutheastAsia'), growth: 45 },
                  { region: t('trendInsight.regionMiddleEast'), growth: 67 },
                ].map((r) => (
                  <div key={r.region}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#1A1A2E]">{r.region}</span>
                      <span className="text-[#34D399]">+{r.growth}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#F0F0F8] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF]" style={{ width: `${r.growth}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* 飙升关键词 */}
            <div>
              <h4 className="text-xs font-semibold text-[#8B93B5] uppercase mb-3">{t('dashboard.risingKeywords')}</h4>
              <div className="space-y-2.5">
                {[
                  { kw: 'eco friendly', growth: '+156%' },
                  { kw: 'personalized', growth: '+134%' },
                  { kw: 'smart home', growth: '+112%' },
                  { kw: 'sustainable', growth: '+98%' },
                ].map((k) => (
                  <div key={k.kw} className="flex items-center justify-between pb-2 border-b border-[#F0F0F8] last:border-0 last:pb-0">
                    <span className="text-sm text-[#1A1A2E]">{k.kw}</span>
                    <span className="text-xs font-medium text-[#34D399]">{k.growth}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 成就卡 */}
        <div className="rounded-xl bg-gradient-to-br from-[#6C63FF] via-[#7B6CFF] to-[#8B7CFF] p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Trophy size={100} />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={28} className="text-[#FFD700]" />
            <span className="text-sm font-semibold text-white/90">{t('dashboard.monthAchievement')}</span>
          </div>
          <p className="text-white/90 text-sm leading-relaxed mt-1">
            {t('dashboard.achievementDesc', { growth: '28%' })}
          </p>
          <div className="mt-auto pt-3 flex items-center gap-1 text-xs text-white/70">
            <ArrowUpRight size={14} />
            <span>{t('dashboard.keepGrowing')}</span>
          </div>
        </div>
      </div>

      {/* AI Conversation (real /agent-runs replies) */}
      {messages.length > 0 && (
        <div className="space-y-3" data-testid="ai-conversation">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              data-testid={`message-${msg.role}-${idx}`}
            >
              <div
                className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#6C63FF] text-white rounded-br-sm'
                    : 'bg-[#F0EEFF] text-[#1A1A2E] rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-[#8B93B5]">
                    <Bot size={14} />
                    <span>{t('dashboard.aiAssistant')}</span>
                  </div>
                )}
                <p>{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Input Dock */}
      <AgentInputDock
        placeholder={t('dashboard.inputPlaceholder')}
        value={inputValue}
        onValueChange={setInputValue}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

export default Dashboard;
