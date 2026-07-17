import { api } from './client';

interface BackendResearchReport {
  id: string;
  query?: string;
  platform?: string;
  summary?: string;
  opportunities?: {
    competitors?: string[];
    priceRange?: { min?: number; max?: number; currency?: string };
    rating?: number | null;
    sourceEvidence?: BackendResearchSourceEvidence;
    runtime?: ResearchRuntime;
  } | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface BackendResearchSourceEvidence {
  source?: string;
  provider?: string;
  fetchedAt?: string;
  searchQuery?: string;
  relevance?: {
    strategy?: string;
    matchTerms?: string[];
  };
  items?: Array<{
    id?: string;
    title?: string;
    url?: string;
    snippet?: string;
    fetchedAt?: string;
    priceRub?: number | null;
  }>;
}

export interface ResearchSourceEvidence {
  source: string;
  provider: string | null;
  fetchedAt: string | null;
  searchQuery: string | null;
  relevance: {
    strategy: string | null;
    matchTerms: string[];
  };
  items: Array<{
    id: string;
    title: string;
    url: string;
    snippet: string | null;
    fetchedAt: string | null;
    priceRub: number | null;
  }>;
}

export interface ResearchRuntime {
  model?: string | null;
  status?: string | null;
  keyRole?: string | null;
  fallbackActive?: boolean;
  durationMs?: number | null;
}

export interface ResearchReport {
  id: string;
  title: string;
  description?: string;
  platform: string;
  category: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  rating: number | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchDetail extends ResearchReport {
  marketTrend: {
    growth: number | null;
    sparkline: Array<{ week: number; value: number }>;
    hotWords: string[];
  };
  competition: {
    highPotential: number;
    lowCompetition: number;
    mediumCompetition: number;
    highCompetition: number;
  } | null;
  painPoints: Array<{ label: string; value: number }>;
  giftScenarios: string[];
  customizationOptions: string[];
  opportunities: Array<{
    id: string;
    name: string;
    priceRange: string;
    opportunityScore: number | null;
    platform: string;
  }>;
  sourceEvidence: ResearchSourceEvidence | null;
  runtime: ResearchRuntime | null;
}

export interface ResearchInput {
  query: string;
  platform?: string;
  category?: string;
  timeRange?: string;
}

export interface ResearchCandidate {
  id: string;
  reportId: string;
  candidateIndex: number;
  name: string;
  query: string;
  platform: string;
  workspaceId?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approvedProductId?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  priceRange: {
    min: number | null;
    max: number | null;
  };
  rating: number | null;
  createdAt: string;
}

export interface ApproveResearchCandidateResponse {
  candidate: ResearchCandidate;
  product: unknown;
  action: {
    status: 'approved_local_draft' | 'already_approved';
    externalStoreMutation: 'not_executed';
  };
}

export interface RejectResearchCandidateResponse {
  candidate: ResearchCandidate;
  action: {
    status: 'rejected';
    externalStoreMutation: 'not_executed';
  };
}

function normalizeStatus(status?: string): ResearchReport['status'] {
  const normalized = status?.toLowerCase();
  if (
    normalized === 'pending' ||
    normalized === 'running' ||
    normalized === 'completed' ||
    normalized === 'failed'
  ) {
    return normalized;
  }
  return 'completed';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function mapSourceEvidence(
  value: BackendResearchSourceEvidence | undefined,
): ResearchSourceEvidence | null {
  if (!value || value.source !== 'ozon_public_listings') return null;
  const items = Array.isArray(value.items)
    ? value.items
        .map((item, index) => ({
          id: stringOrNull(item.id) ?? `source-${index + 1}`,
          title: stringOrNull(item.title) ?? '',
          url: stringOrNull(item.url) ?? '',
          snippet: stringOrNull(item.snippet),
          fetchedAt: stringOrNull(item.fetchedAt),
          priceRub: numberOrNull(item.priceRub),
        }))
        .filter(
          (item) => item.title.length > 0 && item.url.startsWith('https://'),
        )
    : [];
  if (items.length < 2) return null;
  return {
    source: value.source,
    provider: stringOrNull(value.provider),
    fetchedAt: stringOrNull(value.fetchedAt),
    searchQuery: stringOrNull(value.searchQuery),
    relevance: {
      strategy: stringOrNull(value.relevance?.strategy),
      matchTerms: Array.isArray(value.relevance?.matchTerms)
        ? value.relevance.matchTerms
            .map(stringOrNull)
            .filter((term): term is string => Boolean(term))
        : [],
    },
    items,
  };
}

function formatPriceRange(
  priceRange: { min?: number; max?: number; currency?: string } | undefined,
): string {
  const min = Number(priceRange?.min ?? Number.NaN);
  const max = Number(priceRange?.max ?? Number.NaN);
  const currency = stringOrNull(priceRange?.currency) ?? '';
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return '暂无可核验价格区间';
  }
  const formatter = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  });
  return `${formatter.format(min)}-${formatter.format(max)} ${currency}`.trim();
}

