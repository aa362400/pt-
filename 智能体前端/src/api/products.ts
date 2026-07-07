import { api } from './client';

export interface Product {
  id: string;
  workspaceId: string;
  title: string;
  sku?: string;
  status: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export const productsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<{ items: Product[]; total: number }>('/products', { params }),

  getById: (id: string) => api.get<Product>(`/products/${id}`),

  create: (data: Partial<Product>) => api.post<Product>('/products', data),

  update: (id: string, data: Partial<Product>) =>
    api.patch<Product>(`/products/${id}`, data),

  delete: (id: string) => api.delete(`/products/${id}`),
};
