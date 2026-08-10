import { api } from './client';
import type { AgentRun } from './agentRuns';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REWORK';

export interface ReviewImageProject {
  id: string;
  title: string;
  prompt?: string | null;
  generatedAssets?: unknown;
  status: string;
  createdAt: string;
}

export type ProductLaunchStatus =
  | 'QUEUED'
  | 'GENERATING_IMAGES'
  | 'AWAITING_PUBLISH_APPROVAL'
  | 'SUBMITTING_TO_OZON'
  | 'SUBMITTED_TO_OZON'
  | 'ACTIVE_ON_OZON'
  | 'BLOCKED'
  | 'FAILED';

export interface ProductLaunchPreview {
  id: string;
  candidateId: string;
  productId?: string | null;
  status: ProductLaunchStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
  imageProjectId?: string | null;
  agentRunId?: string | null;
  channelId?: string | null;
  listingDraftId?: string | null;
  publishReviewTaskId?: string | null;
  approvedContentHash?: string | null;
  publishApprovedAt?: string | null;
  updatedAt?: string;
  imageProject?: {
    id: string;
    generatedAssets: unknown;
    qaStatus: 'PENDING' | 'PASSED' | 'FAILED' | 'ERROR';
    qaVersion: string;
    qaResult: unknown;
    qaCompletedAt?: string | null;
  } | null;
}

export interface ProductResearchCandidatePreview {
  id: string;
  candidateIndex: number;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  decidedAt?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  priceRub?: number | null;
  evidenceFetchedAt?: string | null;
  evidenceReady?: boolean;
  launch?: ProductLaunchPreview | null;
}

export interface ProductResearchPreview {
  reportId: string;
  query: string;
  platform: string;
  summary?: string | null;
  createdAt?: string;
  priceRange: {
    min: number | null;
    max: number | null;
    currency: string | null;
  };
  rating: number | null;
  sourceEvidence: {
    source: string | null;
    provider: string | null;
    fetchedAt: string | null;
    searchQuery: string | null;
    relevance: {
      strategy: string | null;
      matchTerms: string[];
    };
    items: Array<{
      id: string | null;
      title: string | null;
      url: string | null;
      imageUrl?: string | null;
      snippet: string | null;
      fetchedAt: string | null;
      priceRub: number | null;
    }>;
  };
  candidates: ProductResearchCandidatePreview[];
}

export interface OzonPublicationInput {
  descriptionCategoryId?: number;
  attributes?: Array<Record<string, unknown>>;
  vat?: string;
  offerId?: string;
  barcode?: string;
  currencyCode?: string;
  dimensions?: {
    height?: number;
    width?: number;
    depth?: number;
    weight?: number;
    dimensionUnit?: string;
    weightUnit?: string;
  };
}

export interface ReviewTask {
  id: string;
  organizationId: string;
  entityType: 'AGENT_RUN' | 'IMAGE_GENERATION' | 'LISTING_DRAFT' | 'PRODUCT_RESEARCH' | 'SUPPLY_PLAN';
  entityId: string;
  status: ReviewStatus;
  score: number | null;
  threshold: number;
  autoApproved: boolean;
  autoRegenerations: number;
  notes?: string | null;
  assignedTo?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  entityAvailable?: boolean;
  entityLoadError?: string | null;
  agentRun?: AgentRun | null;
  imageProject?: ReviewImageProject | null;
  listingDraft?: unknown;
  productResearch?: unknown;
  productResearchPreview?: ProductResearchPreview | null;
  supplyPlan?: {
    id: string;
    recommendedQty: number;
    requestedQty: number;
    reorderPoint: number;
    projectedDaysLeft: number | null;
    status: string;
    inputSnapshot: Record<string, unknown>;
    supplySku: {
      sku: string;
      productName: string;
      unitCost: string | number;
      currency: string;
      supplier: { id: string; name: string };
    };
  } | null;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  rework: number;
  total: number;
  approvalRate: number;
  avgScore: number | null;
  avgReviewTimeHours: number | null;
}

export const reviewApi = {
  list: (params?: { page?: number; limit?: number; status?: ReviewStatus; entityType?: string }) =>
    api.get<{ items: ReviewTask[]; total: number; page: number; limit: number }>('/review', { params }),

  getById: (id: string) => api.get<ReviewTask>(`/review/${id}`),

  stats: () => api.get<ReviewStats>('/review/stats'),

  update: (id: string, data: { status: 'APPROVED' | 'REJECTED' | 'REWORK'; notes?: string }) =>
    api.patch<ReviewTask>(`/review/${id}`, data),

  confirmProductLaunch: (
    id: string,
    data: {
      candidateId: string;
      confirmImageGeneration: true;
      referenceAssetId: string;
      workspaceId?: string;
      ozonPublication?: OzonPublicationInput;
    },
  ) =>
    api.post<{
      launch: ProductLaunchPreview;
      externalStoreMutation: 'local_assets_preparation_queued';
    }>(`/review/${id}/product-launch`, data),

  confirmProductPublish: (launchId: string) =>
    api.post<{
      launch: ProductLaunchPreview;
      externalStoreMutation: 'publish_queued_after_separate_confirmation';
    }>(`/review/product-launch/${launchId}/publish`, {
      confirmPublish: true,
    }),
};
