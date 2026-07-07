import { api } from './client';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REWORK';

export interface ReviewTask {
  id: string;
  organizationId: string;
  entityType: 'AGENT_RUN' | 'IMAGE_GENERATION' | 'LISTING_DRAFT' | 'PRODUCT_RESEARCH';
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
  updatedAt: string;
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
};
