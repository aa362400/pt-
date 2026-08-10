import { api } from './client';
import type {
  AlertItem,
  InventoryAlert,
  StoreHealthMetrics,
  StorePerformance,
} from '../types';

interface Workspace {
  id: string;
  name: string;
  channelType?: string;
  marketplace?: string | null;
}

interface StoreMetricSnapshot {
  id: string;
  workspaceId: string;
  date: string;
  healthScore?: number | null;
  orders: number;
  revenue: number | string;
  conversionRate?: number | null;
  acos?: number | null;
  reviewRate?: number | null;
  refundRate?: number | null;
}

export interface StorePerformanceSnapshot extends StorePerformance {
  healthScore?: number | null;
  conversionRate?: number | null;
  acos?: number | null;
  refundRate?: number | null;
}

interface BackendAlert {
  id: string;
  workspaceId?: string | null;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  title: string;
  description?: string | null;
  status: string;
  createdAt: string;
}

export interface StoreMetricsSummary {
  health: StoreHealthMetrics;
  performance: StorePerformanceSnapshot[];
  alerts: AlertItem[];
  inventory: InventoryAlert[];
}

async function listWorkspaces(): Promise<Workspace[]> {
  const res = await api.get<{ items: Workspace[]; total: number }>(
    '/workspaces',
    { params: { limit: 50 } },
  );
  return res.items;
}

function getDateRange(period?: string): { from?: string; to?: string } {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function listMetricsForWorkspace(
  workspaceId: string,
  period?: string,
): Promise<StoreMetricSnapshot[]> {
  return api.get<StoreMetricSnapshot[]>('/store-monitoring/metrics', {
    params: {
      workspaceId,
      ...getDateRange(period),
    },
  });
}

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function severityToType(alert: BackendAlert): AlertItem['type'] {
  if (alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY') {
    return 'danger';
  }
  if (alert.severity === 'WARNING') return 'warning';
  return 'info';
}

function mapAlert(
  alert: BackendAlert,
  workspaceById: Map<string, Workspace>,
): AlertItem {
  const workspace = alert.workspaceId
    ? workspaceById.get(alert.workspaceId)
    : undefined;
  return {
    id: alert.id,
    type: severityToType(alert),
    title: alert.title,
    description: alert.description ?? '',
    time: new Date(alert.createdAt).toLocaleString('zh-CN', { hour12: false }),
    platform: workspace?.name ?? workspace?.marketplace ?? 'english_text',
  };
}

function buildPerformance(
  workspace: Workspace,
  metrics: StoreMetricSnapshot[],
): StorePerformanceSnapshot | null {
  if (metrics.length === 0) return null;
  const latest = metrics[metrics.length - 1];
  const previous = metrics.length > 1 ? metrics[metrics.length - 2] : null;
  const revenue = numberValue(latest.revenue);
  const previousRevenue = previous ? numberValue(previous.revenue) : revenue;
  const growth =
    previousRevenue > 0
      ? Math.round(((revenue - previousRevenue) / previousRevenue) * 1000) / 10
      : 0;

  return {
    platform: workspace.name,
    revenue,
    orders: latest.orders,
    profit: 0,
    growth,
    healthScore: latest.healthScore,
    conversionRate: latest.conversionRate,
    acos: latest.acos,
    refundRate: latest.refundRate,
  };
}

function matchesWorkspacePlatform(workspace: Workspace, platform?: string): boolean {
  if (!platform) return true;
  const target = platform.toUpperCase();
  return [workspace.channelType, workspace.marketplace, workspace.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toUpperCase().includes(target));
}

async function loadMonitoringData(period?: string, platform?: string) {
  const workspaces = (await listWorkspaces()).filter((workspace) =>
    matchesWorkspacePlatform(workspace, platform),
  );
  const metricsByWorkspace = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      metrics: await listMetricsForWorkspace(workspace.id, period),
    })),
  );
  const workspaceById = new Map(workspaces.map((item) => [item.id, item]));
  return { workspaces, metricsByWorkspace, workspaceById };
}

