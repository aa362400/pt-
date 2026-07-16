import { useCallback, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, AlertTriangle,
  BarChart3, Users, FileText, Minus, X, Bot, Sparkles, Send, Package
} from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import Modal from '../components/ui/Modal.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import MarketplaceSwitcher from '../components/platform/MarketplaceSwitcher';
import { storeMonitorApi } from '../api/store-monitor';
import { productsApi } from '../api/products';
import { createAgentRun, waitForAgentRun } from '../api/agentRuns';
import { channelsApi, type ChannelConnection } from '../api/channels';
import { tasksApi } from '../api/tasks';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useMarketplaceProvider } from '../hooks/useMarketplaceProvider';
import {
  activeChannelForProvider,
  marketplaceConfig,
  marketplaceSource,
  type MarketplaceProvider,
} from '../lib/marketplaces';
import type { StorePerformanceSnapshot } from '../api/store-monitor';
import type { AlertItem } from '../types';
import type { InventoryAlert } from '../types';

interface AssistantAgentOutput {
  reply?: string;
  response?: string;
}

// Interfaces for data fetched from APIs
interface StoreRow {
  name: string;
  health: number | null;
  orders: number;
  sales: string;
  conv: string;
  alert: boolean;
}

const EMPTY_MARKETPLACE_COUNTS: Record<MarketplaceProvider, number> = {
  OZON: 0,
  TEMU: 0,
};

function productMarketplace(product: { metadata?: Record<string, unknown> | null }): MarketplaceProvider | null {
  const source = product.metadata?.source;
  if (source === 'ozon') return 'OZON';
  if (source === 'temu') return 'TEMU';
  return null;
}