function mapResearchReport(report: BackendResearchReport): ResearchReport {
  const rating = numberOrNull(report.opportunities?.rating);
  return {
    id: report.id,
    title: report.query ?? 'Product research',
    description: report.summary,
    platform: report.platform ?? '',
    category: 'agent-research',
    status: normalizeStatus(report.status),
    rating,
    tags: report.opportunities?.competitors?.slice(0, 3) ?? [],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function mapResearchDetail(report: BackendResearchReport): ResearchDetail {
  const base = mapResearchReport(report);
  const competitors = report.opportunities?.competitors ?? [];
  const priceRange = report.opportunities?.priceRange;
  const min = Number(priceRange?.min ?? Number.NaN);
  const max = Number(priceRange?.max ?? Number.NaN);
  const hasPriceRange =
    Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;

  return {
    ...base,
    marketTrend: {
      growth: null,
      sparkline: [],
      hotWords: competitors,
    },
    competition: null,
    painPoints: [],
    giftScenarios: [],
    customizationOptions: [],
    opportunities: competitors.map((name, index) => ({
      id: `${report.id}-${index}`,
      name,
      priceRange: hasPriceRange
        ? formatPriceRange(priceRange)
        : '暂无可核验价格区间',
      opportunityScore: null,
      platform: base.platform,
    })),
    sourceEvidence: mapSourceEvidence(report.opportunities?.sourceEvidence),
    runtime: report.opportunities?.runtime ?? null,
  };
}

export const productResearchApi = {
  list: async (params?: { page?: number; limit?: number; platform?: string }) => {
    const res = await api.get<{
      items: BackendResearchReport[];
      total: number;
      page?: number;
      limit?: number;
    }>('/product-research', { params });

    return {
      ...res,
      items: (res.items ?? []).map(mapResearchReport),
    };
  },

  getById: async (id: string) => {
    const report = await api.get<BackendResearchReport>(`/product-research/${id}`);
    return mapResearchDetail(report);
  },

  create: async (input: ResearchInput) => {
    const report = await api.post<BackendResearchReport>('/product-research', {
      query: input.query,
      platform: input.platform ?? 'amazon_us',
    });
    return mapResearchReport(report);
  },

  listCandidates: (params?: {
    page?: number;
    limit?: number;
    workspaceId?: string;
    search?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'all';
  }) =>
    api.get<{
      items: ResearchCandidate[];
      total: number;
      page: number;
      limit: number;
    }>('/product-research/candidates', { params }),

  approveCandidate: (candidateId: string, data?: { workspaceId?: string }) =>
    api.post<ApproveResearchCandidateResponse>(
      `/product-research/candidates/${encodeURIComponent(candidateId)}/approve`,
      data ?? {},
    ),

  ensureCandidateReview: (candidateId: string) =>
    api.post<{ reviewTaskId: string; reused: boolean }>(
      `/product-research/candidates/${encodeURIComponent(candidateId)}/review`,
      {},
    ),

  rejectCandidate: (candidateId: string, reason: string) =>
    api.post<RejectResearchCandidateResponse>(
      `/product-research/candidates/${encodeURIComponent(candidateId)}/reject`,
      { reason },
    ),
};