export const storeMonitorApi = {
  getSummary: async (params?: {
    platform?: string;
    period?: string;
  }): Promise<StoreMetricsSummary> => {
    const { metricsByWorkspace, workspaceById } = await loadMonitoringData(
      params?.period,
      params?.platform,
    );
    const latestSnapshots = metricsByWorkspace
      .map((item) => item.metrics.at(-1))
      .filter((item): item is StoreMetricSnapshot => Boolean(item));

    const orders = latestSnapshots.reduce((sum, item) => sum + item.orders, 0);
    const sales = latestSnapshots.reduce(
      (sum, item) => sum + numberValue(item.revenue),
      0,
    );
    const healthSamples = latestSnapshots
      .map((item) => item.healthScore)
      .filter((item): item is number => typeof item === 'number');
    const conversionSamples = latestSnapshots
      .map((item) => item.conversionRate)
      .filter((item): item is number => typeof item === 'number');
    const acosSamples = latestSnapshots
      .map((item) => item.acos)
      .filter((item): item is number => typeof item === 'number');
    const refundSamples = latestSnapshots
      .map((item) => item.refundRate)
      .filter((item): item is number => typeof item === 'number');

    const alertsRes = await api.get<{ items: BackendAlert[]; total: number }>(
      '/store-monitoring/alerts',
      { params: { limit: 20, status: 'OPEN' } },
    );

    return {
      health: {
        score:
          healthSamples.length > 0
            ? Math.round(
                healthSamples.reduce((sum, item) => sum + item, 0) /
                  healthSamples.length,
              )
            : 0,
        orders,
        sales,
        conversion:
          conversionSamples.length > 0
            ? Math.round(
                (conversionSamples.reduce((sum, item) => sum + item, 0) /
                  conversionSamples.length) *
                  100,
              ) / 100
            : 0,
        acos:
          acosSamples.length > 0
            ? Math.round(
                (acosSamples.reduce((sum, item) => sum + item, 0) /
                  acosSamples.length) *
                  100,
              ) / 100
            : 0,
        negativeRate:
          refundSamples.length > 0
            ? Math.round(
                (refundSamples.reduce((sum, item) => sum + item, 0) /
                  refundSamples.length) *
                  100,
              ) / 100
            : 0,
      },
      performance: metricsByWorkspace
        .map((item) => buildPerformance(item.workspace, item.metrics))
        .filter((item): item is StorePerformanceSnapshot => Boolean(item)),
      alerts: alertsRes.items.map((alert) => mapAlert(alert, workspaceById)),
      inventory: [],
    };
  },

  getHealth: async (params?: { platform?: string }) => {
    const summary = await storeMonitorApi.getSummary({
      platform: params?.platform,
      period: '30d',
    });
    return summary.health;
  },

  listAlerts: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
    platform?: string;
  }) => {
    const workspaces = (await listWorkspaces()).filter((workspace) =>
      matchesWorkspacePlatform(workspace, params?.platform),
    );
    const workspaceById = new Map(workspaces.map((item) => [item.id, item]));
    const res = await api.get<{ items: BackendAlert[]; total: number }>(
      '/store-monitoring/alerts',
      {
        params: {
          page: params?.page,
          limit: params?.limit,
          status: 'OPEN',
        },
      },
    );
    return {
      ...res,
      items: res.items
        .filter((alert) => !alert.workspaceId || workspaceById.has(alert.workspaceId))
        .map((alert) => mapAlert(alert, workspaceById)),
    };
  },

  listPerformance: async (params?: {
    platform?: string;
    period?: string;
  }) => {
    const { metricsByWorkspace } = await loadMonitoringData(
      params?.period,
      params?.platform,
    );
    return metricsByWorkspace
      .map((item) => buildPerformance(item.workspace, item.metrics))
      .filter((item): item is StorePerformanceSnapshot => Boolean(item));
  },

  listInventoryAlerts: async (): Promise<InventoryAlert[]> => [],
};
