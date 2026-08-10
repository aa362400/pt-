import { api } from './client';

export interface Product {
  id: string;
  workspaceId: string;
  title: string;
  sku?: string | null;
  asinOrExternalId?: string | null;
  status: string;
  price?: number | string;
  cost?: number | string;
  currency?: string;
  images?: string[];
  imageUrl?: string | null;
  category?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}

export interface OzonProductChangeRequest {
  action: 'ozon.price.update' | 'ozon.stock.update';
  price?: number;
  stock?: number;
  warehouseId?: number;
  reason?: string;
}

export interface OzonProductChangeResponse {
  product: Product;
  notification: {
    id: string;
    title: string;
    body?: string | null;
    type: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  };
  changeOrder: {
    status: 'pending_approval';
    action: 'ozon.price.update' | 'ozon.stock.update';
    requestedValue: number;
    externalExecution: 'blocked_until_human_confirmation';
  };
}

export const productsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<{ items: Product[]; total: number }>('/products', { params }),

  getById: (id: string) => api.get<Product>(`/products/${id}`),

  create: (data: Partial<Product>) => api.post<Product>('/products', data),

  update: (id: string, data: Partial<Product>) =>
    api.patch<Product>(`/products/${id}`, data),

  requestOzonChange: (id: string, data: OzonProductChangeRequest) =>
    api.post<OzonProductChangeResponse>(
      `/products/${id}/ozon-change-request`,
      data,
    ),

  delete: (id: string) => api.delete(`/products/${id}`),
};
