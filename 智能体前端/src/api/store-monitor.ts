import { api } from './client';
import type { StoreHealthMetrics, AlertItem, StorePerformance, InventoryAlert } from '../types';

export interface StoreMetricsSummary {
  health: StoreHealthMetrics;
  performance: StorePerformance[];
  alerts: AlertItem[];
  inventory: InventoryAlert[];
}

export const storeMonitorApi = {
  /** 店铺指标总览 */
  getSummary: (params?: { platform?: string; period?: string }) =>
    api.get<StoreMetricsSummary>('/store-monitor/summary', { params }),

  /** 健康指标 */
  getHealth: (params?: { platform?: string }) =>
    api.get<StoreHealthMetrics>('/store-monitor/health', { params }),

  /** 告警列表 */
  listAlerts: (params?: { page?: number; limit?: number; type?: string }) =>
    api.get<{ items: AlertItem[]; total: number }>('/store-monitor/alerts', { params }),

  /** 店铺表现 */
  listPerformance: (params?: { platform?: string; period?: string }) =>
    api.get<StorePerformance[]>('/store-monitor/performance', { params }),

  /** 库存告警 */
  listInventoryAlerts: (params?: { status?: string }) =>
    api.get<InventoryAlert[]>('/store-monitor/inventory', { params }),
};
