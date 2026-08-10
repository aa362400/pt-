import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, Building2, ClipboardCheck, LoaderCircle, Plus, RefreshCw, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supplyChainApi, type SupplyChainOverview } from '../api/supplyChain';
import { workspacesApi, type WorkspaceSummary } from '../api/workspaces';
import { useToast } from '../components/ui/use-toast';

const riskLabel = { OUT_OF_STOCK: '缺货', REORDER: '需要补货', WATCH: '关注', HEALTHY: '健康' };
const riskClass = { OUT_OF_STOCK: 'text-red-700 bg-red-50', REORDER: 'text-orange-700 bg-orange-50', WATCH: 'text-amber-700 bg-amber-50', HEALTHY: 'text-green-700 bg-green-50' };
const statusLabel = { DRAFT: '本地草稿', PENDING_APPROVAL: '等待人工审核', APPROVED: '本地已批准', REJECTED: '已驳回' };

export default function SupplyChain() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState<SupplyChainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showSupplier, setShowSupplier] = useState(false);
  const [showSku, setShowSku] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', code: '', currency: 'USD' });
  const [skuForm, setSkuForm] = useState({ supplierId: '', sku: '', productName: '', unitCost: 0, moq: 1, leadTimeDays: 14, safetyStock: 0, currentStock: 0, dailySalesAvg: 0 });

  const load = useCallback(async (selectedWorkspace?: string) => {
    setLoading(true);
    try {
      const [workspaceResult, overview] = await Promise.all([
        workspacesApi.list({ limit: 100 }),
        supplyChainApi.overview(selectedWorkspace || undefined),
      ]);
      setWorkspaces(workspaceResult.items);
      setData(overview);
      setWorkspaceId((current) => current || selectedWorkspace || workspaceResult.items[0]?.id || '');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '供应链数据读取失败', 'error');
      setData(null);
    } finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);
  const forecastBySku = useMemo(() => new Map(data?.forecasts.map((item) => [item.supplySkuId, item]) ?? []), [data]);
  const summaryCards: Array<{ label: string; value: number; Icon: LucideIcon }> = data ? [
    { label: '供应商', value: data.summary.suppliers, Icon: Building2 },
    { label: '采购 SKU', value: data.summary.skus, Icon: Truck },
    { label: '需要补货', value: data.summary.reorderRequired, Icon: AlertTriangle },
    { label: '等待审核', value: data.summary.pendingApproval, Icon: ClipboardCheck },
  ] : [];

  const switchWorkspace = (id: string) => { setWorkspaceId(id); void load(id); };

  const createSupplier = async () => {
    if (!supplierForm.name.trim()) return addToast('请输入供应商名称', 'error');
    setBusy('supplier');
    try {
      await supplyChainApi.createSupplier({ ...supplierForm, workspaceId: workspaceId || undefined });
      setSupplierForm({ name: '', code: '', currency: 'USD' });
      setShowSupplier(false);
      await load(workspaceId);
      addToast('供应商已保存到当前组织', 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : '供应商保存失败', 'error'); }
    finally { setBusy(''); }
  };

  const createSku = async () => {
    if (!workspaceId || !skuForm.supplierId || !skuForm.sku.trim() || !skuForm.productName.trim()) return addToast('请完整填写工作区、供应商、SKU 和商品名称', 'error');
    setBusy('sku');
    try {
      await supplyChainApi.createSku({ ...skuForm, workspaceId });
      setShowSku(false);
      setSkuForm({ supplierId: '', sku: '', productName: '', unitCost: 0, moq: 1, leadTimeDays: 14, safetyStock: 0, currentStock: 0, dailySalesAvg: 0 });
      await load(workspaceId);
      addToast('采购 SKU 已保存，预测已重新计算', 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : '采购 SKU 保存失败', 'error'); }
    finally { setBusy(''); }
  };

  const generatePlans = async () => {
    if (!workspaceId) return addToast('请先选择工作区', 'error');
    setBusy('generate');
    try {
      const result = await supplyChainApi.generatePlans(workspaceId);
      await load(workspaceId);
      addToast(`已评估 ${result.evaluatedSkus} 个 SKU，生成 ${result.generatedPlans} 个本地补货草稿`, 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : '补货计划生成失败', 'error'); }
    finally { setBusy(''); }
  };

  const requestReview = async (id: string, qty: number) => {
    setBusy(id);
    try {
      await supplyChainApi.requestApproval(id, qty);
      await load(workspaceId);
      addToast('已进入人工审核中心，尚未创建外部采购订单', 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : '提交审核失败', 'error'); }
    finally { setBusy(''); }
  };

  return <div>
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="text-2xl font-bold text-gray-900">供应链中心</h1><p className="mt-1 text-sm text-gray-500">供应商、采购成本、MOQ、交期、库存风险与补货审批</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load(workspaceId)} className="grid h-10 w-10 place-items-center rounded-md border border-gray-300 bg-white text-gray-600" title="刷新"><RefreshCw className="h-4 w-4"/></button>
        <button type="button" onClick={() => setShowSupplier((value) => !value)} className="flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"><Building2 className="h-4 w-4"/>供应商</button>
        <button type="button" disabled={!workspaceId || !data?.suppliers.length} onClick={() => setShowSku((value) => !value)} className="flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-50"><Plus className="h-4 w-4"/>采购 SKU</button>
        <button type="button" disabled={!workspaceId || busy === 'generate'} onClick={() => void generatePlans()} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">{busy === 'generate' ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Boxes className="h-4 w-4"/>}生成补货草稿</button>
      </div>
    </header>

    <section className="mb-6 flex flex-col gap-3 border-y border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-gray-700" htmlFor="supply-workspace">工作区</label>
      <select id="supply-workspace" value={workspaceId} onChange={(event) => switchWorkspace(event.target.value)} className="min-w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">全部工作区</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.channelType}</option>)}</select>
      <span className="text-xs text-gray-500">数据来源：组织供应链记录 · 更新时间：{data ? new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '未返回'}</span>
    </section>

    {showSupplier && <section className="mb-6 border border-gray-200 bg-white p-5"><h2 className="mb-4 font-bold text-gray-900">新增供应商</h2><div className="grid gap-3 md:grid-cols-3"><input aria-label="供应商名称" value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} placeholder="供应商名称" className="rounded-md border border-gray-300 px-3 py-2 text-sm"/><input aria-label="供应商编号" value={supplierForm.code} onChange={(event) => setSupplierForm({ ...supplierForm, code: event.target.value })} placeholder="内部编号（可选）" className="rounded-md border border-gray-300 px-3 py-2 text-sm"/><input aria-label="结算币种" value={supplierForm.currency} onChange={(event) => setSupplierForm({ ...supplierForm, currency: event.target.value.toUpperCase() })} placeholder="USD" maxLength={3} className="rounded-md border border-gray-300 px-3 py-2 text-sm"/></div><button onClick={() => void createSupplier()} disabled={busy === 'supplier'} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存供应商</button></section>}

    {showSku && <section className="mb-6 border border-gray-200 bg-white p-5"><h2 className="mb-4 font-bold text-gray-900">新增采购 SKU</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><select aria-label="供应商" value={skuForm.supplierId} onChange={(event) => setSkuForm({ ...skuForm, supplierId: event.target.value })} className="rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">选择供应商</option>{data?.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="SKU" value={skuForm.sku} onChange={(event) => setSkuForm({ ...skuForm, sku: event.target.value })} placeholder="SKU" className="rounded-md border border-gray-300 px-3 py-2 text-sm"/><input aria-label="商品名称" value={skuForm.productName} onChange={(event) => setSkuForm({ ...skuForm, productName: event.target.value })} placeholder="商品名称" className="rounded-md border border-gray-300 px-3 py-2 text-sm"/>{(['unitCost','moq','leadTimeDays','safetyStock','currentStock','dailySalesAvg'] as const).map((key) => <label key={key} className="text-xs text-gray-500">{{unitCost:'单位成本',moq:'最小起订量',leadTimeDays:'交期（天）',safetyStock:'安全库存',currentStock:'当前库存',dailySalesAvg:'日均销量'}[key]}<input type="number" min="0" step={key === 'unitCost' || key === 'dailySalesAvg' ? '0.01' : '1'} value={skuForm[key]} onChange={(event) => setSkuForm({ ...skuForm, [key]: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"/></label>)}</div><button onClick={() => void createSku()} disabled={busy === 'sku'} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存采购参数</button></section>}

    {loading && <div className="py-20 text-center text-sm text-gray-500">正在读取供应链数据...</div>}
    {!loading && !data && <div className="border border-red-200 bg-red-50 py-16 text-center text-sm text-red-700">供应链接口不可用，未显示任何模拟数据。</div>}
    {data && <>
      <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden border border-gray-200 bg-gray-200 lg:grid-cols-4">{summaryCards.map(({ label, value, Icon }) => <div key={label} className="bg-white p-5"><Icon className="mb-3 h-5 w-5 text-blue-600"/><div className="text-2xl font-bold text-gray-900">{value}</div><div className="mt-1 text-xs text-gray-500">{label}</div></div>)}</section>

      <section className="mb-6 overflow-hidden border border-gray-200 bg-white"><div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">库存预测</h2><p className="mt-1 text-xs text-gray-500">公式基于库存、日均销量、交期、安全库存和 30 天覆盖期；没有销量数据时不会推测。</p></div>{data.skus.length === 0 ? <div className="py-16 text-center text-sm text-gray-500">尚无采购 SKU。先录入供应商和真实采购参数。</div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-5 py-3">SKU / 商品</th><th className="px-5 py-3">供应商</th><th className="px-5 py-3">库存 / 日销</th><th className="px-5 py-3">MOQ / 交期</th><th className="px-5 py-3">风险</th><th className="px-5 py-3">建议补货</th></tr></thead><tbody className="divide-y divide-gray-100">{data.skus.map((sku) => { const forecast=forecastBySku.get(sku.id); return <tr key={sku.id}><td className="px-5 py-4"><strong className="block text-gray-900">{sku.sku}</strong><span className="text-xs text-gray-500">{sku.productName}</span></td><td className="px-5 py-4">{sku.supplier.name}</td><td className="px-5 py-4">{sku.currentStock} / {sku.dailySalesAvg}</td><td className="px-5 py-4">{sku.moq} / {sku.leadTimeDays} 天</td><td className="px-5 py-4">{forecast && <span className={`rounded px-2 py-1 text-xs ${riskClass[forecast.risk]}`}>{riskLabel[forecast.risk]}</span>}</td><td className="px-5 py-4 font-medium">{forecast?.recommendedQty ?? 0}</td></tr>;})}</tbody></table></div>}</section>

<section className="overflow-hidden border border-gray-200 bg-white"><div className="flex items-center justify-between border-b border-gray-200 px-5 py-4"><div><h2 className="font-bold text-gray-900">补货计划</h2><p className="mt-1 text-xs text-gray-500">批准只确认本地计划，不会自动创建采购订单。</p></div><button onClick={() => navigate('/review')} className="text-sm font-medium text-blue-600">打开人工审核中心</button></div>{data.plans.length === 0 ? <div className="py-16 text-center text-sm text-gray-500">没有补货计划。只有达到补货线的 SKU 才会生成草稿。</div> : <div className="divide-y divide-gray-100">{data.plans.map((plan) => <div key={plan.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><div><strong className="text-sm text-gray-900">{plan.supplySku.sku} · {plan.supplySku.productName}</strong><p className="mt-1 text-xs text-gray-500">建议 {plan.recommendedQty}，申请 {plan.requestedQty}，预计剩余 {plan.projectedDaysLeft ?? '无法计算'} 天</p></div><div className="flex items-center gap-3"><span className="text-xs text-gray-600">{statusLabel[plan.status]}</span>{plan.status === 'DRAFT' || plan.status === 'REJECTED' ? <button disabled={busy === plan.id} onClick={() => void requestReview(plan.id, plan.requestedQty)} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">提交人工审核</button> : null}</div></div>)}</div>}</section>
    </>}
  </div>;
}
