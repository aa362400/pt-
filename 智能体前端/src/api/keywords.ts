import { api } from './client';

interface BackendKeywordItem {
  keyword?: string;
  volume?: number | null;
  difficulty?: number | null;
  opportunityScore?: number | null;
  trend?: 'up' | 'down' | 'stable';
  trendData?: number[];
}

interface BackendKeywordReport {
  id: string;
  query?: string;
  platforms?: string[];
  country?: string;
  totalKeywords?: number;
  keywords?: BackendKeywordItem[];
  charts?: {
    trendData?: number[];
    monthlyTrend?: Array<{ month?: string; date?: string; volume?: number; value?: number }>;
  } | Record<string, unknown> | null;
  createdAt: string;
}

export interface KeywordReport {
  id: string;
  keyword: string;
  searchVolume: number | null;
  trend: 'up' | 'down' | 'stable';
  trendData: number[];
  competition: 'low' | 'medium' | 'high' | null;
  difficulty: number | null;
  opportunityScore: number | null;
  platform: string;
  platformIcon: string;
  totalKeywords: number | null;
  createdAt: string;
}

export interface KeywordDetail extends KeywordReport {
  longTailKeywords: Array<{
    keyword: string;
    volume: number | null;
    difficulty: number | null;
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

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapCompetition(
  difficulty: number | null,
): KeywordReport['competition'] {
  if (difficulty === null) return null;
  if (difficulty >= 70) return 'high';
  if (difficulty >= 40) return 'medium';
  return 'low';
}

function deriveTrend(trendData: number[], explicit?: BackendKeywordItem['trend']) {
  if (explicit) return explicit;
  if (trendData.length < 2) return 'stable';
  const first = trendData[0];
  const last = trendData[trendData.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'stable';
}

function getTrendData(report: BackendKeywordReport, item?: BackendKeywordItem): number[] {
  if (Array.isArray(item?.trendData)) {
    return item.trendData.filter((value) => typeof value === 'number');
  }
  if (Array.isArray(report.charts?.trendData)) {
    return report.charts.trendData.filter((value) => typeof value === 'number');
  }
  if (Array.isArray(report.charts?.monthlyTrend)) {
    return report.charts.monthlyTrend
      .map((point) => numberOrNull(point.volume ?? point.value))
      .filter((value): value is number => value !== null);
  }
  return [];
}

function mapKeywordReport(report: BackendKeywordReport): KeywordReport {
  const firstKeyword = report.keywords?.[0];
  const difficulty = numberOrNull(firstKeyword?.difficulty);
  const searchVolume = numberOrNull(firstKeyword?.volume);
  const opportunityScore = numberOrNull(firstKeyword?.opportunityScore);
  const trendData = getTrendData(report, firstKeyword);
  const keyword = firstKeyword?.keyword ?? report.query ?? 'Keyword report';

  return {
    id: report.id,
    keyword,
    searchVolume,
    trend: deriveTrend(trendData, firstKeyword?.trend),
    trendData,
    competition: mapCompetition(difficulty),
    difficulty,
    opportunityScore,
    platform: report.platforms?.[0] ?? '',
    platformIcon: report.platforms?.[0] ?? '',
    totalKeywords: typeof report.totalKeywords === 'number' ? report.totalKeywords : null,
    createdAt: report.createdAt,
  };
}

function mapKeywordDetail(report: BackendKeywordReport): KeywordDetail {
  const base = mapKeywordReport(report);
  const keywordItems = report.keywords ?? [];

  return {
    ...base,
    longTailKeywords: keywordItems
      .slice(1)
      .filter((item) => Boolean(item.keyword))
      .map((item) => ({
        keyword: item.keyword as string,
        volume: numberOrNull(item.volume),
        difficulty: numberOrNull(item.difficulty),
      })),
    relatedKeywords: keywordItems
      .slice(0, 8)
      .map((item) => item.keyword)
      .filter((keyword): keyword is string => Boolean(keyword)),
    monthlyTrend: Array.isArray(report.charts?.monthlyTrend)
      ? report.charts.monthlyTrend
          .map((point, index) => ({
            month: point.month ?? point.date ?? `${index + 1}`,
            volume: numberOrNull(point.volume ?? point.value),
          }))
          .filter((point): point is { month: string; volume: number } => point.volume !== null)
      : [],
  };
}

export const keywordsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    platform?: string;
    category?: string;
  }) => {
    const res = await api.get<{
      items: BackendKeywordReport[];
      total: number;
      page?: number;
      limit?: number;
    }>('/keywords', { params });

    return {
      ...res,
      items: (res.items ?? []).map(mapKeywordReport),
    };
  },

  getById: async (id: string) => {
    const report = await api.get<BackendKeywordReport>(`/keywords/${id}`);
    return mapKeywordDetail(report);
  },

  analyze: async (input: KeywordAnalysisInput) => {
    const report = await api.post<BackendKeywordReport>('/keywords', {
      seedKeywords: [input.keyword],
      marketplace: input.platform ?? 'amazon_us',
      country: input.country ?? 'US',
    });
    return mapKeywordReport(report);
  },
};
