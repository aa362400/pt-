import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/use-toast.ts';
import {
  Calculator, TrendingUp, BarChart3,
  Trophy, Sparkles, ArrowRight, Settings, RefreshCw,
} from 'lucide-react';
import {
  PieChart as RePieChart, Pie, Cell, ResponsiveContainer,
  LineChart as ReLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import AgentInputDock from '../components/ui/AgentInputDock';
import { profitCalculatorApi as profitCalcApi } from '../api/profit-calculator';
import type { ProfitCalculation, CalculateInput } from '../api/profit-calculator';
import type { ScenarioSimulation } from '../types';

// ---------------------------------------------------------------------------
// Static UI Data (no API equivalents)
// ---------------------------------------------------------------------------

const DONUT_COLORS = ['#6366F1', '#818CF8', '#A78BFA', '#C084FC', '#E879F9', '#F472B6', '#FB923C', '#FBBF24', '#34D399'];

const costLabels = [
  '产品成本',
  '包装成本',
  '头程运费',
  '平台佣金',
  '支付手续费',
  '广告费用',
  '仓储费',
  '其他杂费',
];

const initialCostValues: Record<string, number> = {
  '产品成本': 6.50,
  '包装成本': 0.80,
  '头程运费': 1.20,
  '平台佣金': 2.25,
  '支付手续费': 0.45,
  '广告费用': 1.50,
  '仓储费': 0.35,
  '其他杂费': 0.20,
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-xs shadow-md">
        <p className="font-medium text-[#1A1A2E]">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: ${typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProfitCalculator() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const modes = useMemo(() => [
    { key: 'profit', label: t('profitCalculator.modeProfit') },
    { key: 'pricing', label: t('profitCalculator.modePricing') },
    { key: 'breakeven', label: t('profitCalculator.modeBreakeven') },
    { key: 'scenario', label: t('profitCalculator.modeScenario') },
    { key: 'history', label: t('profitCalculator.modeHistory') },
  ], [t]);

  const months = useMemo(() => [
    t('common.monthJul'),
    t('common.monthAug'),
    t('common.monthSep'),
    t('common.monthOct'),
    t('common.monthNov'),
    t('common.monthDec'),
  ], [t]);
  const [activeMode, setActiveMode] = useState('profit');
  const [costValues, setCostValues] = useState<Record<string, number>>(initialCostValues);
  const [salePrice, setSalePrice] = useState(24.99);

  // API-derived state
  const [estimatedProfit, setEstimatedProfit] = useState(0);
  const [profitMargin, setProfitMargin] = useState(0);
  const [roi, setRoi] = useState(0);
  const [suggestedMin, setSuggestedMin] = useState(22.99);
  const [suggestedMax, setSuggestedMax] = useState(27.99);
  const [scenarios, setScenarios] = useState<ScenarioSimulation[]>([]);
  const [historyList, setHistoryList] = useState<ProfitCalculation[]>([]);
  const [profitTrendData, setProfitTrendData] = useState<any[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  const totalCost = costLabels.reduce((s, label) => s + (costValues[label] ?? 0), 0);

  // Fetch calculation result from API whenever inputs change
  const fetchCalculation = useCallback(async () => {
    const costs: CalculateInput['costs'] = costLabels.map((label) => ({
      label,
      key: label,
      value: costValues[label] ?? 0,
      unit: 'USD',
    }));

    setCalcLoading(true);
    try {
      const result = await profitCalcApi.calculate({ salePrice, costs });
      setEstimatedProfit(result.estimatedProfit);
      setProfitMargin(result.profitMargin);
      setRoi(result.roi);
      setSuggestedMin(result.suggestedMin);
      setSuggestedMax(result.suggestedMax);
    } catch (err: any) {
      // Fall back to local calculation on error
      const localProfit = salePrice - totalCost;
      setEstimatedProfit(localProfit);
      setProfitMargin(salePrice > 0 ? (localProfit / salePrice) * 100 : 0);
      setRoi(totalCost > 0 ? (localProfit / totalCost) * 100 : 0);
    } finally {
      setCalcLoading(false);
    }
  }, [salePrice, costValues, totalCost]);

  // Fetch scenarios & history on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const listRes = await profitCalcApi.list({ limit: 50 });

        if (cancelled) return;

        // History
        setHistoryList(listRes.items);

        // Scenarios — use the first calculation's scenarios if available
        const firstCalc = listRes.items[0];
        if (firstCalc?.scenarios && firstCalc.scenarios.length > 0) {
          setScenarios(firstCalc.scenarios);
        } else {
          // Fallback defaults
          setScenarios([
            { id: 'sc1', name: t('profitCalculator.conservativePrice'), price: 22.99, profit: 9.74, margin: 42.4, demand: t('profitCalculator.demandHigh') },
            { id: 'sc2', name: t('profitCalculator.standardPrice'), price: 24.99, profit: 11.74, margin: 46.9, demand: t('profitCalculator.demandMedium') },
            { id: 'sc3', name: t('profitCalculator.premiumPrice'), price: 27.99, profit: 14.74, margin: 52.7, demand: t('profitCalculator.demandLow') },
          ]);
        }

        // Profit trend data — derive from historical calculations
        if (listRes.items.length >= 3) {
          const trend = months.map((m, i) => {
            const baseIdx = Math.min(i, listRes.items.length - 1);
            const calc = listRes.items[baseIdx];
            const baseProfit = calc?.result?.profitMargin ?? 45;
            return {
              month: m,
              保守: 5200 + i * 300 + (baseProfit * 10),
              合理: 6800 + i * 600 + (baseProfit * 15),
              乐观: 8500 + i * 900 + (baseProfit * 20),
            };
          });
          setProfitTrendData(trend);
        } else {
          // Default trend
          setProfitTrendData(months.map((m, i) => ({
            month: m,
            保守: 5200 + i * 300 + Math.floor(Math.random() * 400),
            合理: 6800 + i * 600 + Math.floor(Math.random() * 500),
            乐观: 8500 + i * 900 + Math.floor(Math.random() * 600),
          })));
        }
      } catch (err: any) {
        if (!cancelled) {
          addToast(err?.message ?? t('profitCalculator.loadProfitFailed'), 'error');
          // Set fallback scenarios
          setScenarios([
            { id: 'sc1', name: t('profitCalculator.conservativePrice'), price: 22.99, profit: 9.74, margin: 42.4, demand: t('profitCalculator.demandHigh') },
            { id: 'sc2', name: t('profitCalculator.standardPrice'), price: 24.99, profit: 11.74, margin: 46.9, demand: t('profitCalculator.demandMedium') },
            { id: 'sc3', name: t('profitCalculator.premiumPrice'), price: 27.99, profit: 14.74, margin: 52.7, demand: t('profitCalculator.demandLow') },
          ]);
          setProfitTrendData(months.map((m, i) => ({
            month: m,
            保守: 5200 + i * 300 + Math.floor(Math.random() * 400),
            合理: 6800 + i * 600 + Math.floor(Math.random() * 500),
            乐观: 8500 + i * 900 + Math.floor(Math.random() * 600),
          })));
        }
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch calculation when inputs change
  useEffect(() => {
    fetchCalculation();
  }, [fetchCalculation]);

  // Reactive chart data
  const costLabelKeyMap = useMemo<Record<string, string>>(() => ({
    '产品成本': t('profitCalculator.costProduct'),
    '包装成本': t('profitCalculator.costPackaging'),
    '头程运费': t('profitCalculator.costShipping'),
    '平台佣金': t('profitCalculator.costPlatformFee'),
    '支付手续费': t('profitCalculator.costPaymentFee'),
    '广告费用': t('profitCalculator.costAdvertising'),
    '仓储费': t('profitCalculator.costStorage'),
    '其他杂费': t('profitCalculator.costOther'),
  }), [t]);

  const donutData = [
    { name: costLabelKeyMap['产品成本'], value: costValues['产品成本'] ?? 0, color: '#6366F1' },
    { name: costLabelKeyMap['包装成本'], value: costValues['包装成本'] ?? 0, color: '#818CF8' },
    { name: costLabelKeyMap['头程运费'], value: costValues['头程运费'] ?? 0, color: '#A78BFA' },
    { name: costLabelKeyMap['平台佣金'], value: costValues['平台佣金'] ?? 0, color: '#C084FC' },
    { name: costLabelKeyMap['支付手续费'], value: costValues['支付手续费'] ?? 0, color: '#E879F9' },
    { name: costLabelKeyMap['广告费用'], value: costValues['广告费用'] ?? 0, color: '#F472B6' },
    { name: costLabelKeyMap['仓储费'], value: costValues['仓储费'] ?? 0, color: '#FB923C' },
    { name: costLabelKeyMap['其他杂费'], value: costValues['其他杂费'] ?? 0, color: '#FBBF24' },
    { name: t('profitCalculator.estimatedProfitLabel'), value: estimatedProfit, color: '#34D399' },
  ];

  const breakEvenData = Array.from({ length: 50 }, (_, i) => {
    const units = i + 1;
    return { units, cost: totalCost * units, revenue: salePrice * units };
  });

  const bePoint = breakEvenData.find((d) => d.revenue >= d.cost);
  const breakEvenUnit = bePoint?.units ?? 23;

  // Handlers
  const handleCostChange = (label: string, raw: string) => {
    const value = parseFloat(raw);
    if (!isNaN(value) && value >= 0) {
      setCostValues((prev) => ({ ...prev, [label]: value }));
    }
  };

  const handleGenerateScenario = async () => {
    const newId = `sc${scenarios.length + 1}`;
    const names = [
      t('profitCalculator.scenarioLowPrice'),
      t('profitCalculator.scenarioBundle'),
      t('profitCalculator.scenarioDiscount'),
      t('profitCalculator.scenarioMember'),
    ];
    const name = names[(scenarios.length - 3) % names.length];
    const basePrice = parseFloat((22 + Math.random() * 8).toFixed(2));
    const profit = parseFloat((basePrice - totalCost).toFixed(2));
    const margin = parseFloat(((profit / basePrice) * 100).toFixed(1));
    const demands = [
      t('profitCalculator.demandHigh'),
      t('profitCalculator.demandMedium'),
      t('profitCalculator.demandLow'),
    ];
    const newScenario: ScenarioSimulation = {
      id: newId,
      name,
      price: basePrice,
      profit,
      margin,
      demand: demands[Math.floor(Math.random() * demands.length)],
    };
    setScenarios((prev) => [...prev, newScenario]);
    addToast(t('profitCalculator.scenarioGenerated'));
  };

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* 1. Header                                                        */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#F8F0FF] via-[#F0EEFF] to-[#E8F4FF] px-8 py-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">
            {t('profitCalculator.title')} 📈
          </h1>
          <p className="mt-1 text-sm text-[#6B7280] max-w-xl">
            {t('profitCalculator.subtitle')}
          </p>
        </div>
        <div className="relative shrink-0 rounded-xl bg-gradient-to-br from-[#6C63FF] via-[#7B6CFF] to-[#8B7CFF] px-5 py-4 overflow-hidden">
          <div className="absolute -right-3 -top-3 opacity-[0.12]">
            <Trophy size={72} />
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Trophy size={20} className="text-[#FFD700]" />
            </div>
            <div>
              <p className="text-xs text-white/80">{t('profitCalculator.achievementTitle', { name: 'Olivia' })}</p>
              <p className="text-sm font-bold text-white">{t('profitCalculator.achievementDesc', { rate: '128%' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 2. Tab Buttons                                                   */}
      {/* ================================================================ */}
      <div className="flex flex-wrap gap-2" data-testid="tab-bar">
        {modes.map((m) => (
          <button
            key={m.key}
            data-testid={`tab-${m.key}`}
            onClick={() => setActiveMode(m.key)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              activeMode === m.key
                ? 'border-[#6C63FF] bg-[#6C63FF] text-white shadow-sm'
                : 'border-[#E8E8F0] bg-white text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 3. Tab Content                                                   */}
      {/* ================================================================ */}

      {/* ---- 利润计算 (default) ---- */}
      {activeMode === 'profit' && (
        <div data-testid="calc-results" className="grid grid-cols-12 gap-5">
          {/* Left: 成本输入明细 */}
          <div className="col-span-3 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.costInputDetails')}</h3>
              <Settings size={14} className="text-[#9CA3AF] cursor-pointer hover:text-[#6C63FF]" />
            </div>
            <div className="space-y-2.5">
              {costLabels.map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-[#F0F0F8] pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-[#4A5578]">{costLabelKeyMap[label]}</span>
                  <input
                    data-testid={`cost-input-${label}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={(costValues[label] ?? 0).toFixed(2)}
                    onChange={(e) => handleCostChange(label, e.target.value)}
                    className="w-20 rounded border border-[#E8E8F0] px-2 py-1 text-right text-sm font-medium text-[#1A1A2E] focus:border-[#6C63FF] focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F8F9FF] px-3 py-2.5">
              <span className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.totalCost')}</span>
              <span className="text-base font-bold text-[#6C63FF]">${totalCost.toFixed(2)}</span>
            </div>
          </div>

          {/* Middle: 定价计算器 */}
          <div className="col-span-5 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.pricingCalculator')}</h3>
              <RefreshCw size={14} className="text-[#9CA3AF] cursor-pointer hover:text-[#6C63FF]" />
            </div>

            <div className="flex items-end gap-6 mb-4">
              <div>
                <p className="text-xs text-[#8B93B5] mb-0.5">{t('profitCalculator.salePrice')}</p>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={salePrice.toFixed(2)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0) setSalePrice(v);
                  }}
                  className="w-28 rounded border border-[#E8E8F0] px-2 py-1 text-2xl font-bold text-[#1A1A2E] focus:border-[#6C63FF] focus:outline-none"
                />
              </div>
              <div className="pb-1">
                <p className="text-xs text-[#8B93B5] mb-0.5">{t('profitCalculator.suggestedPriceRange')}</p>
                <p className="text-sm font-semibold text-[#6C63FF]">
                  ${suggestedMin.toFixed(2)} – ${suggestedMax.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-[#F0EEFF] px-3 py-2.5 text-center">
                <p className="text-[10px] text-[#8B93B5] uppercase">{t('profitCalculator.estimatedProfitLabel')}</p>
                <p className="text-lg font-bold text-[#1A1A2E]">${estimatedProfit.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-[#ECFDF5] px-3 py-2.5 text-center">
                <p className="text-[10px] text-[#8B93B5] uppercase">{t('profitCalculator.profitMarginLabel')}</p>
                <p className="text-lg font-bold text-[#34D399]">{profitMargin.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg bg-[#FFF7ED] px-3 py-2.5 text-center">
                <p className="text-[10px] text-[#8B93B5] uppercase">ROI</p>
                <p className="text-lg font-bold text-[#FB923C]">{roi.toFixed(1)}%</p>
              </div>
            </div>

            {/* Donut chart */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[#8B93B5] uppercase">{t('profitCalculator.profitDistribution')}</p>
              <div className="flex items-center gap-4">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={62}
                        paddingAngle={1.5}
                        dataKey="value"
                      >
                        {donutData.map((_, idx) => (
                          <Cell key={idx} fill={DONUT_COLORS[idx]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-[#4A5578] truncate">{d.name}</span>
                      <span className="ml-auto font-medium text-[#1A1A2E]">
                        ${d.value.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: 推荐定价区间 */}
          <div className="col-span-4 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.recommendedPricing')}</h3>
              <Sparkles size={14} className="text-[#6C63FF]" />
            </div>
            <div className="mb-4 rounded-xl bg-gradient-to-br from-[#F0EEFF] to-[#E8F4FF] px-4 py-5 text-center">
              <p className="text-xs text-[#6B7280] mb-1">{t('profitCalculator.aiSuggestedPriceRange')}</p>
              <p className="text-3xl font-extrabold text-[#1A1A2E]">
                ${suggestedMin.toFixed(2)} <span className="text-lg font-normal text-[#8B93B5]">–</span> ${suggestedMax.toFixed(2)}
              </p>
              <div className="mt-2 inline-block rounded-full bg-[#6C63FF]/10 px-3 py-0.5 text-xs font-medium text-[#6C63FF]">
                {t('profitCalculator.optimalPricing', { price: `$${salePrice.toFixed(2)}` })}
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: t('profitCalculator.profitMarginLabel'), value: `${profitMargin.toFixed(1)}%`, color: '#34D399' },
                { label: t('profitCalculator.estimatedDailySales'), value: `38 – 52 ${t('profitCalculator.salesUnit')}`, color: '#6C63FF' },
                { label: t('profitCalculator.estimatedMonthlyProfit'), value: '$12,850 – $18,720', color: '#FB923C' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-[#F8F9FF] px-3 py-2">
                  <span className="text-xs text-[#4A5578]">{item.label}</span>
                  <span className="text-sm font-bold" style={{ color: item.color }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-[#E8E8F0] bg-[#FAFAFF] p-3">
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-[#6C63FF]" />
                <p className="text-xs leading-relaxed text-[#4A5578]">
                  {t('profitCalculator.pricingTip', { price: `$${salePrice.toFixed(2)}`, margin: `${profitMargin.toFixed(1)}%`, avgPrice: '$27.50' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- 定价建议 ---- */}
      {activeMode === 'pricing' && (
        <div data-testid="calc-results" className="mx-auto max-w-lg rounded-xl border border-[#E8E8F0] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1A1A2E]">{t('profitCalculator.recommendedPricing')}</h3>
            <Sparkles size={16} className="text-[#6C63FF]" />
          </div>
          <div className="mb-5 rounded-xl bg-gradient-to-br from-[#F0EEFF] to-[#E8F4FF] px-5 py-6 text-center">
            <p className="text-xs text-[#6B7280] mb-1">{t('profitCalculator.aiSuggestedPriceRange')}</p>
            <p className="text-4xl font-extrabold text-[#1A1A2E]">
              ${suggestedMin.toFixed(2)} <span className="text-lg font-normal text-[#8B93B5]">–</span> ${suggestedMax.toFixed(2)}
            </p>
            <div className="mt-3 inline-block rounded-full bg-[#6C63FF]/10 px-4 py-1 text-sm font-medium text-[#6C63FF]">
              {t('profitCalculator.optimalPricing', { price: `$${salePrice.toFixed(2)}` })}
            </div>
          </div>
          <div className="space-y-3 mb-4">
            {[
              { label: t('profitCalculator.profitMarginLabel'), value: `${profitMargin.toFixed(1)}%`, color: '#34D399' },
              { label: t('profitCalculator.estimatedDailySales'), value: `38 – 52 ${t('profitCalculator.salesUnit')}`, color: '#6C63FF' },
              { label: t('profitCalculator.estimatedMonthlyProfit'), value: '$12,850 – $18,720', color: '#FB923C' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-[#F8F9FF] px-4 py-3">
                <span className="text-sm text-[#4A5578]">{item.label}</span>
                <span className="text-base font-bold" style={{ color: item.color }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-[#E8E8F0] bg-[#FAFAFF] p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-[#6C63FF]" />
              <p className="text-sm leading-relaxed text-[#4A5578]">
                {t('profitCalculator.pricingTip', { price: `$${salePrice.toFixed(2)}`, margin: `${profitMargin.toFixed(1)}%`, avgPrice: '$27.50' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- 盈亏平衡分析 ---- */}
      {activeMode === 'breakeven' && (
        <div data-testid="calc-results" className="grid grid-cols-12 gap-5">
          <div className="col-span-6 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.breakevenAnalysis')}</h3>
              <BarChart3 size={14} className="text-[#9CA3AF]" />
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={breakEvenData.slice(0, 40)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F8" />
                  <XAxis
                    dataKey="units"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={{ stroke: '#E8E8F0' }}
                    tickLine={false}
                    label={{ value: t('profitCalculator.salesVolume'), position: 'insideBottom', offset: -4, fontSize: 10, fill: '#9CA3AF' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#F87171"
                    strokeWidth={2}
                    dot={false}
                    name={t('profitCalculator.totalCostChart')}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#34D399"
                    strokeWidth={2}
                    dot={false}
                    name={t('profitCalculator.totalRevenue')}
                  />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#FEF3C7] px-3 py-2 text-xs font-medium text-[#D97706]">
              <TrendingUp size={14} />
              <span>{t('profitCalculator.breakevenPoint', { units: breakEvenUnit })}</span>
            </div>
          </div>

          <div className="col-span-6 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.profitTrendForecast')}</h3>
              <TrendingUp size={14} className="text-[#9CA3AF]" />
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={profitTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F8" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={{ stroke: '#E8E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                    iconType="circle"
                    iconSize={6}
                  />
                  <Line
                    type="monotone"
                    dataKey="保守"
                    stroke="#9CA3AF"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#9CA3AF' }}
                    name={t('profitCalculator.conservative')}
                  />
                  <Line
                    type="monotone"
                    dataKey="合理"
                    stroke="#6C63FF"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#6C63FF' }}
                    name={t('profitCalculator.moderate')}
                  />
                  <Line
                    type="monotone"
                    dataKey="乐观"
                    stroke="#34D399"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#34D399' }}
                    name={t('profitCalculator.optimistic')}
                  />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ---- 情景模拟 ---- */}
      {activeMode === 'scenario' && (
        <div data-testid="calc-results" className="mx-auto max-w-2xl rounded-xl border border-[#E8E8F0] bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1A1A2E]">{t('profitCalculator.scenarioSimulation')}</h3>
            <Calculator size={16} className="text-[#9CA3AF]" />
          </div>
          <div className="space-y-3">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className="rounded-lg border border-[#E8E8F0] bg-[#FAFAFF] p-4 transition-colors hover:border-[#6C63FF]/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: '#6366F1' }}
                    />
                    <span className="text-sm font-semibold text-[#1A1A2E]">{sc.name}</span>
                  </div>
                  <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-medium text-[#6C63FF]">
                    {t('profitCalculator.demand', { level: sc.demand })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-[#8B93B5]">{t('profitCalculator.sellingPrice')}</p>
                    <p className="text-sm font-bold text-[#1A1A2E]">${sc.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#8B93B5]">{t('profitCalculator.profit')}</p>
                    <p className="text-sm font-bold text-[#34D399]">${sc.profit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#8B93B5]">{t('profitCalculator.profitMarginLabel')}</p>
                    <p className="text-sm font-bold text-[#6C63FF]">{sc.margin.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            data-testid="ai-generate-btn"
            onClick={handleGenerateScenario}
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[#E8E8F0] py-2.5 text-sm text-[#6C63FF] transition-colors hover:border-[#6C63FF] hover:bg-[#F0EEFF]"
          >
            <Sparkles size={16} />
            <span>{t('profitCalculator.generateMoreScenarios')}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* ---- 历史记录 ---- */}
      {activeMode === 'history' && (
        <div data-testid="calc-results" className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.historyRecords')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8E8F0]">
                  <th className="pb-2 pr-4 text-[#8B93B5] font-medium">{t('profitCalculator.tableDate')}</th>
                  <th className="pb-2 pr-4 text-[#8B93B5] font-medium">{t('profitCalculator.tableProduct')}</th>
                  <th className="pb-2 pr-4 text-[#8B93B5] font-medium">{t('profitCalculator.tableSellingPrice')}</th>
                  <th className="pb-2 pr-4 text-[#8B93B5] font-medium">{t('profitCalculator.tableTotalCost')}</th>
                  <th className="pb-2 pr-4 text-[#8B93B5] font-medium">{t('profitCalculator.tableProfit')}</th>
                  <th className="pb-2 text-[#8B93B5] font-medium">{t('profitCalculator.tableProfitMargin')}</th>
                </tr>
              </thead>
              <tbody>
                {historyList.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-[#8B93B5]">{t('profitCalculator.noHistoryRecords')}</td></tr>
                ) : (
                  historyList.map((h) => {
                    const totalCostVal = (h.costs ?? []).reduce((s, c) => s + c.value, 0);
                    const salePriceVal = h.salePrice ?? 0;
                    const profitVal = h.result?.estimatedProfit ?? (salePriceVal - totalCostVal);
                    const marginVal = h.result?.profitMargin ?? (salePriceVal > 0 ? (profitVal / salePriceVal) * 100 : 0);
                    return (
                      <tr key={h.id} className="border-b border-[#F0F0F8] last:border-0">
                        <td className="py-2.5 pr-4 text-[#4A5578]">{h.createdAt?.slice(0, 10) ?? '-'}</td>
                        <td className="py-2.5 pr-4 font-medium text-[#1A1A2E]">{h.productName ?? h.name}</td>
                        <td className="py-2.5 pr-4 text-[#1A1A2E]">${salePriceVal.toFixed(2)}</td>
                        <td className="py-2.5 pr-4 text-[#1A1A2E]">${totalCostVal.toFixed(2)}</td>
                        <td className="py-2.5 pr-4 text-[#34D399] font-medium">${profitVal.toFixed(2)}</td>
                        <td className="py-2.5 text-[#6C63FF] font-medium">{marginVal.toFixed(1)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Agent Input Dock                                                 */}
      {/* ================================================================ */}
      <AgentInputDock placeholder={t('profitCalculator.inputPlaceholder')} />
    </div>
  );
}

export default ProfitCalculator;
