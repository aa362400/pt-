import { TrendingUp, Globe, Target, DollarSign, Activity, Star, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PlaceholderPageProps {
  pageTitle: string;
  description?: string;
  tags?: string[];
}

function UsersIcon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

interface MetricItem {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
}

const mockMetrics: Record<string, MetricItem[]> = {
  competition: [
    { label: '监控竞品数', value: '128', change: '+12', icon: <Target size={18} /> },
    { label: '平均价格差', value: '-$3.50', change: '-5%', icon: <DollarSign size={18} /> },
    { label: '竞品上新数', value: '45', change: '+18%', icon: <ShoppingBag size={18} /> },
    { label: '市场份额', value: '8.5%', change: '+0.8%', icon: <Activity size={18} /> },
  ],
  market: [
    { label: '市场规模', value: '$128B', change: '+12.5%', icon: <Globe size={18} /> },
    { label: '活跃卖家', value: '245万', change: '+8.3%', icon: <UsersIcon size={18} /> },
    { label: '平均客单价', value: '$38.50', change: '+3.2%', icon: <DollarSign size={18} /> },
    { label: '增长率', value: '15.8%', change: '+2.1%', icon: <TrendingUp size={18} /> },
  ],
};

interface RegionItem {
  name?: string;
  region?: string;
  share?: number;
  price?: string;
  rating?: number;
  trend?: string;
  growth?: string;
  volume?: string;
  flag?: string;
}

const regionData: Record<string, RegionItem[]> = {
  competition: [
    { name: 'SmartHome Inc.', share: 18, price: '$29.99', rating: 4.5, trend: 'up' },
    { name: 'TechGadget Co.', share: 15, price: '$34.99', rating: 4.2, trend: 'up' },
    { name: 'GlobalTrade Ltd', share: 12, price: '$24.99', rating: 4.0, trend: 'down' },
    { name: 'AmazonBasics', share: 22, price: '$19.99', rating: 4.6, trend: 'up' },
  ],
  market: [
    { region: '北美', growth: '+18.5%', volume: '$42.5B', flag: '🇺🇸' },
    { region: '欧洲', growth: '+12.3%', volume: '$28.2B', flag: '🇪🇺' },
    { region: '东南亚', growth: '+25.6%', volume: '$15.8B', flag: '🌏' },
    { region: '中东', growth: '+32.1%', volume: '$8.9B', flag: '🌍' },
  ],
};

const pageKeyMap: Record<string, string> = {
  competition: 'competition',
  market: 'market',
};

function getPageKey(pageTitle: string): string {
  const lower = pageTitle.toLowerCase();
  if (lower.includes('competition') || lower.includes('竞品')) return 'competition';
  if (lower.includes('market') || lower.includes('市场')) return 'market';
  return 'competition';
}

function PlaceholderPage({ pageTitle, description, tags }: PlaceholderPageProps) {
  const { t } = useTranslation();
  const key = getPageKey(pageTitle);
  const metrics = mockMetrics[key] || [];
  const regionItems = regionData[key] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{pageTitle}</h2>
          {description && <p className="text-sm text-[#6B7280] mt-1">{description}</p>}
        </div>
      </div>

      {/* Quick tags */}
      {tags && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-lg bg-[#F0EEFF] px-3 py-1.5 text-xs font-medium text-[#6C63FF]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Metrics */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-4 gap-5">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#8B93B5]">{m.label}</span>
                <span className="text-[#6C63FF]">{m.icon}</span>
              </div>
              <p className="text-2xl font-bold text-[#1A1A2E]">{m.value}</p>
              <p className="text-xs text-[#34D399] mt-1">{m.change}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data table */}
      <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E8E8F0] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#1A1A2E]">
            {key === 'competition' ? t('productResearch.capabilityCompetitionAnalysisDesc') : t('productResearch.capabilityMarketOverview')}
          </h3>
        </div>
        <div className="divide-y divide-[#F0F0F8]">
          {regionItems.map((item: RegionItem, idx: number) => (
            <div key={idx} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                {item.flag && <span className="text-lg">{item.flag}</span>}
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">{item.name || item.region}</p>
                  {item.price && <p className="text-xs text-[#8B93B5]">{t('productResearch.avgPrice')} {item.price}</p>}
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                {item.share !== undefined && <span className="text-[#6B7280]">{t('productResearch.marketSize')} {item.share}%</span>}
                {item.rating && (
                  <span className="flex items-center gap-1 text-[#FFB020]">
                    <Star size={14} fill="currentColor" /> {item.rating}
                  </span>
                )}
                {item.growth && <span className="text-[#34D399] font-medium">{item.growth}</span>}
                {item.volume && <span className="text-[#8B93B5]">{item.volume}</span>}
                {item.trend && (
                  <span className={item.trend === 'up' ? 'text-[#34D399]' : 'text-[#FF5A6A]'}>
                    {item.trend === 'up' ? '↑ ' + t('trendInsight.trendUp') : '↓ ' + t('trendInsight.trendDown')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PlaceholderPage;
