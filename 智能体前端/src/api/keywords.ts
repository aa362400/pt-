import { api } from './client';

export interface KeywordReport {
  id: string;
  keyword: string;
  searchVolume: number;
  trend: 'up' | 'down' | 'stable';
  trendData: number[];
  competition: 'low' | 'medium' | 'high';
  difficulty: number;
  opportunityScore: number;
  platform: string;
  platformIcon: string;
  createdAt: string;
}

export interface KeywordDetail extends KeywordReport {
  longTailKeywords: Array<{
    keyword: string;
    volume: number;
    difficulty: number;
  }>;
  relatedKeywords: string[];
  monthlyTrend: Array<{ month: string; volume: number }>;
}

export interface KeywordAnalysisInput {
  keyword: string;
  platform?: string;
  category?: string;
  country?: string;
}

export const keywordsApi = {
  /** 关键词报告列表 */
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    platform?: string;
    category?: string;
  }) => api.get<{ items: KeywordReport[]; total: number }>('/keywords', { params }),

  /** 关键词报告详情 */
  getById: (id: string) => api.get<KeywordDetail>(`/keywords/${id}`),

  /** 发起新的关键词分析 */
  analyze: (input: KeywordAnalysisInput) =>
    api.post<KeywordReport>('/keywords/analyze', input),
};
