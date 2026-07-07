import { api } from './client';
import type { MetricData } from '../types';

export interface DashboardStats {
  metrics: MetricData[];
  opportunities: Array<{
    name: string;
    growth: string;
    competition: string;
    price: string;
  }>;
  hotProducts: Array<{
    rank: number;
    name: string;
    sales: string;
    growth: string;
  }>;
  keywordSuggestions: Array<{
    keyword: string;
    score: number;
    difficulty: string;
  }>;
  trendInsights: {
    seasonal: Array<{ label: string; items: Array<{ name: string; growth: string }> }>;
    regionGrowth: Array<{ region: string; growth: number }>;
    trendingKeywords: Array<{ keyword: string; growth: string }>;
  };
}

export const dashboardApi = {
  /** 仪表盘聚合数据 */
  getStats: (params?: { period?: string }) =>
    api.get<DashboardStats>('/dashboard/stats', { params }),

  /** 关键指标 */
  getMetrics: (params?: { period?: string }) =>
    api.get<MetricData[]>('/dashboard/metrics', { params }),

  /** 今日机会 */
  getOpportunities: () =>
    api.get<DashboardStats['opportunities']>('/dashboard/opportunities'),

  /** 爆品洞察 */
  getHotProducts: () =>
    api.get<DashboardStats['hotProducts']>('/dashboard/hot-products'),

  /** 趋势洞察 */
  getTrendInsights: () =>
    api.get<DashboardStats['trendInsights']>('/dashboard/trend-insights'),
};
