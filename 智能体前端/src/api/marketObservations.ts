import { api } from "./client";

export interface MarketObservationBatch {
  id: string;
  source: string;
  pageType: string;
  pageUrl: string;
  pageTitle: string | null;
  query: string | null;
  capturedAt: string;
  parserVersion: string;
  confidence: number;
  requiresReview: boolean;
  _count?: { items: number };
  items?: MarketObservationItem[];
}

export interface MarketObservationItem {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  currentPrice: string | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
  position: number | null;
  evidenceHash: string;
}

export interface ProductOpportunity {
  id: string;
  title: string;
  sourceUrl: string;
  status: string;
  score: number | null;
  decision: string | null;
  dimensions: Record<string, unknown>;
  reasons: string[];
  risks: string[];
  missingEvidence: string[];
  sources: Array<{
    url: string;
    imageUrl?: string | null;
    capturedAt: string;
    evidenceHash: string;
  }>;
  scoringVersion: string;
  evidenceConfidence: number;
}

export const marketObservationsApi = {
  list: () =>
    api.get<{ items: MarketObservationBatch[]; total: number }>(
      "/market-observations",
      { params: { page: 1, limit: 50 } },
    ),
  get: (id: string) =>
    api.get<MarketObservationBatch>(`/market-observations/${id}`),
  score: (id: string) =>
    api.post<{ batchId: string; scoringVersion: string; items: ProductOpportunity[] }>(
      `/market-observations/${id}/score`,
    ),
  opportunities: () =>
    api.get<{ items: ProductOpportunity[]; total: number }>(
      "/product-opportunities",
      { params: { page: 1, limit: 100 } },
    ),
  decide: (id: string, status: "APPROVED" | "REJECTED" | "RESEARCHING", reason?: string) =>
    api.put<ProductOpportunity>(`/product-opportunities/${id}/decision`, {
      status,
      reason,
    }),
};
