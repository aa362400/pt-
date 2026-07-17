import { api } from './client';
import type { PipelineStage } from '../utils/pipeline-presentation';

export interface DashboardCounts {
  products: number;
  listings: number;
  agentRuns: number;
  activeTasks: number;
  unreadNotifications: number;
  openAlerts: number;
}

export interface DashboardRecentActivity {
  recentAgentRuns: Array<{
    id: string;
    agentType: string;
    status: string;
    createdAt: string;
  }>;
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    readAt?: string | null;
    createdAt: string;
  }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    createdAt: string;
  }>;
}

export interface DashboardTrendSummaries {
  recentTrends: Array<{
    id: string;
    keyword: string;
    platform: string;
    score: number;
    observedAt: string;
  }>;
  topKeywords: Array<{
    keyword: string;
    maxScore: number | null;
    occurrences: number;
    source: 'trend_insight' | 'keyword_report' | 'mixed';
    searchVolume: number | null;
    difficulty: number | null;
  }>;
}

export interface DashboardOpportunity {
  id: string;
  title: string;
  detail: string;
  source: 'notification' | 'team_task' | 'product_research';
  sourceLabel: string;
  status: string;
  priority: string | null;
  score: number | null;
  actionRequired: boolean;
  createdAt: string;
}

export interface DashboardOpportunities {
  source: string;
  sourceLabel: string;
  sampleState: 'real_samples' | 'empty';
  emptyReason: string | null;
  items: DashboardOpportunity[];
}

export interface DashboardHotProduct {
  id: string;
  title: string;
  sku: string | null;
  externalId: string | null;
  price: number;
  currency: string;
  status: string;
  source: string;
  externalStoreMutation: string | null;
  ozonStatus: string | null;
  createdAt: string;
}

export interface DashboardHotProducts {
  source: string;
  sourceLabel: string;
  rankingBasis: 'catalog_sync';
  sampleState: 'real_samples' | 'empty';
  emptyReason: string | null;
  items: DashboardHotProduct[];
}

export interface DashboardProfitSummary {
  source: 'profit_calculations';
  sourceLabel: string;
  sampleState: 'real_samples' | 'empty';
  emptyReason: string | null;
  calculationCount: number;
  averageMargin: number | null;
  averageRoi: number | null;
  totalEstimatedProfit: number;
  latest: Array<{
    id: string;
    productId: string | null;
    productTitle: string | null;
    currency: string;
    salePrice: number;
    totalCost: number;
    estimatedProfit: number;
    profitMargin: number;
    roi: number;
    createdAt: string;
  }>;
}

export interface DashboardPipelineItem {
  id: string;
  entityType: 'RESEARCH_RUN' | 'REVIEW_TASK' | 'PRODUCT_LAUNCH';
  entityId: string;
  title: string;
  stage: PipelineStage;
  status: string;
  blockedOn: string | null;
  errorCode: string | null;
  actionRequired: boolean;
  updatedAt: string;
}

export interface DashboardPipeline {
  items: DashboardPipelineItem[];
  summary: {
    total: number;
    needsAttention: number;
    blocked: number;
    inProgress: number;
    monitoring: number;
    byStage: Record<string, number>;
  };
  generatedAt: string;
}

export const dashboardApi = {
  getPipeline: (params?: { workspaceId?: string }) =>
    api.get<DashboardPipeline>('/dashboard/pipeline', { params }),

  getCounts: (params?: { workspaceId?: string }) =>
    api.get<DashboardCounts>('/dashboard/counts', { params }),

  getRecentActivity: (params?: { workspaceId?: string }) =>
    api.get<DashboardRecentActivity>('/dashboard/recent-activity', { params }),

  getTrendSummaries: (params?: { workspaceId?: string }) =>
    api.get<DashboardTrendSummaries>('/dashboard/trends', { params }),

  getOpportunities: (params?: { workspaceId?: string }) =>
    api.get<DashboardOpportunities>('/dashboard/opportunities', { params }),

  getHotProducts: (params?: { workspaceId?: string }) =>
    api.get<DashboardHotProducts>('/dashboard/hot-products', { params }),

  getProfitSummary: (params?: { workspaceId?: string }) =>
    api.get<DashboardProfitSummary>('/dashboard/profit-summary', { params }),
};
