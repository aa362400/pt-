import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Database, DollarSign, Package, RefreshCw, TrendingUp } from 'lucide-react';
import {
  dashboardApi,
  type DashboardHotProducts,
  type DashboardProfitSummary,
  type DashboardTrendSummaries,
} from '../api/dashboard';
import { useToast } from '../components/ui/use-toast';

function money(value: number, currency = 'RUB') {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${currency}`;
}

export default function DataAnalysisV2() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [trends, setTrends] = useState<DashboardTrendSummaries | null>(null);
  const [products, setProducts] = useState<DashboardHotProducts | null>(null);
  const [profit, setProfit] = useState<DashboardProfitSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [trendResult, productResult, profitResult] = await Promise.all([
        dashboardApi.getTrendSummaries(),
        dashboardApi.getHotProducts(),
        dashboardApi.getProfitSummary(),
      ]);
      setTrends(trendResult);
      setProducts(productResult);
      setProfit(profitResult);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '数据分析读取失败', 'error');
      setTrends(null);
      setProducts(null);
      setProfit(null);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);
  const topKeywords = trends?.topKeywords ?? [];
  const hotProducts = products?.items ?? [];
  const maxScore = Math.max(1, ...topKeywords.map((item) => item.maxScore ?? 0));
  const cards = [
    { label: '利润测算样本', value: String(profit?.calculationCount ?? 0), note: profit?.sourceLabel ?? '未返回', icon: DollarSign },
    { label: '估算利润合计', value: profit ? money(profit.totalEstimatedProfit) : '未返回', note: '仅来自真实利润测算', icon: TrendingUp },
    { label: '同步商品样本', value: String(hotProducts.length), note: products?.sourceLabel ?? '未返回', icon: Package },
    { label: '趋势关键词', value: String(topKeywords.length), note: '真实趋势与关键词报告', icon: BarChart3 },
  ];

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">数据分析</h1><p className="mt-1 text-gray-500">基于真实 Ozon 同步、趋势报告和利润测算的数据视图</p></div>
        <div className="flex gap-3"><button onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</button><button onClick={() => navigate('/market/operations')} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white"><Database className="h-4 w-4" />打开 Ozon 业务分析</button></div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {cards.map((card) => <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><div className="mb-3 flex items-start justify-between"><card.icon className="h-5 w-5 text-blue-600" /><span className="text-xs text-gray-400">真实接口</span></div><div className="text-2xl font-bold text-gray-900">{card.value}</div><div className="mt-1 text-xs text-gray-500">{card.label}</div><div className="mt-3 text-xs text-gray-400">{card.note}</div></div>)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-6 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">关键词趋势</h2><p className="mt-1 text-xs text-gray-500">不使用模型补造搜索量或趋势分数</p></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{topKeywords.length} 个样本</span></div>
          {loading ? <div className="py-16 text-center text-sm text-gray-500">正在读取真实分析数据...</div> : topKeywords.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">暂无真实趋势样本</div> : <div className="space-y-4">{topKeywords.slice(0, 8).map((item) => <div key={item.keyword}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-gray-800">{item.keyword}</span><span className="text-gray-500">{item.maxScore ?? '未评分'}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600" style={{ width: `${Math.max(4, ((item.maxScore ?? 0) / maxScore) * 100)}%` }} /></div><div className="mt-1 text-xs text-gray-400">来源：{item.source} · 出现 {item.occurrences} 次</div></div>)}</div>}
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h2 className="font-bold text-gray-900">利润质量</h2><div className="mt-5 space-y-4"><div className="flex justify-between text-sm"><span className="text-gray-500">平均毛利率</span><strong>{profit?.averageMargin == null ? '未测算' : `${profit.averageMargin.toFixed(2)}%`}</strong></div><div className="flex justify-between text-sm"><span className="text-gray-500">平均 ROI</span><strong>{profit?.averageRoi == null ? '未测算' : `${profit.averageRoi.toFixed(2)}%`}</strong></div><div className="flex justify-between text-sm"><span className="text-gray-500">样本状态</span><strong>{profit?.sampleState === 'real_samples' ? '真实样本' : '暂无样本'}</strong></div>{profit?.emptyReason && <p className="rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">{profit.emptyReason}</p>}</div></section>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-200 px-6 py-4"><h2 className="font-bold text-gray-900">商品同步样本</h2></div>{hotProducts.length === 0 ? <div className="py-12 text-center text-sm text-gray-500">暂无真实商品样本</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-6 py-3">商品</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">价格</th><th className="px-6 py-3">状态</th><th className="px-6 py-3">来源</th></tr></thead><tbody className="divide-y divide-gray-100">{hotProducts.map((item) => <tr key={item.id} className="text-sm"><td className="px-6 py-4 font-medium text-gray-900">{item.title}</td><td className="px-6 py-4 text-gray-500">{item.sku ?? '未返回'}</td><td className="px-6 py-4">{money(item.price, item.currency)}</td><td className="px-6 py-4">{item.ozonStatus ?? item.status}</td><td className="px-6 py-4 text-gray-500">{item.source}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
