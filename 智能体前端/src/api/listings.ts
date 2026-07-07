import { api } from './client';
import type { ListingPreview, TitleCandidate } from '../types';

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
  rating?: number;
  reviewCount?: number;
  price?: number;
  images?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListingGenerateInput {
  productId: string;
  platform?: string;
  modules?: string[];
  title?: string;
  bulletPoints?: string[];
  description?: string;
  searchTerms?: string[];
}

export const listingsApi = {
  /** Listing 草稿列表 */
  list: (params?: { page?: number; limit?: number; status?: string; platform?: string }) =>
    api.get<{ items: ListingDraft[]; total: number }>('/listings', { params }),

  /** Listing 草稿详情 */
  getById: (id: string) => api.get<ListingDraft>(`/listings/${id}`),

  /** 创建新的 Listing 草稿 */
  create: (data: Partial<ListingDraft>) =>
    api.post<ListingDraft>('/listings', data),

  /** 更新 Listing 草稿 */
  update: (id: string, data: Partial<ListingDraft>) =>
    api.patch<ListingDraft>(`/listings/${id}`, data),

  /** 删除 Listing 草稿 */
  delete: (id: string) => api.delete(`/listings/${id}`),

  /** 从产品生成 Listing */
  generate: (input: ListingGenerateInput) =>
    api.post<ListingDraft>('/listings/generate', input),

  /** 生成标题候选 */
  generateTitles: (productId: string, data?: { count?: number; style?: string }) =>
    api.post<TitleCandidate[]>(`/listings/${productId}/titles`, data),

  /** 生成预览数据 */
  preview: (id: string) => api.get<ListingPreview>(`/listings/${id}/preview`),
};
