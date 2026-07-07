import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingUp, Sparkles } from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import AgentInputDock from '../components/ui/AgentInputDock';
import RobotIllustration from '../components/ui/RobotIllustration';
import { useToast } from '../components/ui/use-toast.ts';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '../api/dashboard';

// ── Types ──
interface TrendPoint {
  date: string;
  searchHeat: number;
  salesGrowth: number;
}

interface TopCategory {
  name: string;
  growth: number;
  vol: string;
  color: string;
}

interface SceneEntry {
  name: string;
  value: number;
  color: string;
}

interface RegionEntry {
  region: string;
  growth: number;
  volume: string;
}

interface HotTopic {
  name: string;
  platform: string;
  views: string;
  color: string;
}

interface TabData {
  trendData: TrendPoint[];
  topCategories: TopCategory[];
  sceneData: SceneEntry[];
  regions: RegionEntry[];
  hotTopics: HotTopic[];
  seasonOpp: { region: string; growth: string }[];
}

// ── Default static data as fallback ──
const defaultTabData: Record<string, TabData> = {
  '欧美市场': {
    trendData: [
      { date: '1月', searchHeat: 65, salesGrowth: 42 },
      { date: '2月', searchHeat: 72, salesGrowth: 48 },
      { date: '3月', searchHeat: 78, salesGrowth: 55 },
      { date: '4月', searchHeat: 85, salesGrowth: 62 },
      { date: '5月', searchHeat: 82, salesGrowth: 70 },
      { date: '6月', searchHeat: 90, salesGrowth: 78 },
      { date: '7月', searchHeat: 95, salesGrowth: 85 },
      { date: '8月', searchHeat: 88, salesGrowth: 80 },
      { date: '9月', searchHeat: 92, salesGrowth: 88 },
      { date: '10月', searchHeat: 96, salesGrowth: 92 },
      { date: '11月', searchHeat: 100, salesGrowth: 98 },
      { date: '12月', searchHeat: 98, salesGrowth: 100 },
    ],
    topCategories: [
      { name: '便携式家电', growth: 156, vol: '12.5万', color: '#6C63FF' },
      { name: '家居装饰', growth: 134, vol: '9.8万', color: '#FF6B9D' },
      { name: '健身器材', growth: 112, vol: '8.2万', color: '#34D399' },
      { name: '智能穿戴', growth: 98, vol: '7.6万', color: '#FB923C' },
      { name: '宠物用品', growth: 87, vol: '6.4万', color: '#4A9EFF' },
    ],
    sceneData: [
      { name: '家居日用', value: 35, color: '#6C63FF' },
      { name: '个人护理', value: 25, color: '#FF6B9D' },
      { name: '户外运动', value: 20, color: '#34D399' },
      { name: '智能科技', value: 12, color: '#FB923C' },
      { name: '其他', value: 8, color: '#9CA3AF' },
    ],
    regions: [
      { region: '🇺🇸 美国', growth: 32, volume: '$4.2B' },
      { region: '🇬🇧 英国', growth: 28, volume: '$2.8B' },
      { region: '🇩🇪 德国', growth: 25, volume: '$2.1B' },
      { region: '🇫🇷 法国', growth: 22, volume: '$1.8B' },
      { region: '🇨🇦 加拿大', growth: 35, volume: '$1.5B' },
    ],
    hotTopics: [
      { name: '#SummerDIY', platform: 'TikTok', views: '2.5M', color: '#000' },
      { name: '#HomeDecor', platform: 'Instagram', views: '1.8M', color: '#E4405F' },
      { name: '#GadgetReview', platform: 'YouTube', views: '1.2M', color: '#FF0000' },
    ],
    seasonOpp: [
      { region: '欧洲', growth: '+25%' },
      { region: '北美', growth: '+32%' },
      { region: '中东', growth: '+67%' },
      { region: '拉美', growth: '+45%' },
    ],
  },
  '节日趋势': {
    trendData: [
      { date: '1月', searchHeat: 45, salesGrowth: 30 },
      { date: '2月', searchHeat: 80, salesGrowth: 65 },
      { date: '3月', searchHeat: 55, salesGrowth: 40 },
      { date: '4月', searchHeat: 50, salesGrowth: 38 },
      { date: '5月', searchHeat: 60, salesGrowth: 50 },
      { date: '6月', searchHeat: 70, salesGrowth: 58 },
      { date: '7月', searchHeat: 75, salesGrowth: 62 },
      { date: '8月', searchHeat: 65, salesGrowth: 55 },
      { date: '9月', searchHeat: 85, salesGrowth: 72 },
      { date: '10月', searchHeat: 95, salesGrowth: 90 },
      { date: '11月', searchHeat: 100, salesGrowth: 98 },
      { date: '12月', searchHeat: 98, salesGrowth: 100 },
    ],
    topCategories: [
      { name: '圣诞装饰', growth: 210, vol: '18.2万', color: '#FF6B9D' },
      { name: '礼品套装', growth: 185, vol: '15.6万', color: '#6C63FF' },
      { name: '节日服饰', growth: 145, vol: '11.3万', color: '#34D399' },
      { name: '派对用品', growth: 120, vol: '9.1万', color: '#FB923C' },
      { name: '贺卡/包装', growth: 95, vol: '7.8万', color: '#4A9EFF' },
    ],
    sceneData: [
      { name: '圣诞', value: 42, color: '#FF6B9D' },
      { name: '情人节', value: 28, color: '#6C63FF' },
      { name: '万圣节', value: 18, color: '#FB923C' },
      { name: '感恩节', value: 8, color: '#34D399' },
      { name: '其他', value: 4, color: '#9CA3AF' },
    ],
    regions: [
      { region: '🇺🇸 美国', growth: 45, volume: '$6.8B' },
      { region: '🇬🇧 英国', growth: 38, volume: '$3.2B' },
      { region: '🇩🇪 德国', growth: 32, volume: '$2.5B' },
      { region: '🇫🇷 法国', growth: 30, volume: '$2.0B' },
      { region: '🇨🇦 加拿大', growth: 42, volume: '$1.8B' },
    ],
    hotTopics: [
      { name: '#ChristmasGifts', platform: 'TikTok', views: '8.2M', color: '#FF0000' },
      { name: '#HolidayDecor', platform: 'Instagram', views: '5.6M', color: '#E4405F' },
      { name: '#GiftIdeas', platform: 'Pinterest', views: '4.1M', color: '#E60023' },
    ],
    seasonOpp: [
      { region: '圣诞季', growth: '+58%' },
      { region: '情人节', growth: '+42%' },
      { region: '万圣节', growth: '+35%' },
      { region: '黑五网一', growth: '+72%' },
    ],
  },
  '礼品场景': {
    trendData: [
      { date: '1月', searchHeat: 55, salesGrowth: 40 },
      { date: '2月', searchHeat: 88, salesGrowth: 72 },
      { date: '3月', searchHeat: 62, salesGrowth: 48 },
      { date: '4月', searchHeat: 58, salesGrowth: 45 },
      { date: '5月', searchHeat: 72, salesGrowth: 60 },
      { date: '6月', searchHeat: 78, salesGrowth: 68 },
      { date: '7月', searchHeat: 82, salesGrowth: 72 },
      { date: '8月', searchHeat: 70, salesGrowth: 62 },
      { date: '9月', searchHeat: 85, salesGrowth: 78 },
      { date: '10月', searchHeat: 92, salesGrowth: 88 },
      { date: '11月', searchHeat: 98, salesGrowth: 95 },
      { date: '12月', searchHeat: 100, salesGrowth: 100 },
    ],
    topCategories: [
      { name: '定制礼品', growth: 178, vol: '14.5万', color: '#6C63FF' },
      { name: '礼盒套装', growth: 156, vol: '12.2万', color: '#FF6B9D' },
      { name: '个性化饰品', growth: 132, vol: '10.1万', color: '#34D399' },
      { name: '体验礼券', growth: 98, vol: '7.5万', color: '#FB923C' },
      { name: '高端礼品', growth: 85, vol: '6.8万', color: '#4A9EFF' },
    ],
    sceneData: [
      { name: '生日礼品', value: 38, color: '#FF6B9D' },
      { name: '节日送礼', value: 30, color: '#6C63FF' },
      { name: '商务礼品', value: 18, color: '#34D399' },
      { name: '情侣礼品', value: 10, color: '#FB923C' },
      { name: '其他', value: 4, color: '#9CA3AF' },
    ],
    regions: [
      { region: '🇺🇸 美国', growth: 36, volume: '$5.5B' },
      { region: '🇬🇧 英国', growth: 30, volume: '$3.0B' },
      { region: '🇯🇵 日本', growth: 28, volume: '$2.4B' },
      { region: '🇩🇪 德国', growth: 26, volume: '$2.2B' },
      { region: '🇨🇦 加拿大', growth: 38, volume: '$1.6B' },
    ],
    hotTopics: [
      { name: '#GiftGuide', platform: 'TikTok', views: '6.8M', color: '#000' },
      { name: '#GiftWrapping', platform: 'Instagram', views: '3.2M', color: '#E4405F' },
      { name: '#Unboxing', platform: 'YouTube', views: '4.5M', color: '#FF0000' },
    ],
    seasonOpp: [
      { region: '生日礼品', growth: '+38%' },
      { region: '节日送礼', growth: '+45%' },
      { region: '商务礼品', growth: '+28%' },
      { region: '婚庆礼品', growth: '+52%' },
    ],
  },
  '定制元素': {
    trendData: [
      { date: '1月', searchHeat: 40, salesGrowth: 28 },
      { date: '2月', searchHeat: 48, salesGrowth: 35 },
      { date: '3月', searchHeat: 55, salesGrowth: 42 },
      { date: '4月', searchHeat: 62, salesGrowth: 50 },
      { date: '5月', searchHeat: 70, salesGrowth: 58 },
      { date: '6月', searchHeat: 78, salesGrowth: 65 },
      { date: '7月', searchHeat: 85, salesGrowth: 72 },
      { date: '8月', searchHeat: 82, salesGrowth: 75 },
      { date: '9月', searchHeat: 88, salesGrowth: 80 },
      { date: '10月', searchHeat: 92, salesGrowth: 88 },
      { date: '11月', searchHeat: 96, salesGrowth: 92 },
      { date: '12月', searchHeat: 100, salesGrowth: 98 },
    ],
    topCategories: [
      { name: '定制印花服饰', growth: 198, vol: '16.2万', color: '#6C63FF' },
      { name: '字母/名字饰品', growth: 165, vol: '13.5万', color: '#FF6B9D' },
      { name: '定制家居装饰', growth: 142, vol: '11.8万', color: '#34D399' },
      { name: '定制手机壳', growth: 115, vol: '9.2万', color: '#FB923C' },
      { name: '定制礼品包装', growth: 92, vol: '7.1万', color: '#4A9EFF' },
    ],
    sceneData: [
      { name: '个性化礼品', value: 40, color: '#6C63FF' },
      { name: '品牌定制', value: 28, color: '#FF6B9D' },
      { name: '婚礼定制', value: 18, color: '#34D399' },
      { name: '企业周边', value: 10, color: '#FB923C' },
      { name: '其他', value: 4, color: '#9CA3AF' },
    ],
    regions: [
      { region: '🇺🇸 美国', growth: 42, volume: '$4.8B' },
      { region: '🇬🇧 英国', growth: 35, volume: '$2.6B' },
      { region: '🇩🇪 德国', growth: 30, volume: '$2.0B' },
      { region: '🇫🇷 法国', growth: 28, volume: '$1.6B' },
      { region: '🇦🇺 澳大利亚', growth: 40, volume: '$1.2B' },
    ],
    hotTopics: [
      { name: '#CustomGifts', platform: 'TikTok', views: '4.2M', color: '#000' },
      { name: '#Personalized', platform: 'Instagram', views: '3.8M', color: '#E4405F' },
      { name: '#DIYCustom', platform: 'YouTube', views: '2.9M', color: '#FF0000' },
    ],
    seasonOpp: [
      { region: '服饰定制', growth: '+55%' },
      { region: '饰品定制', growth: '+48%' },
      { region: '家居定制', growth: '+35%' },
      { region: '数码定制', growth: '+42%' },
    ],
  },
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

	function TrendInsight() {
	  const { addToast } = useToast();
	  const { t } = useTranslation();
	  const [activeTab, setActiveTab] = useState('欧美市场');
	  const [messages, setMessages] = useState<ChatMessage[]>([]);
	  const [tabData, setTabData] = useState<Record<string, TabData>>(defaultTabData);
	  const [loading, setLoading] = useState(true);

	const tabKeys = ['欧美市场', '节日趋势', '礼品场景', '定制元素'];
	  const tabs = useMemo(() => tabKeys.map((key) => ({
	    key,
	    label: key === '欧美市场' ? t('trendInsight.tabUsEurope')
	      : key === '节日趋势' ? t('trendInsight.tabHolidayTrend')
	      : key === '礼品场景' ? t('trendInsight.tabGiftScene')
	      : t('trendInsight.tabCustomElements'),
	  })), [t]);
	  const current = tabData[activeTab];

  useEffect(() => {
    let cancelled = false;
    async function fetchTrends() {
      try {
        const insights = await dashboardApi.getTrendInsights();
        if (cancelled) return;

        // Merge API data into the default tab data structure
        setTabData((prev) => {
          const updated = { ...prev };

          // Update region growth data across all tabs with API data if available
          if (insights.regionGrowth?.length > 0) {
            Object.keys(updated).forEach((tabKey) => {
              const tab = { ...updated[tabKey] };
              tab.regions = tab.regions.map((r, idx) => {
                const apiRegion = insights.regionGrowth[idx];
                return apiRegion ? { ...r, growth: apiRegion.growth } : r;
              });
              updated[tabKey] = tab;
            });
          }

          // Update seasonal data: map to first tab's seasonOpp
          if (insights.seasonal?.length > 0) {
            Object.keys(updated).forEach((tabKey, tabIdx) => {
              const tab = { ...updated[tabKey] };
              const seasonal = insights.seasonal[tabIdx] ?? insights.seasonal[0];
              if (seasonal?.items) {
                tab.seasonOpp = seasonal.items.map((item) => ({
                  region: item.name,
                  growth: item.growth,
                }));
              }
              updated[tabKey] = tab;
            });
          }

          return updated;
        });
      } catch (err: any) {
        if (!cancelled) {
	          addToast(err?.message ?? t('trendInsight.loadFailed'), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTrends();
    return () => { cancelled = true; };
  }, []);

	  const handleSendMessage = (text: string) => {
	    const userMsg: ChatMessage = { role: 'user', content: text };
	    const activeLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? activeTab;
	    const reply: ChatMessage = {
	      role: 'assistant',
	      content: t('trendInsight.aiTemplateReply', {
	        tab: activeLabel,
	        query: text,
	        cat1: current.topCategories[0].name,
	        cat2: current.topCategories[1].name,
	        growth1: current.topCategories[0].growth,
	        growth2: current.topCategories[1].growth,
	        region: current.regions[0].region,
	        volume: current.regions[0].volume,
	      }),
    };
    setMessages((prev) => [...prev, userMsg, reply]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{t('trendInsight.title')}</h2>
          <p className="text-sm text-[#6B7280] mt-1">{t('trendInsight.subtitle')}</p>
        </div>
        <div className="relative">
          <RobotIllustration size="md" variant="working" />
          <div className="absolute -top-2 -right-2 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#6C63FF] whitespace-nowrap">
            {t('trendInsight.badgeText')}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`trend-tab-${tab.key}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#6C63FF] text-white'
                : 'bg-white border border-[#E8E8F0] text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* First Row: 3 cards */}
      <div className="grid grid-cols-12 gap-5">
        {/* Trend Overview */}
        <ChartCard title={t('trendInsight.trendOverview')} className="col-span-5" action={
          <select className="rounded-lg border border-[#E8E8F0] px-2.5 py-1 text-xs text-[#4A5578] bg-white">
            <option>{t('trendInsight.last30Days')}</option>
            <option>{t('trendInsight.last12Months')}</option>
          </select>
        }>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={current.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F8" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="searchHeat" stroke="#6C63FF" strokeWidth={2} dot={false} name={t('trendInsight.searchHeat')} />
                <Line type="monotone" dataKey="salesGrowth" stroke="#34D399" strokeWidth={2} dot={false} name={t('trendInsight.salesGrowth')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Season Opp Map */}
        <ChartCard title={t('trendInsight.seasonOpportunityMap')} className="col-span-4">
          <div className="relative h-52 flex items-center justify-center">
            {/* World map dots pattern */}
            <div className="absolute inset-0 opacity-[0.03]" 
              style={{
                backgroundImage: 'radial-gradient(circle at 20% 30%, #6C63FF 1px, transparent 1px), radial-gradient(circle at 50% 40%, #6C63FF 1px, transparent 1px), radial-gradient(circle at 80% 50%, #6C63FF 1px, transparent 1px)',
                backgroundSize: '40px 40px, 60px 60px, 50px 50px'
              }} 
            />
            <div className="grid grid-cols-2 gap-3 z-10">
              {current.seasonOpp.map((r) => (
                <div key={r.region} className="rounded-lg bg-white/90 border border-[#E8E8F0] px-3 py-2 text-center shadow-sm">
                  <p className="text-xs text-[#6B7280]">{r.region}</p>
                  <p className="text-sm font-bold text-[#34D399]">{r.growth}</p>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Top 5 Categories */}
        <ChartCard title={t('trendInsight.risingCategoriesTop5')} className="col-span-3">
          <div className="space-y-3">
            {current.topCategories.map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-[#8B93B5]">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1A1A2E] truncate">{cat.name}</p>
                  <div className="h-1.5 mt-1 rounded-full bg-[#F0F0F8] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${cat.growth / 1.56}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[#34D399]">+{cat.growth}%</p>
                  <p className="text-[10px] text-[#9CA3AF]">{cat.vol}</p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Second Row: 3 cards */}
      <div className="grid grid-cols-12 gap-5">
        {/* Social Hot Topics */}
        <ChartCard title={t('trendInsight.socialHotTopics')} className="col-span-4">
          <div className="grid grid-cols-3 gap-3">
            {current.hotTopics.map((topic) => (
              <div key={topic.name} className="rounded-xl bg-[#F8F9FF] p-3 text-center">
                <div className="flex h-8 w-full items-center justify-center rounded-lg mb-2" style={{ backgroundColor: `${topic.color}10` }}>
                  <span className="text-xs font-bold" style={{ color: topic.color }}>{topic.platform}</span>
                </div>
                <p className="text-xs font-medium text-[#1A1A2E] mb-1 truncate">{topic.name}</p>
                <p className="text-[10px] text-[#8B93B5]">{t('trendInsight.views', { count: topic.views })}</p>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Scene Insights */}
        <ChartCard title={t('trendInsight.sceneInsights')} className="col-span-4">
          <div className="flex items-center">
            <div className="h-36 w-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={current.sceneData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
                    {current.sceneData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="ml-3 space-y-2">
              {current.sceneData.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-[#6B7280]">{s.name}</span>
                  <span className="text-xs text-[#1A1A2E] font-medium">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Region Growth */}
        <ChartCard title={t('trendInsight.regionGrowthRanking')} className="col-span-4">
          <div className="space-y-3">
            {current.regions.map((r) => (
              <div key={r.region}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#1A1A2E]">{r.region}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#34D399] font-medium">+{r.growth}%</span>
                    <span className="text-[#9CA3AF]">{r.volume}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[#F0F0F8] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF]" style={{ width: `${r.growth}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Chat Messages */}
      {messages.length > 0 && (
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm space-y-3 max-h-64 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6C63FF] text-white">
                  <Sparkles size={16} />
                </div>
              )}
              <div
                className={`rounded-xl px-4 py-2.5 max-w-[80%] text-sm ${
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

      {/* AI Input */}
      <AgentInputDock
        placeholder={t('trendInsight.aiPlaceholder')}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

export default TrendInsight;
