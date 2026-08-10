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
      addToast(error instanceof Error ? error.message : 'datatextreadfailed', 'error');
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
    { label: 'profitenglish_text', value: String(profit?.calculationCount ?? 0), note: profit?.sourceLabel ?? 'english_text', icon: DollarSign },
    { label: 'textprofittext', value: profit ? money(profit.totalEstimatedProfit) : 'english_text', note: 'english_textrealprofittext', icon: TrendingUp },
    { label: 'syncproducttext', value: String(hotProducts.length), note: products?.sourceLabel ?? 'english_text', icon: Package },
    { label: 'textkeywords', value: String(topKeywords.length), note: 'realenglish_textkeywordsreport', icon: BarChart3 },
  ];

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">datatext</h1><p className="mt-1 text-gray-500">textreal Ozon sync、textreporttextprofitenglish_textdatatext</p></div>
        <div className="flex gap-3"><button onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />text</button><button onClick={() => navigate('/market/operations')} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white"><Database className="h-4 w-4" />text Ozon english_text</button></div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {cards.map((card) => <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><div className="mb-3 flex items-start justify-between"><card.icon className="h-5 w-5 text-blue-600" /><span className="text-xs text-gray-400">realAPI</span></div><div className="text-2xl font-bold text-gray-900">{card.value}</div><div className="mt-1 text-xs text-gray-500">{card.label}</div><div className="mt-3 text-xs text-gray-400">{card.note}</div></div>)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-6 flex items-center justify-between"><div><h2 className="font-bold text-gray-900">keywordstext</h2><p className="mt-1 text-xs text-gray-500">english_textsearchenglish_text</p></div><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{topKeywords.length} english_text</span></div>
          {loading ? <div className="py-16 text-center text-sm text-gray-500">textreadrealtextdata...</div> : topKeywords.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">textnonerealenglish_text</div> : <div className="space-y-4">{topKeywords.slice(0, 8).map((item) => <div key={item.keyword}><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-gray-800">{item.keyword}</span><span className="text-gray-500">{item.maxScore ?? 'english_text'}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600" style={{ width: `${Math.max(4, ((item.maxScore ?? 0) / maxScore) * 100)}%` }} /></div><div className="mt-1 text-xs text-gray-400">source：{item.source} · text {item.occurrences} text</div></div>)}</div>}
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h2 className="font-bold text-gray-900">profittext</h2><div className="mt-5 space-y-4"><div className="flex justify-between text-sm"><span className="text-gray-500">textgross margin</span><strong>{profit?.averageMargin == null ? 'english_text' : `${profit.averageMargin.toFixed(2)}%`}</strong></div><div className="flex justify-between text-sm"><span className="text-gray-500">text ROI</span><strong>{profit?.averageRoi == null ? 'english_text' : `${profit.averageRoi.toFixed(2)}%`}</strong></div><div className="flex justify-between text-sm"><span className="text-gray-500">textstatus</span><strong>{profit?.sampleState === 'real_samples' ? 'realtext' : 'textnonetext'}</strong></div>{profit?.emptyReason && <p className="rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">{profit.emptyReason}</p>}</div></section>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-200 px-6 py-4"><h2 className="font-bold text-gray-900">productsynctext</h2></div>{hotProducts.length === 0 ? <div className="py-12 text-center text-sm text-gray-500">textnonerealproducttext</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-6 py-3">product</th><th className="px-6 py-3">SKU</th><th className="px-6 py-3">text</th><th className="px-6 py-3">status</th><th className="px-6 py-3">source</th></tr></thead><tbody className="divide-y divide-gray-100">{hotProducts.map((item) => <tr key={item.id} className="text-sm"><td className="px-6 py-4 font-medium text-gray-900">{item.title}</td><td className="px-6 py-4 text-gray-500">{item.sku ?? 'english_text'}</td><td className="px-6 py-4">{money(item.price, item.currency)}</td><td className="px-6 py-4">{item.ozonStatus ?? item.status}</td><td className="px-6 py-4 text-gray-500">{item.source}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
