import { api } from './client';
import type { ListingPreview, TitleCandidate } from '../types';
import {
  listingPricingForDisplay,
  type ListingPriceCurrency,
  type ListingPricingAttributes,
  type ListingPricingStatus,
} from '../utils/listing-pricing-evidence';

interface BackendListingDraft {
  id: string;
  productId?: string | null;
  product?: { id: string; title: string } | null;
  platform?: string;
  status?: string;
  title?: string;
  bullets?: string[];
  description?: string | null;
  seoTags?: string[];
  attributes?: ListingPricingAttributes | Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDraft {
  id: string;
  productId: string;
  productName: string;
  title: string;
  platform: string;
  status: 'draft' | 'completed' | 'published';
  bulletPoints?: string[];
  description?: string;
  searchTerms?: string[];
  seoTags?: string[];
  rating?: number | null;
  reviewCount?: number | null;
  price?: number | null;
  priceCurrency?: ListingPriceCurrency | null;
  pricingStatus: ListingPricingStatus;
  economicsEvaluationId?: string | null;
  images?: string[];
  createdAt: string;
  updatedAt: string;
}

export const LISTING_PLATFORMS = [
  'amazon',
  'shopify',
  'etsy',
  'ebay',
  'ozon',
  'temu',
] as const;

export type ListingPlatform = (typeof LISTING_PLATFORMS)[number];
export const OZON_LISTING_PLATFORM = 'ozon' satisfies ListingPlatform;

export interface ListingGenerateInput {
  idempotencyKey: string;
  workspaceId: string;
  productName: string;
  platform: ListingPlatform;
  description?: string;
  keywords?: string[];
  tone?: string;
  productId?: string;
}

export interface ListingUpdateInput {
  title?: string;
  bulletPoints?: string[];
  description?: string;
  searchTerms?: string[];
  seoTags?: string[];
  status?: ListingDraft['status'];
}

function normalizeStatus(status?: string): ListingDraft['status'] {
  if (status === 'PUBLISHED') return 'published';
  if (status === 'IN_REVIEW') return 'completed';
  return 'draft';
}

function mapListingDraft(draft: BackendListingDraft): ListingDraft {
  const pricing = listingPricingForDisplay(
    draft.attributes && typeof draft.attributes === 'object'
      ? draft.attributes
      : null,
  );

  return {
    id: draft.id,
    productId: draft.productId ?? draft.product?.id ?? '',
    productName: draft.product?.title ?? draft.title ?? '未命名刊登草稿',
    title: draft.title ?? '',
    platform: draft.platform ?? '',
    status: normalizeStatus(draft.status),
    bulletPoints: draft.bullets ?? [],
    description: draft.description ?? undefined,
    searchTerms: draft.seoTags ?? [],
    seoTags: draft.seoTags ?? [],
    rating: undefined,
    reviewCount: undefined,
    price: pricing.price,
    priceCurrency: pricing.currency,
    pricingStatus: pricing.status,
    economicsEvaluationId: pricing.economicsEvaluationId,
    images: [],
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function buildTitleCandidates(draft: ListingDraft): TitleCandidate[] {
  if (!draft.title) return [];
  return [
    {
      id: `${draft.id}-title-primary`,
      title: draft.title,
      features: draft.seoTags?.slice(0, 4) ?? [],
    },
  ];
}

function buildPreview(draft: ListingDraft): ListingPreview {
  return {
    title: draft.title,
    productName: draft.productName,
    platform: draft.platform,
    rating: draft.rating,
    reviewCount: draft.reviewCount,
    price: draft.price,
    priceCurrency: draft.priceCurrency,
    pricingStatus: draft.pricingStatus,
    economicsEvaluationId: draft.economicsEvaluationId,
    bulletPoints: draft.bulletPoints ?? [],
    seoTags: draft.seoTags ?? [],
    images: draft.images ?? [],
  };
}

export const listingsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    platform?: string;
    workspaceId?: string;
  }) => {
    const res = await api.get<{
      items: BackendListingDraft[];
      total: number;
      page?: number;
      limit?: number;
    }>('/listings', { params });

    return {
      ...res,
      items: (res.items ?? []).map(mapListingDraft),
    };
  },

  getById: async (id: string) => {
    const draft = await api.get<BackendListingDraft>(`/listings/${id}`);
    return mapListingDraft(draft);
  },

  update: async (id: string, data: ListingUpdateInput) => {
    const draft = await api.patch<BackendListingDraft>(`/listings/${id}`, {
      title: data.title,
      bullets: data.bulletPoints,
      description: data.description,
      seoTags: data.seoTags ?? data.searchTerms,
      status:
        data.status === 'published'
          ? 'PUBLISHED'
          : data.status === 'completed'
            ? 'IN_REVIEW'
            : undefined,
    });
    return mapListingDraft(draft);
  },

  delete: (id: string) => api.delete(`/listings/${id}`),

  generate: async (input: ListingGenerateInput) => {
    const draft = await api.post<BackendListingDraft>(
      '/listings/generate',
      {
        workspaceId: input.workspaceId,
        productName: input.productName,
        description: input.description,
        keywords: input.keywords ?? [],
        platform: input.platform,
        tone: input.tone,
        productId: input.productId,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return mapListingDraft(draft);
  },

  titleCandidates: async (id: string) => {
    const draft = await listingsApi.getById(id);
    return buildTitleCandidates(draft);
  },

  preview: async (id: string) => {
    const draft = await listingsApi.getById(id);
    return buildPreview(draft);
  },
};
