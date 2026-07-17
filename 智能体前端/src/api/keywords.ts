import { api } from './client';
import {
  keywordMetricEvidenceForDisplay,
  keywordMetricsForDisplay,
  type KeywordMetricEvidence,
  type KeywordMetricStatus,
} from '../utils/keyword-evidence.ts';

interface BackendKeywordItem {
  keyword?: string;
  volume?: number | null;
  difficulty?: number | null;
  opportunityScore?: number | null;
  trend?: 'up' | 'down' | 'stable';
  trendData?: number[];
  metricStatus?: KeywordMetricStatus;
  metricEvidence?: KeywordMetricEvidence | null;
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
  metricStatus: KeywordMetricStatus;
  metricEvidence: KeywordMetricEvidence | null;
}

export interface KeywordDetail extends KeywordReport {
  longTailKeywords: Array<{
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    metricStatus: KeywordMetricStatus;
    metricEvidence: KeywordMetricEvidence | null;
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

function getTrendData(
  report: BackendKeywordReport,
  item: BackendKeywordItem | undefined,
  evidenceBacked: boolean,
): number[] {
  if (!evidenceBacked) return [];
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
  const metrics = keywordMetricsForDisplay(firstKeyword ?? {});
  const metricEvidence = keywordMetricEvidenceForDisplay(
    firstKeyword?.metricEvidence,
  );
  const evidenceBacked =
    metricEvidence !== null &&
    (metrics.volume !== null || metrics.difficulty !== null);
  const difficulty = metrics.difficulty;
  const searchVolume = metrics.volume;
  const opportunityScore = evidenceBacked
    ? numberOrNull(firstKeyword?.opportunityScore)
    : null;
  const trendData = getTrendData(report, firstKeyword, evidenceBacked);
  const keyword = firstKeyword?.keyword ?? report.query ?? 'Keyword report';

  return {
    id: report.id,
    keyword,
    searchVolume,
    trend: deriveTrend(
      trendData,
      evidenceBacked ? firstKeyword?.trend : undefined,
    ),
    trendData,
    competition: mapCompetition(difficulty),
    difficulty,
    opportunityScore,
    platform: report.platforms?.[0] ?? '',
    platformIcon: report.platforms?.[0] ?? '',
    totalKeywords: typeof report.totalKeywords === 'number' ? report.totalKeywords : null,
    createdAt: report.createdAt,
    metricStatus: evidenceBacked ? 'EVIDENCE_BACKED' : 'DATA_INSUFFICIENT',
    metricEvidence: evidenceBacked ? metricEvidence : null,
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
      .map((item) => {
        const metrics = keywordMetricsForDisplay(item);
        const metricEvidence = keywordMetricEvidenceForDisplay(
          item.metricEvidence,
        );
        const evidenceBacked =
          metricEvidence !== null &&
          (metrics.volume !== null || metrics.difficulty !== null);
        return {
          keyword: item.keyword as string,
          volume: metrics.volume,
          difficulty: metrics.difficulty,
          metricStatus: evidenceBacked
            ? ('EVIDENCE_BACKED' as const)
            : ('DATA_INSUFFICIENT' as const),
          metricEvidence: evidenceBacked ? metricEvidence : null,
        };
      }),
    relatedKeywords: keywordItems
      .slice(0, 8)
      .map((item) => item.keyword)
      .filter((keyword): keyword is string => Boolean(keyword)),
    monthlyTrend:
      base.metricStatus === 'EVIDENCE_BACKED' &&
      Array.isArray(report.charts?.monthlyTrend)
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
