import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, AlertTriangle,
  BarChart3, Users, FileText, Minus, X, Bot, Sparkles, Send
} from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import Modal from '../components/ui/Modal.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import { storeMonitorApi } from '../api/store-monitor';
import { dashboardApi } from '../api/dashboard';
import type { AlertItem } from '../types';
import type { StorePerformance, InventoryAlert } from '../types';

// Interfaces for data fetched from APIs
interface StoreRow {
  name: string;
  health: number;
  orders: number;
  sales: string;
  conv: string;
  alert: boolean;
}

function StoreMonitor() {
  const { t } = useTranslation();
  const { addToast } = useToast();

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
  const [healthScore, setHealthScore] = useState(92);
  const [todayOrders, setTodayOrders] = useState(1243);
  const [todaySales, setTodaySales] = useState(24589);
  const [conversionRate, setConversionRate] = useState(3.28);
  const [acos, setAcos] = useState(22.6);
  const [negativeRate, setNegativeRate] = useState(0.45);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Trend data for charts — locale-aware month labels
  const trendData = useMemo(() => [
    { month: t('common.monthJan'), orders: 850, sales: 18500, conversion: 2.8 },
    { month: t('common.monthFeb'), orders: 920, sales: 20500, conversion: 3.0 },
    { month: t('common.monthMar'), orders: 1050, sales: 23500, conversion: 3.1 },
    { month: t('common.monthApr'), orders: 1100, sales: 24800, conversion: 3.2 },
    { month: t('common.monthMay'), orders: 1180, sales: 25800, conversion: 3.3 },
    { month: t('common.monthJun'), orders: 1243, sales: 24589, conversion: 3.28 },
  ], [t]);

  // Sample optimization suggestions
  const optimizationSuggestions = useMemo(() => [
    { title: t('storeMonitor.optimizeSugg1Title'), desc: t('storeMonitor.optimizeSugg1Desc'), impact: t('storeMonitor.optimizeSugg1Impact') },
    { title: t('storeMonitor.optimizeSugg2Title'), desc: t('storeMonitor.optimizeSugg2Desc'), impact: t('storeMonitor.optimizeSugg2Impact') },
    { title: t('storeMonitor.optimizeSugg3Title'), desc: t('storeMonitor.optimizeSugg3Desc'), impact: t('storeMonitor.optimizeSugg3Impact') },
  ], [t]);

  // Sample restock plan
  const restockPlan = useMemo(() => [
    { sku: 'BS-001', product: t('storeMonitor.productBlender'), currentStock: 23, suggestedQty: 200, estimatedOutOfStock: '2026-07-10', supplier: t('storeMonitor.supplierShenzhen') },
    { sku: 'YB-002', product: t('storeMonitor.productYogaMat'), currentStock: 45, suggestedQty: 150, estimatedOutOfStock: '2026-07-15', supplier: t('storeMonitor.supplierYiwu') },
    { sku: 'CW-003', product: t('storeMonitor.productCarCharger'), currentStock: 12, suggestedQty: 180, estimatedOutOfStock: '2026-07-08', supplier: t('storeMonitor.supplierDongguan') },
    { sku: 'ZB-004', product: t('storeMonitor.productBottle'), currentStock: 156, suggestedQty: 0, estimatedOutOfStock: t('storeMonitor.restockSufficient'), supplier: t('storeMonitor.supplierZhejiang') },
  ], [t]);

  // Store detail info (derived from live state)
  const storeDetailInfo = useMemo(() => ({
    name: t('storeMonitor.detailStoreName'),
    health: healthScore,
    orders: todayOrders,
    sales: `$${todaySales.toLocaleString()}`,
    conv: `${conversionRate}%`,
    acos: `${acos}%`,
    negativeRate: `${negativeRate}%`,
    alerts: [
      t('storeMonitor.detailAlertRefundRate'),
      t('storeMonitor.detailAlertLowStock'),
      t('storeMonitor.detailAlertAcosIncrease'),
    ],
    suggestions: [
      t('storeMonitor.detailSuggestion1'),
      t('storeMonitor.detailSuggestion2'),
      t('storeMonitor.detailSuggestion3'),
    ],
  }), [t, healthScore, todayOrders, todaySales, conversionRate, acos, negativeRate]);

  // Locale-aware anomaly / suggestion lists for AI sidebar
  const aiAnomalies = useMemo(() => [
    t('storeMonitor.aiAnomaly1'),
    t('storeMonitor.aiAnomaly2'),
    t('storeMonitor.aiAnomaly3'),
  ], [t]);

  const aiSuggestions = useMemo(() => [
    t('storeMonitor.aiSuggestion1'),
    t('storeMonitor.aiSuggestion2'),
    t('storeMonitor.aiSuggestion3'),
  ], [t]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [summaryRes, alertsRes, perfsRes, inventoryRes] = await Promise.all([
          storeMonitorApi.getSummary(),
          storeMonitorApi.listAlerts({ limit: 20 }),
          storeMonitorApi.listPerformance(),
          storeMonitorApi.listInventoryAlerts(),
        ]);
        if (cancelled) return;

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
        const storeRows: StoreRow[] = (perfsRes || []).map((p: StorePerformance) => ({
          name: p.platform,
          health: Math.round(80 + Math.random() * 20),
          orders: p.orders,
          sales: `$${p.revenue.toLocaleString()}`,
          conv: `${((p.orders / Math.max(p.revenue, 1)) * 100).toFixed(1)}%`,
          alert: p.growth < 0,
        }));
        setStores(storeRows.length > 0 ? storeRows : []);

        // Inventory
        setInventory(inventoryRes || []);
      } catch (err: any) {
        if (!cancelled) {
          addToast(err?.message ?? t('storeMonitor.loadingData'), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const handleAiSend = () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setAiInput('');
    setTimeout(() => {
      setAiMessages((prev) => [...prev, {
        role: 'assistant',
        text: t('storeMonitor.aiResponse', { query: userMsg })
      }]);
    }, 300);
  };

  const handleAlertClick = (alert: AlertItem) => {
    setSelectedAlert(alert);
    setAlertDetailModalOpen(true);
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
    { label: t('storeMonitor.insightAdPerformance'), value: t('storeMonitor.insightGood'), color: '#34D399', icon: TrendingUp },
    { label: t('storeMonitor.insightTrafficSource'), value: t('storeMonitor.insightOrganicSearch'), color: '#4A9EFF', icon: BarChart3 },
    { label: t('storeMonitor.insightConversionFunnel'), value: `${conversionRate}%`, color: '#6C63FF', icon: Users },
    { label: t('storeMonitor.insightUserReviews'), value: t('storeMonitor.insightRating'), color: '#FB923C', icon: FileText },
  ], [t, conversionRate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1A1A2E]">{t('storeMonitor.pageTitle')}</h2>
        <p className="text-sm text-[#6B7280] mt-1">{t('storeMonitor.pageSubtitle')}</p>
      </div>

      {/* ---- Optimize Modal ---- */}
      <Modal open={optimizeModalOpen} onClose={() => setOptimizeModalOpen(false)} title={t('storeMonitor.optimizeTitle')} width="max-w-xl">
        <div className="space-y-4">
          {optimizationSuggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#1A1A2E]">{s.title}</h4>
                <span className="text-[10px] text-[#6C63FF] bg-[#F0EEFF] px-2 py-0.5 rounded-full">{s.impact}</span>
              </div>
              <p className="text-xs text-[#6B7280] leading-relaxed">{s.desc}</p>
            </div>
          ))}
          <button
            className="w-full rounded-lg bg-[#6C63FF] py-2.5 text-xs font-medium text-white hover:bg-[#5B52E0] transition-colors"
            onClick={() => { addToast(t('storeMonitor.optimizeApplied'), 'success'); setOptimizeModalOpen(false); }}
          >
            {t('storeMonitor.applyAllOptimizations')}
          </button>
        </div>
      </Modal>

      {/* ---- Restock Modal ---- */}
      <Modal open={restockModalOpen} onClose={() => setRestockModalOpen(false)} title={t('storeMonitor.restockTitle')} width="max-w-2xl">
        <div className="space-y-4">
          <p className="text-xs text-[#6B7280]">{t('storeMonitor.restockDesc')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#F0F0F8]">
                  <th className="text-left py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockSku')}</th>
                  <th className="text-left py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockProduct')}</th>
                  <th className="text-right py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockCurrentStock')}</th>
                  <th className="text-right py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockSuggested')}</th>
                  <th className="text-right py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockEtaOutOfStock')}</th>
                  <th className="text-left py-2 text-[#8B93B5] font-medium">{t('storeMonitor.restockSupplier')}</th>
                </tr>
              </thead>
              <tbody>
                {restockPlan.map((item) => (
                  <tr key={item.sku} className="border-b border-[#F0F0F8] last:border-0">
                    <td className="py-2.5 text-[#1A1A2E] font-medium">{item.sku}</td>
                    <td className="py-2.5 text-[#1A1A2E]">{item.product}</td>
                    <td className={`py-2.5 text-right font-medium ${item.currentStock < 50 ? 'text-[#FF5A6A]' : 'text-[#34D399]'}`}>{item.currentStock}</td>
                    <td className="py-2.5 text-right text-[#6C63FF] font-medium">{item.suggestedQty || '-'}</td>
                    <td className="py-2.5 text-right text-[#FF5A6A]">{item.estimatedOutOfStock}</td>
                    <td className="py-2.5 text-[#6B7280]">{item.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="w-full rounded-lg bg-[#6C63FF] py-2.5 text-xs font-medium text-white hover:bg-[#5B52E0] transition-colors"
            onClick={() => { addToast(t('storeMonitor.restockSubmitted'), 'success'); setRestockModalOpen(false); }}
          >
            {t('storeMonitor.submitRestockApproval')}
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
              {storeDetailInfo.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#FF5A6A]" />
                  {a}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#6C63FF] mb-2 flex items-center gap-1"><Sparkles size={12} /> {t('storeMonitor.suggestions')}</h4>
            <div className="space-y-1.5">
              {storeDetailInfo.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#6C63FF]" />
                  {s}
                </div>
              ))}
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
          <p className="text-xs text-[#34D399] font-medium">/100 {t('storeMonitor.healthExcellent')}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricTodayOrders')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{todayOrders.toLocaleString()}</p>
          <p className="text-xs text-[#34D399] font-medium">{t('storeMonitor.trendUp', { percent: '12.5%' })}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricTodaySales')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">${todaySales.toLocaleString()}</p>
          <p className="text-xs text-[#34D399] font-medium">{t('storeMonitor.trendUp', { percent: '8.3%' })}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricConversion')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{conversionRate}%</p>
          <p className="text-xs text-[#34D399] font-medium">{t('storeMonitor.trendUp', { percent: '0.3%' })}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricAcos')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{acos}%</p>
          <p className="text-xs text-[#FF5A6A] font-medium">{t('storeMonitor.trendUp', { percent: '2.1%' })}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-[#8B93B5] mb-1">{t('storeMonitor.metricNegativeRate')}</p>
          <p className="text-2xl font-bold text-[#1A1A2E]">{negativeRate}%</p>
          <p className="text-xs text-[#34D399] font-medium">{t('storeMonitor.trendDown', { percent: '0.1%' })}</p>
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
                ) : (
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
                ) : (
                  stores.map((s) => (
                    <tr key={s.name} className="border-b border-[#F0F0F8]">
                      <td className="py-3 text-sm text-[#1A1A2E]">{s.name}</td>
                      <td className="py-3 text-right">
                        <span className={`font-medium ${s.health >= 80 ? 'text-[#34D399]' : 'text-[#FF5A6A]'}`}>{s.health}</span>
                      </td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.orders}</td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.sales}</td>
                      <td className="py-3 text-right text-[#1A1A2E]">{s.conv}</td>
                      <td className="py-3 text-center">
                        {s.alert ? <AlertTriangle size={14} className="inline text-[#FFB020]" /> : <span className="text-[#34D399] text-xs">{t('storeMonitor.tableNormal')}</span>}
                      </td>
                    </tr>
                  ))
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
                ) : (
                  inventory.map((item: any) => (
                    <div key={item.id ?? item.product} className="flex items-center justify-between pb-2 border-b border-[#F0F0F8] last:border-0">
                      <div>
                        <p className="text-sm text-[#1A1A2E]">{item.product}</p>
                        <p className="text-[10px] text-[#8B93B5]">{t('storeMonitor.inventorySafeStock', { stock: item.minStock ?? item.min })}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${item.status === 'critical' ? 'text-[#FF5A6A]' : item.status === 'low' ? 'text-[#FFB020]' : 'text-[#34D399]'}`}>
                          {item.currentStock ?? item.stock}
                        </span>
                        <p className="text-[10px] text-[#8B93B5]">{item.status === 'critical' ? t('storeMonitor.invCritical') : item.status === 'low' ? t('storeMonitor.invLow') : t('storeMonitor.invNormal')}</p>
                      </div>
                    </div>
                  ))
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
                  {aiAnomalies.map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#FF5A6A]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <h4 className="text-xs font-semibold text-[#6C63FF] mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> {t('storeMonitor.aiSmartSuggestions')}
                </h4>
                <div className="space-y-2">
                  {aiSuggestions.map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#6C63FF]" />
                      {item}
                    </div>
                  ))}
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
