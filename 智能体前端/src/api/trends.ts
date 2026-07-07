import { api } from './client';
import type { TrendDataPoint, TrendCategory, HotTopic, RegionGrowth } from '../types';

export interface TrendInsight {
  id: string;
  title: string;
  description: string;
  category: string;
  growth: number;
  volume: string;
  color: string;
  dataPoints: TrendDataPoint[];
  createdAt: string;
}

export interface TrendDetail extends TrendInsight {
  categories: TrendCategory[];
  hotTopics: HotTopic[];
  regionGrowth: RegionGrowth[];
  relatedKeywords: Array<{ keyword: string; growth: string }>;
}

export const trendsApi = {
  /** 趋势洞察列表 */
  list: (params?: { page?: number; limit?: number; category?: string }) =>
    api.get<{ items: TrendInsight[]; total: number }>('/trends', { params }),

  /** 趋势洞察详情 */
  getById: (id: string) => api.get<TrendDetail>(`/trends/${id}`),
};
