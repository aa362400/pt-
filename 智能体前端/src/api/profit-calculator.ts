import { api } from './client';
import type { CostInput, PricingResult, ScenarioSimulation } from '../types';

export interface ProfitCalculation {
  id: string;
  name: string;
  productName?: string;
  salePrice?: number;
  costs: CostInput[];
  result?: PricingResult;
  scenarios?: ScenarioSimulation[];
  createdAt: string;
  updatedAt: string;
}

export interface CalculateInput {
  salePrice?: number;
  costs: CostInput[];
}

export const profitCalculatorApi = {
  /** 利润计算列表 */
  list: (params?: { page?: number; limit?: number }) =>
    api.get<{ items: ProfitCalculation[]; total: number }>('/profit-calculator', { params }),

  /** 计算详情 */
  getById: (id: string) => api.get<ProfitCalculation>(`/profit-calculator/${id}`),

  /** 创建/保存计算 */
  create: (data: Partial<ProfitCalculation>) =>
    api.post<ProfitCalculation>('/profit-calculator', data),

  /** 更新计算 */
  update: (id: string, data: Partial<ProfitCalculation>) =>
    api.patch<ProfitCalculation>(`/profit-calculator/${id}`, data),

  /** 删除计算 */
  delete: (id: string) => api.delete(`/profit-calculator/${id}`),

  /** 执行计算（不保存） */
  calculate: (input: CalculateInput) =>
    api.post<PricingResult>('/profit-calculator/calculate', input),

  /** 场景模拟 */
  simulate: (id: string, scenarios: ScenarioSimulation[]) =>
    api.post<ScenarioSimulation[]>(`/profit-calculator/${id}/simulate`, { scenarios }),
};
