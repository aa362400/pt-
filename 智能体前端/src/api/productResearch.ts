import { api } from './client';

export interface ResearchReport {
  id: string;
  title: string;
  description?: string;
  platform: string;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  score?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchDetail extends ResearchReport {
  marketTrend: {
    growth: number;
    sparkline: Array<{ week: number; value: number }>;
    hotWords: string[];
  };
  competition: {
    highPotential: number;
    lowCompetition: number;
    mediumCompetition: number;
    highCompetition: number;
  };
  painPoints: Array<{ label: string; value: number }>;
  giftScenarios: string[];
  customizationOptions: string[];
  opportunities: Array<{
    id: string;
    name: string;
    image: string;
    priceRange: string;
    demandTrend: 'up' | 'stable';
    opportunityScore: number;
    platform: string;
  }>;
}

export interface ResearchInput {
  query: string;
  platform?: string;
  category?: string;
  timeRange?: string;
}

export const productResearchApi = {
  /** 研究报告列表 */
  list: (params?: { page?: number; limit?: number; platform?: string }) =>
    api.get<{ items: ResearchReport[]; total: number }>('/product-research', { params }),

  /** 研究报告详情 */
  getById: (id: string) => api.get<ResearchDetail>(`/product-research/${id}`),

  /** 发起新的研究 */
  create: (input: ResearchInput) =>
    api.post<ResearchReport>('/product-research', input),
};
