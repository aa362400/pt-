import { api } from './client';
import type { TrendDataPoint, TrendCategory, HotTopic, RegionGrowth } from '../types';

interface BackendTrendInsight {
  id: string;
  keyword?: string;
  category?: string;
  market?: string;
  score?: number;
  growthRate?: number | null;
  source?: string;
  observedAt?: string;
  createdAt?: string;
  data?: {
    seasonality?: string;
    volume?: string | number;
    dataPoints?: TrendDataPoint[];
    evidence?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      fetchedAt?: string;
    }>;
  } | Record<string, unknown> | null;
}

export interface TrendInsight {
  id: string;
  title: string;
  description: string;
  category: string;
  growth: number | null;
  volume: string;
  color: string;
  dataPoints: TrendDataPoint[];
  source: string | null;
  evidence: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    fetchedAt?: string;
  }>;
  createdAt: string;
}

export interface TrendDetail extends TrendInsight {
  categories: TrendCategory[];
  hotTopics: HotTopic[];
  regionGrowth: RegionGrowth[];
  relatedKeywords: Array<{ keyword: string; growth: string }>;
}

export interface TrendAnalyzeInput {
  category: string;
  marketplace?: string;
  timeframe?: string;
  workspaceId?: string;
}

export interface TrendAnalyzeResult {
  count: number;
  items: TrendInsight[];
}

function mapTrendInsight(item: BackendTrendInsight): TrendInsight {
  const rawGrowth = item.growthRate ?? item.score;
  const growth =
    typeof rawGrowth === 'number' && Number.isFinite(rawGrowth)
      ? rawGrowth
      : null;
  const title = item.keyword ?? item.category ?? 'Trend insight';
  const data =
    typeof item.data === 'object' && item.data !== null ? item.data : {};
  const dataPoints = Array.isArray(data.dataPoints) ? data.dataPoints : [];
  const evidence = Array.isArray(data.evidence)
    ? data.evidence.filter(
        (item: unknown): item is { title?: string; url?: string; snippet?: string; fetchedAt?: string } =>
          typeof item === 'object' && item !== null,
      )
    : [];
  return {
    id: item.id,
    title,
    description:
      'seasonality' in data
        ? String(data.seasonality ?? '')
        : '',
    category: item.category ?? '',
    growth,
    volume: 'volume' in data ? String(data.volume ?? '') : '',
    color: '#6C63FF',
    dataPoints,
    source: typeof item.source === 'string' && item.source.trim() ? item.source : null,
    evidence,
    createdAt: item.createdAt ?? item.observedAt ?? '',
  };
}

export const trendsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    category?: string;
    keyword?: string;
    marketplace?: string;
    timeframe?: string;
  }) => {
    const res = await api.get<{
      items: BackendTrendInsight[];
      total: number;
      page?: number;
      limit?: number;
    }>('/trends', { params });

    return {
      ...res,
      items: (res.items ?? []).map(mapTrendInsight),
    };
  },

  analyze: async (input: TrendAnalyzeInput) => {
    const res = await api.post<{
      count: number;
      items: BackendTrendInsight[];
    }>('/trends/analyze', {
      category: input.category,
      marketplace: input.marketplace ?? 'amazon_us',
      timeframe: input.timeframe,
      workspaceId: input.workspaceId,
    });

    return {
      count: res.count,
      items: (res.items ?? []).map(mapTrendInsight),
    };
  },

  getById: (id: string) => api.get<TrendDetail>(`/trends/${id}`),
};