function StoreMonitor() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { activeProvider, activeMarketplace, setActiveProvider } =
    useMarketplaceProvider();

  // Modal states
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [alertDetailModalOpen, setAlertDetailModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  // AI chat messages
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);

  // API state
  const [healthScore, setHealthScore] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [acos, setAcos] = useState(0);
  const [negativeRate, setNegativeRate] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [inventory, setInventory] = useState<InventoryAlert[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [marketplaceProductCounts, setMarketplaceProductCounts] = useState<
    Record<MarketplaceProvider, number>
  >(EMPTY_MARKETPLACE_COUNTS);
  const [marketplaceChannels, setMarketplaceChannels] = useState<ChannelConnection[]>([]);
  const [marketplaceOrderCounts, setMarketplaceOrderCounts] = useState<
    Record<MarketplaceProvider, number>
  >(EMPTY_MARKETPLACE_COUNTS);
  const [loading, setLoading] = useState(true);
  const [optimizationRunning, setOptimizationRunning] = useState(false);
  const [restockSubmitting, setRestockSubmitting] = useState(false);

  const hasMetrics = stores.length > 0 || todayOrders > 0 || todaySales > 0;
  const trendData = useMemo(
    () =>
      hasMetrics
        ? [
            {
              month: '当前',
              orders: todayOrders,
              sales: todaySales,
              conversion: conversionRate,
            },
          ]
        : [],
    [conversionRate, hasMetrics, todayOrders, todaySales],
  );

  // Store detail info (derived from live state)
  const storeDetailInfo = useMemo(() => ({
    name: t('storeMonitor.detailStoreName'),
    health: healthScore,
    orders: todayOrders,
    sales: `$${todaySales.toLocaleString()}`,
    conv: `${conversionRate}%`,
    acos: `${acos}%`,
    negativeRate: `${negativeRate}%`,
    alerts: alerts.map((alert) => alert.title),
    suggestions: [],
  }), [alerts, t, healthScore, todayOrders, todaySales, conversionRate, acos, negativeRate]);

  const fetchData = useCallback(async (silent = false) => {
    try {
      const [summaryRes, alertsRes, inventoryRes, productsRes, channelsRes, ordersRes] = await Promise.all([
        storeMonitorApi.getSummary({ platform: activeProvider }),
        storeMonitorApi.listAlerts({ limit: 20, platform: activeProvider }),
        storeMonitorApi.listInventoryAlerts(),
        productsApi.list({ limit: 100 }),
        channelsApi.list({ limit: 100 }),
        channelsApi.listOrders({ limit: 1, provider: 'OZON' }),
      ]);

        // Health metrics from summary
        const h = summaryRes.health;
        setHealthScore(h.score);
        setTodayOrders(h.orders);
        setTodaySales(h.sales);
        setConversionRate(h.conversion);
        setAcos(h.acos);
        setNegativeRate(h.negativeRate);

        // Alerts
        setAlerts(alertsRes.items || []);

        // Stores — transform StorePerformance[] to StoreRow[]
        const storeRows: StoreRow[] = (summaryRes.performance || []).map((p: StorePerformanceSnapshot) => ({
          name: p.platform,
          health: typeof p.healthScore === 'number' ? p.healthScore : null,
          orders: p.orders,
          sales: `$${p.revenue.toLocaleString()}`,
          conv: typeof p.conversionRate === 'number' ? `${p.conversionRate}%` : '无样本',
          alert: p.growth < 0,
        }));
        setStores(storeRows.length > 0 ? storeRows : []);

        // Inventory
        setInventory(inventoryRes || []);
        setProductTotal(productsRes.total ?? 0);
        const productCounts = { ...EMPTY_MARKETPLACE_COUNTS };
        (productsRes.items ?? []).forEach((product) => {
          const provider = productMarketplace(product);
          if (provider) productCounts[provider] += 1;
        });
        setMarketplaceProductCounts(productCounts);
        setMarketplaceChannels(channelsRes.items ?? []);
        setMarketplaceOrderCounts({
          OZON: ordersRes.total ?? 0,
          TEMU: 0,
        });
    } catch (err: any) {
      if (!silent) {
        addToast(err?.message ?? t('storeMonitor.loadingData'), 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeProvider, addToast, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refreshStoreSilently = useCallback(() => fetchData(true), [fetchData]);
  useAutoRefresh(refreshStoreSilently, 10000);

  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setAiInput('');
    try {
      const created = await createAgentRun<AssistantAgentOutput>('GENERAL_ASSISTANT', {
        assistantId: 'store-monitor',
        prompt: userMsg,
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const reply =
        completed.output?.reply ??
        completed.output?.response ??
        '智能体已完成，但没有返回可展示内容。';
      setAiMessages((prev) => [...prev, {
        role: 'assistant',
        text: reply
      }]);
    } catch (err: any) {
      addToast(err?.message ?? '店铺智能体调用失败', 'error');
      setAiMessages((prev) => [...prev, {
        role: 'assistant',
        text: '店铺智能体调用失败，页面没有生成本地假回复。'
      }]);
    }
  };

  const handleAlertClick = (alert: AlertItem) => {
    setSelectedAlert(alert);
    setAlertDetailModalOpen(true);
  };

  const handleCreateOptimizationPlan = async () => {
    if (activeProvider !== 'OZON') {
      addToast('TEMU 店铺运营暂缓接入，当前只执行 Ozon。', 'error');
      return;
    }
    if (optimizationRunning) return;
    setOptimizationRunning(true);
    try {
      const prompt = [
        '请基于真实 Ozon 店铺监控数据生成可执行优化计划。',
        `订单数：${todayOrders}`,
        `销售额：${todaySales}`,
        `转化率：${conversionRate}%`,
        `ACOS：${acos}%`,
        `退款/负评率：${negativeRate}%`,
        `商品数：${activeProductCount}`,
        `订单落库数：${activeOrderCount}`,
        `告警：${alerts.map((alert) => alert.title).join('；') || '无'}`,
        '要求：只输出需要人工执行或审批的动作，不要声称已经写入 Ozon 店铺。',
      ].join('\n');
      const created = await createAgentRun<AssistantAgentOutput>('GENERAL_ASSISTANT', {
        assistantId: 'ozon-store-optimizer',
        prompt,
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const reply =
        completed.output?.reply ??
        completed.output?.response ??
        '智能体已完成，但没有返回可展示优化计划。';
      const task = await tasksApi.create({
        title: '执行 Ozon 店铺优化计划',
        description: `${reply}\n\n来源：店铺监控页真实智能体运行 ${completed.id}。外部店铺写入仍需人工确认。`,
        workspaceId: activeMarketplaceChannel?.workspaceId,
        priority: 'HIGH',
      });
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `已生成 Ozon 优化计划，并创建真实团队任务：${task.title}。`,
        },
      ]);
      addToast('Ozon 优化计划已生成并创建团队任务。', 'success');
      setOptimizeModalOpen(false);
    } catch (err: any) {
      addToast(err?.message ?? 'Ozon 优化计划生成失败，未创建假任务。', 'error');
    } finally {
      setOptimizationRunning(false);
    }
  };

  const handleSubmitRestockApproval = async () => {
    if (activeProvider !== 'OZON') {
      addToast('TEMU 补货暂缓接入，当前只执行 Ozon。', 'error');
      return;
    }
    if (restockSubmitting) return;
    setRestockSubmitting(true);
    try {
      const description =
        inventory.length > 0
          ? inventory
              .map((item) => `${item.product} / SKU ${item.sku}：当前 ${item.currentStock}，安全库存 ${item.minStock}`)
              .join('\n')
          : [
              '当前没有真实 Ozon 库存告警样本。',
              '原因：商品目录同步已接入，但库存字段尚未从 Ozon 库存接口落库。',
              '处理：先核查 Ozon 库存接口权限与同步任务，再决定是否发起补货。',
            ].join('\n');
      const task = await tasksApi.create({
        title: inventory.length > 0 ? 'Ozon 补货审批' : '核查 Ozon 库存数据源',
        description,
        workspaceId: activeMarketplaceChannel?.workspaceId,
        priority: inventory.length > 0 ? 'URGENT' : 'HIGH',
      });
      addToast(`已创建真实团队任务：${task.title}。未向 Ozon 下发补货动作。`, 'success');
      setRestockModalOpen(false);
    } catch (err: any) {
      addToast(err?.message ?? '补货任务创建失败，未提交假审批。', 'error');
    } finally {
      setRestockSubmitting(false);
    }
  };

  const detailMetricItems = useMemo(() => [
    { label: t('storeMonitor.detailHealth'), value: storeDetailInfo.health, color: '#34D399' },
    { label: t('storeMonitor.detailOrders'), value: storeDetailInfo.orders, color: '#1A1A2E' },
    { label: t('storeMonitor.detailSales'), value: storeDetailInfo.sales, color: '#1A1A2E' },
    { label: t('storeMonitor.detailConversion'), value: storeDetailInfo.conv, color: '#1A1A2E' },
    { label: t('storeMonitor.detailAcos'), value: storeDetailInfo.acos, color: '#FF5A6A' },
    { label: t('storeMonitor.detailNegativeRate'), value: storeDetailInfo.negativeRate, color: '#FFB020' },
  ], [t, storeDetailInfo]);

  const insightItems = useMemo(() => [
    { label: t('storeMonitor.insightAdPerformance'), value: '未接入广告接口', color: '#9CA3AF', icon: TrendingUp },
    { label: t('storeMonitor.insightTrafficSource'), value: '未接入流量接口', color: '#9CA3AF', icon: BarChart3 },
    { label: t('storeMonitor.insightConversionFunnel'), value: `${conversionRate}%`, color: '#6C63FF', icon: Users },
    { label: t('storeMonitor.insightUserReviews'), value: '未接入评价接口', color: '#9CA3AF', icon: FileText },
  ], [t, conversionRate]);

  const activeMarketplaceChannel = useMemo(
    () => activeChannelForProvider(marketplaceChannels, activeProvider),
    [activeProvider, marketplaceChannels],
  );
  const activeProductCount = marketplaceProductCounts[activeProvider] ?? 0;
  const activeOrderCount = marketplaceOrderCounts[activeProvider] ?? 0;
  const activeSource = marketplaceSource(activeProvider);
  const activeConfig = marketplaceConfig[activeProvider];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1A1A2E]">{t('storeMonitor.pageTitle')}</h2>
        <p className="text-sm text-[#6B7280] mt-1">{t('storeMonitor.pageSubtitle')}</p>
      </div>

      <MarketplaceSwitcher
        activeProvider={activeProvider}
        onChange={setActiveProvider}
        channels={marketplaceChannels}
        productCounts={marketplaceProductCounts}
        orderCounts={marketplaceOrderCounts}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-[#DDE6FF] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7FAFF] text-[#005BFF]">
            <Package size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">
              {activeMarketplace.label} 商品与订单同步状态
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">
              当前 `/products` 回读 {productTotal} 个商品，其中 {activeMarketplace.label} 来源商品 {activeProductCount} 个；
              `/channels/orders` 已落库 {activeOrderCount} 条 {activeMarketplace.label} 订单。
              {activeMarketplaceChannel
                ? `已绑定可用 ${activeMarketplace.label} 渠道，页面会按 ${activeSource} 数据刷新。`
                : activeConfig.emptyState}
              广告 ACOS 仍依赖平台广告接口，未返回样本时不会填充假数据。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => navigate(`/orders?provider=${activeProvider}`)}
            className="h-9 rounded-lg bg-[#005BFF] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            打开订单同步
          </button>
          <button
            onClick={() => navigate(`/products?provider=${activeProvider}`)}
            className="h-9 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-semibold text-[#4A5578] transition-colors hover:bg-[#F8F9FF]"
          >
            打开商品管理
          </button>
        </div>
      </div>

      {/* ---- Optimize Modal ---- */}
      <Modal open={optimizeModalOpen} onClose={() => setOptimizeModalOpen(false)} title={t('storeMonitor.optimizeTitle')} width="max-w-xl">
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] p-4">
            <h4 className="text-sm font-semibold text-[#1A1A2E]">生成 Ozon 优化计划</h4>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
              系统会把当前真实 Ozon 商品、订单、告警和指标发给店铺智能体，成功后创建团队任务。这里不会直接发布 Listing、调价或改库存。
            </p>
          </div>
          <button
            className="w-full rounded-lg bg-[#6C63FF] py-2.5 text-xs font-medium text-white hover:bg-[#5B52E0] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            disabled={optimizationRunning}
            onClick={() => { void handleCreateOptimizationPlan(); }}
          >
            {optimizationRunning ? '生成中' : '调用智能体并创建任务'}
          </button>
        </div>
      </Modal>

      {/* ---- Restock Modal ---- */}
      <Modal open={restockModalOpen} onClose={() => setRestockModalOpen(false)} title={t('storeMonitor.restockTitle')} width="max-w-2xl">
        <div className="space-y-4">
          <p className="text-xs text-[#6B7280]">
            库存补货目前没有真实后端数据源，页面未展示模拟 SKU 或模拟供应商计划。
          </p>
          {inventory.length > 0 ? (
            <div className="space-y-2">
              {inventory.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#E8E8F0] p-3 text-xs">
                  <div>
                    <p className="font-medium text-[#1A1A2E]">{item.product}</p>
                    <p className="text-[#8B93B5]">SKU {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[#1A1A2E]">{item.currentStock}</p>
                    <p className="text-[#8B93B5]">安全库存 {item.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-6 text-center text-xs text-[#8B93B5]">
              无真实库存告警样本。
            </div>
          )}
          <button
            className="w-full rounded-lg bg-[#6C63FF] py-2.5 text-xs font-medium text-white hover:bg-[#5B52E0] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            disabled={restockSubmitting}
            onClick={() => { void handleSubmitRestockApproval(); }}
          >
            {restockSubmitting ? '提交中' : '创建真实补货/核查任务'}
          </button>
        </div>
      </Modal>

      {/* ---- Store Detail Modal ---- */}
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={t('storeMonitor.detailTitle')} width="max-w-xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {detailMetricItems.map((item) => (
              <div key={item.label} className="rounded-lg bg-[#F8F9FF] p-3 text-center">
                <p className="text-xs text-[#8B93B5] mb-1">{item.label}</p>
                <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#FF5A6A] mb-2 flex items-center gap-1"><AlertTriangle size={12} /> {t('storeMonitor.detailCurrentAnomalies')}</h4>
            <div className="space-y-1.5">
              {storeDetailInfo.alerts.length > 0 ? storeDetailInfo.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#FF5A6A]" />
                  {a}
                </div>
              )) : (
                <div className="text-xs text-[#8B93B5]">暂无真实告警样本。</div>
              )}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#6C63FF] mb-2 flex items-center gap-1"><Sparkles size={12} /> {t('storeMonitor.suggestions')}</h4>
            <div className="space-y-1.5">
              {storeDetailInfo.suggestions.length > 0 ? storeDetailInfo.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#6C63FF]" />
                  {s}
                </div>
              )) : (
                <div className="text-xs text-[#8B93B5]">暂无结构化智能体建议，请通过右侧聊天框调用真实智能体。</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ---- Alert Detail Modal ---- */}
      <Modal open={alertDetailModalOpen} onClose={() => setAlertDetailModalOpen(false)} title={selectedAlert?.title ?? t('storeMonitor.alerts')} width="max-w-lg">
        {selectedAlert && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${
                selectedAlert.type === 'danger' ? 'bg-[#FF5A6A]' : selectedAlert.type === 'warning' ? 'bg-[#FFB020]' : 'bg-[#4A90FF]'
              }`} />
              <span className={`text-xs font-medium ${
                selectedAlert.type === 'danger' ? 'text-[#FF5A6A]' : selectedAlert.type === 'warning' ? 'text-[#FFB020]' : 'text-[#4A90FF]'
              }`}>
                {selectedAlert.type === 'danger' ? t('storeMonitor.alertSevere') : selectedAlert.type === 'warning' ? t('storeMonitor.alertWarning') : t('storeMonitor.alertInfo')}
              </span>
            </div>
            <div>
              <p className="text-xs text-[#8B93B5] mb-1">{t('common.description')}</p>
              <p className="text-sm text-[#1A1A2E]">{selectedAlert.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#F8F9FF] p-3">
                <p className="text-[10px] text-[#8B93B5] mb-0.5">{t('storeMonitor.alertPlatform')}</p>
                <p className="text-sm font-medium text-[#1A1A2E]">{selectedAlert.platform}</p>
              </div>
              <div className="rounded-lg bg-[#F8F9FF] p-3">
                <p className="text-[10px] text-[#8B93B5] mb-0.5">{t('storeMonitor.alertTriggerTime')}</p>
                <p className="text-sm font-medium text-[#1A1A2E]">{selectedAlert.time}</p>
              </div>
            </div>
            <div className="rounded-lg border border-[#F0F0F8] bg-[#FFF8F0] p-3">
              <p className="text-xs font-medium text-[#FFB020] mb-1">{t('storeMonitor.alertSuggestedAction')}</p>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                {selectedAlert.type === 'danger'
                  ? t('storeMonitor.alertActionDanger')
                  : selectedAlert.type === 'warning'
                  ? t('storeMonitor.alertActionWarning')
                  : t('storeMonitor.alertActionInfo')}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Metrics Row */}
      <div className="grid grid-cols-6 gap-4">
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricHealthScore')}</p>
          <p className="text-2xl font-bold text-[#6C63FF]">{healthScore}</p>
          <p className="text-xs text-[#8B93B5] font-medium">/100 {hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricTodayOrders')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{todayOrders.toLocaleString()}</p>
          <p className="text-xs text-[#8B93B5] font-medium">{hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricTodaySales')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">${todaySales.toLocaleString()}</p>
          <p className="text-xs text-[#8B93B5] font-medium">{hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricConversion')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{conversionRate}%</p>
          <p className="text-xs text-[#8B93B5] font-medium">{hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricAcos')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{acos}%</p>
          <p className="text-xs text-[#8B93B5] font-medium">{hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricNegativeRate')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{negativeRate}%</p>
          <p className="text-xs text-[#8B93B5] font-medium">{hasMetrics ? '真实回读' : '无样本'}</p>
        </div>
      </div>

      {/* Main content 75% + Right sidebar 25% */}
      <div className="grid grid-cols-4 gap-5">
        {/* Left 3 cols */}
        <div className="col-span-3 space-y-5">
          {/* First row: trend cards + alerts */}
          <div className="grid grid-cols-2 gap-5">
            {/* Core Metrics Trend */}
            <ChartCard title={t('storeMonitor.chartCoreMetrics')}>
              <div className="grid grid-cols-3 gap-3">
                {(['orders', 'sales', 'conversion'] as const).map((metric) => (
                  <div key={metric} className="rounded-lg bg-[#F8F9FF] p-3">
                    <p className="text-xs text-[#8B93B5] mb-2">
                      {metric === 'orders' ? t('storeMonitor.chartOrders') : metric === 'sales' ? t('storeMonitor.chartSales') : t('storeMonitor.chartConversion')}
                    </p>
                    <div className="h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <Line type="monotone" dataKey={metric} stroke="#6C63FF" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Alert Center */}
            <ChartCard title={t('storeMonitor.chartAlertCenter')}>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loading ? (
                  <div className="text-xs text-[#8B93B5] text-center py-4">{t('common.loading')}</div>
                ) : alerts.length > 0 ? (
                  alerts.map((alert, idx) => (
                    <div
                      key={alert.id || idx}
                      data-testid={`alert-item-${idx}`}
                      className="flex items-start gap-2 pb-2 border-b border-[#F0F0F8] last:border-0 cursor-pointer hover:bg-[#F8F9FF] rounded px-1 transition-colors"
                      onClick={() => handleAlertClick(alert)}
                    >
                      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        alert.type === 'danger' ? 'bg-[#FF5A6A]' : alert.type === 'warning' ? 'bg-[#FFB020]' : 'bg-[#4A90FF]'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#1A1A2E]">{alert.title}</p>
                        <p className="text-[10px] text-[#8B93B5] truncate">{alert.description}</p>
                      </div>
                      <span className="text-[10px] text-[#9CA3AF] shrink-0">{alert.time}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#8B93B5] text-center py-4">暂无真实告警样本。</div>
                )}
              </div>
            </ChartCard>
          </div>

          {/* Store Performance Table */}
          <ChartCard title={t('storeMonitor.chartStorePerformance')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8]">
                  <th className="text-left py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableStore')}</th>
                  <th className="text-right py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableHealth')}</th>
                  <th className="text-right py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableOrders')}</th>
                  <th className="text-right py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableSales')}</th>
                  <th className="text-right py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableConversion')}</th>
                  <th className="text-center py-2 text-xs text-[#8B93B5] font-medium">{t('storeMonitor.tableAlert')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-[#8B93B5]">{t('common.loading')}</td></tr>
                ) : stores.length > 0 ? (
                  stores.map((s) => (
                    <tr key={s.name} className="border-b border-[#F0F0F8]">
                      <td className="py-3 text-sm text-[#1A1A2E]">{s.name}</td>
                      <td className="py-3 text-right">
                        {s.health === null ? (
                          <span className="text-[#8B93B5]">无样本</span>
                        ) : (
                          <span className={`font-medium ${s.health >= 80 ? 'text-[#34D399]' : 'text-[#FF5A6A]'}`}>{s.health}</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.orders}</td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.sales}</td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.conv}</td>
                      <td className="py-3 text-center">
                        {s.alert ? <AlertTriangle size={14} className="inline text-[#FFB020]" /> : <span className="text-[#34D399] text-xs">{t('storeMonitor.tableNormal')}</span>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-[#8B93B5]">暂无真实店铺指标样本。</td></tr>
                )}
              </tbody>
            </table>
          </ChartCard>

          {/* Bottom row: card insights + inventory */}
          <div className="grid grid-cols-2 gap-5">
            <ChartCard title={t('storeMonitor.chartKeywordInsights')}>
              <div className="grid grid-cols-2 gap-3">
                {insightItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-lg bg-[#F8F9FF] p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} style={{ color: item.color }} />
                        <span className="text-xs text-[#8B93B5]">{item.label}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#1A1A2E]">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            </ChartCard>

            <ChartCard title={t('storeMonitor.chartInventoryAlerts')}>
              <div className="space-y-2">
                {loading ? (
                  <div className="text-xs text-[#8B93B5] text-center py-4">{t('common.loading')}</div>
                ) : inventory.length > 0 ? (
                  inventory.map((item) => (
                    <div key={item.id ?? item.product} className="flex items-center justify-between pb-2 border-b border-[#F0F0F8] last:border-0">
                      <div>
                        <p className="text-sm text-[#1A1A2E]">{item.product}</p>
                        <p className="text-[10px] text-[#8B93B5]">{t('storeMonitor.inventorySafeStock', { stock: item.minStock })}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${item.status === 'critical' ? 'text-[#FF5A6A]' : item.status === 'low' ? 'text-[#FFB020]' : 'text-[#34D399]'}`}>
                          {item.currentStock}
                        </span>
                        <p className="text-[10px] text-[#8B93B5]">{item.status === 'critical' ? t('storeMonitor.invCritical') : item.status === 'low' ? t('storeMonitor.invLow') : t('storeMonitor.invNormal')}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#8B93B5] text-center py-4">库存告警后端未返回真实样本。</div>
                )}
              </div>
            </ChartCard>
          </div>
        </div>

        {/* Right sidebar - AI Assistant */}
        <div className="col-span-1">
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-[#6C63FF]" />
                <span className="text-sm font-semibold text-[#1A1A2E]">{t('storeMonitor.aiTitle')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1 text-[#8B93B5] hover:text-[#1A1A2E]"><Minus size={14} /></button>
                <button className="p-1 text-[#8B93B5] hover:text-[#1A1A2E]"><X size={14} /></button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Welcome */}
              <div className="rounded-xl bg-[#F0EEFF] p-3">
                <p className="text-xs text-[#4A5578]">{t('storeMonitor.aiWelcome')}</p>
              </div>

              {/* Chat messages */}
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`rounded-xl px-3 py-2 max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-[#6C63FF] text-white'
                      : 'bg-[#F8F9FF] text-[#4A5578]'
                  }`}>
                    <p className="text-xs leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ))}

              {/* Anomalies */}
              <div>
                <h4 className="text-xs font-semibold text-[#FF5A6A] mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> {t('storeMonitor.aiAnomalyAnalysis')}
                </h4>
                <div className="space-y-2">
                  {alerts.length > 0 ? alerts.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#FF5A6A]" />
                      {item.title}
                    </div>
                  )) : (
                    <div className="text-xs text-[#8B93B5]">暂无真实告警样本。</div>
                  )}
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <h4 className="text-xs font-semibold text-[#6C63FF] mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> {t('storeMonitor.aiSmartSuggestions')}
                </h4>
                <div className="space-y-2">
                  <div className="text-xs leading-relaxed text-[#8B93B5]">
                    结构化建议接口未接入。请在下方输入框调用真实店铺智能体，页面不会生成本地假建议。
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  data-testid="btn-optimize"
                  className="w-full rounded-lg border border-[#E8E8F0] py-2 text-xs font-medium text-[#4A5578] hover:bg-[#F0EEFF] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
                  onClick={() => setOptimizeModalOpen(true)}
                >
                  {t('storeMonitor.aiBtnOptimize')}
                </button>
                <button
                  data-testid="btn-restock"
                  className="w-full rounded-lg border border-[#E8E8F0] py-2 text-xs font-medium text-[#4A5578] hover:bg-[#F0EEFF] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
                  onClick={() => setRestockModalOpen(true)}
                >
                  {t('storeMonitor.aiBtnRestock')}
                </button>
                <button
                  data-testid="btn-detail"
                  className="w-full rounded-lg border border-[#E8E8F0] py-2 text-xs font-medium text-[#4A5578] hover:bg-[#F0EEFF] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
                  onClick={() => setDetailModalOpen(true)}
                >
                  {t('storeMonitor.aiBtnDetails')}
                </button>
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-[#E8E8F0] p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={t('storeMonitor.aiInputPlaceholder')}
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAiSend(); }}
                  className="flex-1 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-xs text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF]"
                />
                <button
                  data-testid="btn-ai-send"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6C63FF] text-white hover:bg-[#5B52E0] transition-colors"
                  onClick={handleAiSend}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoreMonitor;
