import { api } from './client';
import type { AgentRun } from './agentRuns';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REWORK';

export type ManualPricingAction =
  | 'SAVE_DRAFT'
  | 'SUBMIT_COMPLETE'
  | 'SUBMIT_INCOMPLETE';

export interface ManualPricingUpdateInput {
  action: ManualPricingAction;
  currency?: string;
  procurementCost?: number;
  domesticShippingCost?: number;
  internationalShippingCost?: number;
  ozonCommissionRatePercent?: number;
  paymentCollectionFeeRatePercent?: number;
  warehousingCost?: number;
  advertisingRatePercent?: number;
  refundLossRatePercent?: number;
  taxRatePercent?: number;
  packagingCost?: number;
  fxBufferRatePercent?: number;
  notes?: string;
  riskEvidence?: string;
}

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
  | 'AWAITING_ECONOMICS_REVIEW'
  | 'AWAITING_PUBLISH_APPROVAL'
  | 'SUBMITTING_TO_OZON'
  | 'SUBMITTED_TO_OZON'
  | 'ACTIVE_ON_OZON'
  | 'BLOCKED'
  | 'FAILED';

export type ProductPreparationMode = 'CREATIVE_ONLY' | 'PUBLISH_READY';

export type ProductLaunchExternalMutation =
  | 'local_creative_preparation_queued'
  | 'local_assets_preparation_queued'
  | 'local_assets_preparation_in_progress'
  | 'awaiting_publish_approval'
  | 'submitted_to_ozon'
  | 'ozon_active';

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
  reviewTaskId?: string;
  researchCandidateId?: string | null;
  imageGenerationApproved?: boolean;
  selectedPublishSnapshotId?: string | null;
  publishExecutionGrantHash?: string | null;
  publishExecutionGrantScope?: string | null;
  publishExecutionGrantSnapshotHash?: string | null;
  publishExecutionGrantExpiresAt?: string | null;
  publishExecutionGrantConsumedAt?: string | null;
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
  imageEvidenceUrl?: string | null;
  priceRub?: number | null;
  evidenceFetchedAt?: string | null;
  evidenceReady?: boolean;
  economicsEvaluationId?: string | null;
  economicsEvaluationHash?: string | null;
  economicsValidUntil?: string | null;
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

export interface DailyProductResearchSafetyPreview {
  kind?: 'daily_product_candidate';
  candidateId?: string;
  status?: string;
  signalCount?: number;
  signalSources?: string[];
  riskSummary?: Array<{
    riskType?: string;
    severity?: string;
    reviewStatus?: string;
  }>;
  latestScore?: {
    hardGateReasons?: string[];
    hardGateStatus?: string;
    decision?: string;
  } | null;
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

export interface ConfirmProductLaunchInput {
  candidateId: string;
  confirmImageGeneration: true;
  referenceAssetId: string;
  workspaceId: string;
  preparationMode: ProductPreparationMode;
  economicsEvaluationId?: string;
  economicsEvaluationHash?: string;
  ozonPublication?: OzonPublicationInput;
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
  approvalScope?: unknown;
  decisionEvidence?: unknown;
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
  dailyProductResearchPreview?: DailyProductResearchSafetyPreview | null;
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

async function listAllReviewTasks(params?: {
  status?: ReviewStatus;
  entityType?: string;
}) {
  const limit = 100;
  const items: ReviewTask[] = [];
  let total = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= 1000 && items.length < total; page += 1) {
    const response = await api.get<{
      items: ReviewTask[];
      total: number;
      page: number;
      limit: number;
    }>('/review', { params: { ...params, page, limit } });
    items.push(...response.items);
    total = response.total;
    if (response.items.length === 0) break;
  }
  if (items.length < total) {
    throw new Error('审核任务数量超过安全分页上限，未展示不完整统计。');
  }
  return { items, total };
}

export const reviewApi = {
  list: (params?: { page?: number; limit?: number; status?: ReviewStatus; entityType?: string }) =>
    api.get<{ items: ReviewTask[]; total: number; page: number; limit: number }>('/review', { params }),

  listAll: listAllReviewTasks,

  getById: (id: string) => api.get<ReviewTask>(`/review/${id}`),

  getProductLaunch: (launchId: string) =>
    api.get<{ launch: ProductLaunchPreview }>(
      `/review/product-launch/${encodeURIComponent(launchId)}`,
    ),

  stats: () => api.get<ReviewStats>('/review/stats'),

  update: (id: string, data: { status: 'APPROVED' | 'REJECTED' | 'REWORK'; notes?: string }) =>
    api.patch<ReviewTask>(`/review/${id}`, data),

  updateManualPricing: (id: string, data: ManualPricingUpdateInput) =>
    api.patch<ReviewTask>(`/review/${id}/manual-pricing`, data),

  confirmProductLaunch: (
    id: string,
    data: ConfirmProductLaunchInput,
  ) =>
    api.post<{
      launch: ProductLaunchPreview;
      externalStoreMutation: ProductLaunchExternalMutation;
    }>(`/review/${id}/product-launch`, data),

  confirmProductPublish: (launchId: string) =>
    api.post<{
      launch: ProductLaunchPreview;
      externalStoreMutation: 'publish_queued_after_separate_confirmation';
    }>(`/review/product-launch/${launchId}/publish`, {
      confirmPublish: true,
    }),
};
