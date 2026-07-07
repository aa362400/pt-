import { api } from './client';

export interface PlanInfo {
  name: string;
  description: string;
  monthlyPrice: number;
  features: string[];
}

export interface CurrentPlan {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: string | null;
  createdAt?: string;
}

export interface QuotaItem {
  used: number;
  limit: number;
}

export interface BillingUsage {
  products: number;
  listings: number;
  agentRuns: number;
  teamMembers: number;
  storageFiles: number;
  workspaces: number;
  quotas?: {
    products: QuotaItem;
    agentRuns: QuotaItem;
    members: QuotaItem;
    storage: QuotaItem;
    workspaces: QuotaItem;
  };
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan?: string;
  issuedAt?: string;
  createdAt: string;
}

export const billingApi = {
  plans: () => api.get<PlanInfo[]>('/billing/plans'),

  currentPlan: () => api.get<CurrentPlan>('/billing/plan'),

  usage: () => api.get<BillingUsage>('/billing/usage'),

  invoices: (params?: { page?: number; limit?: number }) =>
    api.get<{ items: Invoice[]; total: number }>('/billing/invoices', { params }),

  createCheckoutSession: (plan: string) =>
    api.post<{ url: string }>('/billing/create-checkout-session', { plan }),
};
