import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/use-toast.ts';
import {
  Calculator, TrendingUp, BarChart3,
  Sparkles, ArrowRight, Settings, RefreshCw,
} from 'lucide-react';
import {
  PieChart as RePieChart, Pie, Cell, ResponsiveContainer,
  LineChart as ReLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import AgentInputDock from '../components/ui/AgentInputDock';
import { profitCalculatorApi as profitCalcApi } from '../api/profit-calculator';
import { createAgentRun, waitForAgentRun } from '../api/agentRuns';
import type { ProfitCalculation, CalculateInput } from '../api/profit-calculator';
import type { ScenarioSimulation } from '../types';

interface AssistantAgentOutput {
  reply?: string;
  response?: string;
}

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
  '产品成本': 0,
  '包装成本': 0,
  '头程运费': 0,
  '平台佣金': 0,
  '支付手续费': 0,
  '广告费用': 0,
  '仓储费': 0,
  '其他杂费': 0,
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
  const [agentReply, setAgentReply] = useState<string | null>(null);

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
  const [salePrice, setSalePrice] = useState(0);

  // API-derived state
  const [estimatedProfit, setEstimatedProfit] = useState(0);
  const [profitMargin, setProfitMargin] = useState(0);
  const [roi, setRoi] = useState(0);
  const [suggestedMin, setSuggestedMin] = useState(0);
  const [suggestedMax, setSuggestedMax] = useState(0);
  const [scenarios, setScenarios] = useState<ScenarioSimulation[]>([]);
  const [historyList, setHistoryList] = useState<ProfitCalculation[]>([]);
  const [profitTrendData, setProfitTrendData] = useState<any[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  const totalCost = costLabels.reduce((s, label) => s + (costValues[label] ?? 0), 0);
  const pricingRangeText =
    suggestedMin > 0 && suggestedMax > 0
      ? `$${suggestedMin.toFixed(2)}${suggestedMin === suggestedMax ? '' : ` - $${suggestedMax.toFixed(2)}`}`
      : '后端未返回';
  const pricingRangeNote =
    suggestedMin > 0 && suggestedMax > 0 && suggestedMin === suggestedMax
      ? '后端只返回当前售价，未返回 AI 推荐上下限。'
      : null;

  const handleSubmitCalculation = async () => {
    if (salePrice <= 0 || (costValues['产品成本'] ?? 0) <= 0) {
      setCalcError('请先填写大于 0 的售价和产品成本，再点击计算并保存。');
      return;
    }

    const costs: CalculateInput['costs'] = costLabels.map((label) => ({
      label,
      key: label,
      value: costValues[label] ?? 0,
      unit: 'USD',
    }));

    setCalcLoading(true);
    setCalcError(null);
    try {
      const result = await profitCalcApi.calculate({ salePrice, costs });
      setEstimatedProfit(result.estimatedProfit);
      setProfitMargin(result.profitMargin);
      setRoi(result.roi);
      setSuggestedMin(result.suggestedMin);
      setSuggestedMax(result.suggestedMax);
      setHasCalculated(true);
      addToast('利润计算已保存。', 'success');
    } catch (err: any) {
      setEstimatedProfit(0);
      setProfitMargin(0);
      setRoi(0);
      setSuggestedMin(0);
      setSuggestedMax(0);
      setHasCalculated(false);
      setCalcError(err?.message ?? t('profitCalculator.loadProfitFailed'));
    } finally {
      setCalcLoading(false);
    }
  };

  // Fetch scenarios & history on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const listRes = await profitCalcApi.list({ limit: 50 });

        if (cancelled) return;

        // History
        setHistoryList(listRes.items);

        // Scenarios come only from backend calculation records.
        const firstCalc = listRes.items[0];
        if (firstCalc?.scenarios && firstCalc.scenarios.length > 0) {
          setScenarios(firstCalc.scenarios);
        } else {
          setScenarios([]);
        }

        // Trend chart is derived only from real historical calculations.
        setProfitTrendData(
          listRes.items
            .slice(0, 6)
            .reverse()
            .map((calc, index) => ({
              month: calc.createdAt?.slice(5, 10) || months[index] || `${index + 1}`,
              profit: calc.result?.estimatedProfit ?? 0,
            })),
        );
      } catch (err: any) {
        if (!cancelled) {
          addToast(err?.message ?? t('profitCalculator.loadProfitFailed'), 'error');
          setHistoryList([]);
          setScenarios([]);
          setProfitTrendData([]);
        }
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [addToast, months, t]);

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
  const breakEvenUnit = bePoint?.units ?? null;

  // Handlers
  const clearCalculationResult = () => {
    setEstimatedProfit(0);
    setProfitMargin(0);
    setRoi(0);
    setSuggestedMin(0);
    setSuggestedMax(0);
    setCalcError(null);
    setHasCalculated(false);
  };

  const handleCostChange = (label: string, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (Number.isFinite(value) && value >= 0) {
      setCostValues((prev) => ({ ...prev, [label]: value }));
      clearCalculationResult();
    }
  };

  const handleSalePriceChange = (raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (Number.isFinite(value) && value >= 0) {
      setSalePrice(value);
      clearCalculationResult();
    }
  };

  const handleGenerateScenario = async () => {
    addToast('AI 场景生成还没有结构化后端接口，已拒绝本地随机假成功。', 'error');
  };

  const handleAgentMessage = async (message: string) => {
    try {
      setAgentReply(null);
      const created = await createAgentRun<AssistantAgentOutput>('GENERAL_ASSISTANT', {
        assistantId: 'profit-calculator',
        prompt: message,
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      setAgentReply(
        completed.output?.reply ??
          completed.output?.response ??
          '智能体已完成，但没有返回可展示内容。',
      );
    } catch (err: any) {
      addToast(err?.message ?? '利润智能体调用失败', 'error');
      setAgentReply('利润智能体调用失败，页面没有生成本地假回复。');
    }
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
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Calculator size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-white/80">真实后端计算</p>
              <p className="text-sm font-bold text-white">
                {calcLoading
                  ? '计算中'
                  : calcError
                    ? '待补充有效数据'
                    : hasCalculated
                      ? '已保存 /profit-calculator'
                      : '等待显式计算'}
              </p>
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
                    value={(costValues[label] ?? 0) === 0 ? '' : costValues[label]}
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
                  value={salePrice === 0 ? '' : salePrice}
                  onChange={(e) => handleSalePriceChange(e.target.value)}
                  className="w-28 rounded border border-[#E8E8F0] px-2 py-1 text-2xl font-bold text-[#1A1A2E] focus:border-[#6C63FF] focus:outline-none"
                />
              </div>
              <div className="pb-1">
                <p className="text-xs text-[#8B93B5] mb-0.5">{t('profitCalculator.suggestedPriceRange')}</p>
                <p className="text-sm font-semibold text-[#6C63FF]">
                  {pricingRangeText}
                </p>
                {pricingRangeNote ? <p className="mt-1 text-[10px] text-[#8B93B5]">{pricingRangeNote}</p> : null}
              </div>
            </div>

            <div className="mb-5">
              <button
                type="button"
                data-testid="profit-calculate-submit"
                onClick={() => void handleSubmitCalculation()}
                disabled={calcLoading || salePrice <= 0 || (costValues['产品成本'] ?? 0) <= 0}
                className="w-full rounded-lg bg-[#6C63FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5B52E8] disabled:cursor-not-allowed disabled:bg-[#C7C4F4]"
              >
                {calcLoading ? '计算并保存中…' : '计算并保存'}
              </button>
              <p className="mt-2 text-center text-[11px] text-[#8B93B5]">
                修改输入不会自动写入；只有点击按钮后才会调用并保存真实计算。
              </p>
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
            {calcError ? (
              <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
                利润计算后端调用失败，页面未使用本地假结果：{calcError}
              </div>
            ) : null}

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
                {pricingRangeText}
              </p>
              {pricingRangeNote ? <p className="mt-2 text-xs text-[#8B93B5]">{pricingRangeNote}</p> : null}
              <div className="mt-2 inline-block rounded-full bg-[#6C63FF]/10 px-3 py-0.5 text-xs font-medium text-[#6C63FF]">
                {t('profitCalculator.optimalPricing', { price: `$${salePrice.toFixed(2)}` })}
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: t('profitCalculator.profitMarginLabel'), value: `${profitMargin.toFixed(1)}%`, color: '#34D399' },
                { label: t('profitCalculator.estimatedProfitLabel'), value: `$${estimatedProfit.toFixed(2)}`, color: '#6C63FF' },
                { label: 'ROI', value: `${roi.toFixed(1)}%`, color: '#FB923C' },
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
                  当前卡片只展示后端 /profit-calculator/calculate 返回的真实计算结果；销量、月利润、竞品均价预测接口未接入，未展示模拟值。
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
              {pricingRangeText}
            </p>
            {pricingRangeNote ? <p className="mt-2 text-xs text-[#8B93B5]">{pricingRangeNote}</p> : null}
            <div className="mt-3 inline-block rounded-full bg-[#6C63FF]/10 px-4 py-1 text-sm font-medium text-[#6C63FF]">
              {t('profitCalculator.optimalPricing', { price: `$${salePrice.toFixed(2)}` })}
            </div>
          </div>
          <div className="space-y-3 mb-4">
            {[
              { label: t('profitCalculator.profitMarginLabel'), value: `${profitMargin.toFixed(1)}%`, color: '#34D399' },
              { label: t('profitCalculator.estimatedProfitLabel'), value: `$${estimatedProfit.toFixed(2)}`, color: '#6C63FF' },
              { label: 'ROI', value: `${roi.toFixed(1)}%`, color: '#FB923C' },
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
                当前卡片只展示后端 /profit-calculator/calculate 返回的真实计算结果；销量、月利润、竞品均价预测接口未接入，未展示模拟值。
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
              <span>
                {breakEvenUnit === null
                  ? '当前售价低于单件成本，按现有输入无法达到盈亏平衡。'
                  : t('profitCalculator.breakevenPoint', { units: breakEvenUnit })}
              </span>
            </div>
          </div>

          <div className="col-span-6 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('profitCalculator.profitTrendForecast')}</h3>
              <TrendingUp size={14} className="text-[#9CA3AF]" />
            </div>
            <div className="h-60">
              {profitTrendData.length > 0 ? (
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
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                      iconType="circle"
                      iconSize={6}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#6C63FF"
                      strokeWidth={2}
                      dot={{ r: 2, fill: '#6C63FF' }}
                      name={t('profitCalculator.estimatedProfitLabel')}
                    />
                  </ReLineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] px-4 text-center text-xs text-[#8B93B5]">
                  暂无真实历史计算样本，未展示本地模拟趋势。
                </div>
              )}
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
            {scenarios.length > 0 ? scenarios.map((sc) => (
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
            )) : (
              <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-6 text-center text-xs text-[#8B93B5]">
                暂无后端返回的情景模拟样本，页面未填充默认假场景。
              </div>
            )}
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
      {agentReply ? (
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 text-sm leading-6 text-[#4A5578] shadow-sm">
          {agentReply}
        </div>
      ) : null}
      <AgentInputDock
        placeholder={t('profitCalculator.inputPlaceholder')}
        onSendMessage={(message) => void handleAgentMessage(message)}
      />
    </div>
  );
}

export default ProfitCalculator;
