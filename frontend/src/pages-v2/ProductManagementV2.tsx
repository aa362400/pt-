import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Package, Star, TrendingUp } from 'lucide-react';
import { channelsApi, type ChannelConnection } from '../api/channels';
import { productsApi, type Product } from '../api/products';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast';
import { ProductManagement, type ProductManagementItem } from '../figma-exact/ProductManagement';

interface ProductForm {
  title: string;
  sku: string;
  price: string;
  cost: string;
  currency: string;
  status: string;
  imageUrl: string;
  stock: string;
  warehouseId: string;
  changeReason: string;
}

const EMPTY_FORM: ProductForm = {
  title: '', sku: '', price: '', cost: '', currency: 'RUB', status: 'DRAFT', imageUrl: '', stock: '0', warehouseId: '', changeReason: '',
};

function numberFromMetadata(product: Product, key: string): number | null {
  const number = Number(product.metadata?.[key]);
  return Number.isFinite(number) ? number : null;
}

function isOzonProduct(product: Product): boolean {
  return String(product.metadata?.source ?? '').toLocaleLowerCase() === 'ozon';
}

function mapProduct(product: Product): ProductManagementItem {
  const price = Number(product.price ?? 0);
  const cost = Number(product.cost ?? 0);
  const stock = numberFromMetadata(product, 'stock') ?? 0;
  const status = product.status === 'DRAFT' || product.status === 'draft'
    ? 'draft'
    : stock === 0 ? 'out_of_stock' : stock < 10 ? 'low_stock' : 'active';
  return {
    id: product.id,
    name: product.title,
    sku: product.sku || product.asinOrExternalId || '未设置',
    image: product.imageUrl || product.images?.[0] || 'O',
    platforms: isOzonProduct(product) ? ['Ozon'] : ['本地'],
    price: `${price.toLocaleString('zh-CN')} ${product.currency || 'RUB'}`,
    cost: Number.isFinite(cost) && cost > 0 ? `${cost.toLocaleString('zh-CN')} ${product.currency || 'RUB'}` : '未录入',
    profit: Number.isFinite(cost) && cost > 0 ? `${(price - cost).toLocaleString('zh-CN')} ${product.currency || 'RUB'}` : '未测算',
    stock,
    sales30d: numberFromMetadata(product, 'sales30d') ?? '未返回',
    views30d: numberFromMetadata(product, 'views30d') ?? '未返回',
    conversionRate: typeof product.metadata?.conversionRate === 'string' ? product.metadata.conversionRate : '未返回',
    status,
    performance: 'good',
    aiSuggestion: typeof product.metadata?.agentSuggestion === 'string' ? product.metadata.agentSuggestion : null,
  };
}

function productToForm(product: Product): ProductForm {
  return {
    title: product.title,
    sku: product.sku ?? '',
    price: String(product.price ?? ''),
    cost: String(product.cost ?? ''),
    currency: product.currency || 'RUB',
    status: product.status || 'DRAFT',
    imageUrl: product.imageUrl || product.images?.[0] || '',
    stock: String(numberFromMetadata(product, 'stock') ?? 0),
    warehouseId: String(product.metadata?.warehouseId ?? ''),
    changeReason: '',
  };
}

function money(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function ProductManagementV2() {
  const { addToast } = useToast();
  const [sourceProducts, setSourceProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create' | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [productsResult, channelsResult] = await Promise.allSettled([
      productsApi.list({ limit: 100 }),
      channelsApi.list({ limit: 100 }),
    ]);
    if (productsResult.status === 'fulfilled') setSourceProducts(productsResult.value.items); else { setSourceProducts([]); addToast(productsResult.reason instanceof Error ? productsResult.reason.message : '商品数据读取失败', 'error'); }
    if (channelsResult.status === 'fulfilled') setChannels(channelsResult.value.items); else setChannels([]);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const products = useMemo(() => sourceProducts.map(mapProduct), [sourceProducts]);
  const sourceById = useMemo(() => new Map(sourceProducts.map((product) => [product.id, product])), [sourceProducts]);
  const active = products.filter((item) => item.status === 'active').length;
  const alerts = products.filter((item) => item.status === 'low_stock' || item.status === 'out_of_stock').length;
  const stats = [
    { label: '在线商品', value: String(active), change: '真实 /products', trend: 'up' as const, icon: Package },
    { label: '商品总数', value: String(products.length), change: '真实目录', trend: 'up' as const, icon: TrendingUp },
    { label: '库存预警', value: String(alerts), change: '来自库存字段', trend: alerts ? 'down' as const : 'up' as const, icon: AlertCircle },
    { label: '利润样本', value: String(sourceProducts.filter((item) => Number(item.cost ?? 0) > 0).length), change: '未补造利润率', trend: 'up' as const, icon: Star },
  ];

  const openProduct = (id: string, mode: 'view' | 'edit') => {
    const product = sourceById.get(id);
    if (!product) return;
    setEditingProduct(product);
    setForm(productToForm(product));
    setModalMode(mode);
  };

  const openCreate = () => {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setModalMode('create');
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return addToast('商品标题不能为空', 'error');
    const price = money(form.price);
    const cost = money(form.cost);
    const stock = Number(form.stock);
    if (form.price.trim() && price === undefined) return addToast('售价必须是非负数字', 'error');
    if (form.cost.trim() && cost === undefined) return addToast('成本必须是非负数字', 'error');
    if (!Number.isInteger(stock) || stock < 0) return addToast('库存必须是非负整数', 'error');
    setSaving(true);
    try {
      const existingMetadata = editingProduct?.metadata ?? {};
      const payload: Partial<Product> = {
        title: form.title.trim(),
        sku: form.sku.trim() || undefined,
        price,
        cost,
        currency: form.currency.trim().toUpperCase(),
        status: form.status,
        imageUrl: form.imageUrl.trim() || null,
        images: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
        metadata: {
          ...existingMetadata,
          stock,
          ...(form.warehouseId.trim() ? { warehouseId: Number(form.warehouseId) } : {}),
          localChangeStatus: 'local_product_updated',
          pendingExternalSync: Boolean(editingProduct && isOzonProduct(editingProduct)),
          externalStoreMutation: 'not_executed',
          lastLocalEditAt: new Date().toISOString(),
        },
      };
      if (editingProduct) await productsApi.update(editingProduct.id, payload);
      else await productsApi.create(payload);
      addToast(editingProduct ? '商品已更新到本地商品库，未直接写入 Ozon。' : '本地商品已创建。', 'success');
      setModalMode(null);
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '商品保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestOzonChange = async (action: 'ozon.price.update' | 'ozon.stock.update') => {
    if (!editingProduct || !isOzonProduct(editingProduct)) return addToast('只有 Ozon 同步商品才能申请真实店铺变更。', 'error');
    const price = money(form.price);
    const stock = Number(form.stock);
    const warehouseId = Number(form.warehouseId);
    if (action === 'ozon.price.update' && price === undefined) return addToast('请填写有效目标售价', 'error');
    if (action === 'ozon.stock.update' && (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(warehouseId) || warehouseId <= 0)) return addToast('库存变更必须填写有效库存和 Ozon 仓库 ID', 'error');
    setSaving(true);
    try {
      await productsApi.requestOzonChange(editingProduct.id, action === 'ozon.price.update'
        ? { action, price, reason: form.changeReason.trim() || undefined }
        : { action, stock, warehouseId, reason: form.changeReason.trim() || undefined });
      addToast('已创建人工确认变更单；尚未写入 Ozon。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建变更单失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncOzon = async () => {
    const channel = channels.find((item) => item.provider === 'OZON' && item.syncStatus !== 'DISCONNECTED');
    if (!channel) return addToast('没有已绑定的 Ozon 渠道，不能假同步商品。', 'error');
    setSyncing(true);
    try {
      const result = await channelsApi.syncProducts(channel.id, { limit: 50 });
      addToast(`Ozon 商品同步完成：读取 ${result.fetched} 个，写入/更新 ${result.synced} 个。`, 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon 商品同步失败', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const copyProduct = async (id: string) => {
    const product = sourceById.get(id);
    if (!product) return;
    try {
      await productsApi.create({
        title: `${product.title}（副本）`, sku: undefined, price: product.price, cost: product.cost, currency: product.currency, status: 'DRAFT', imageUrl: product.imageUrl, images: product.images,
        metadata: { ...(product.metadata ?? {}), source: 'local', copiedFromProductId: product.id, externalStoreMutation: 'not_executed' },
      });
      addToast('已创建本地草稿副本，未写入 Ozon。', 'success');
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : '复制商品失败', 'error'); }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await Promise.all(deleteIds.map((id) => productsApi.delete(id)));
      addToast(`已删除 ${deleteIds.length} 条本地商品记录。`, 'success');
      setDeleteIds([]);
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : '删除商品失败', 'error'); }
    finally { setSaving(false); }
  };

  const exportProducts = () => {
    const rows = [['ID', '标题', 'SKU', '状态', '售价', '成本', '货币'], ...sourceProducts.map((product) => [product.id, product.title, product.sku ?? '', product.status, String(product.price ?? ''), String(product.cost ?? ''), product.currency ?? ''])];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <ProductManagement
        products={products}
        stats={stats}
        loading={loading}
        syncing={syncing}
        onExport={exportProducts}
        onAdd={openCreate}
        onSync={() => void syncOzon()}
        onView={(id) => openProduct(id, 'view')}
        onEdit={(id) => openProduct(id, 'edit')}
        onCopy={(id) => void copyProduct(id)}
        onDelete={(id) => setDeleteIds([id])}
        onBatchEdit={(ids) => ids[0] ? openProduct(ids[0], 'edit') : addToast('请先选择商品', 'error')}
        onBatchDelete={(ids) => setDeleteIds(ids)}
      />

      <Modal open={Boolean(modalMode)} onClose={() => !saving && setModalMode(null)} title={modalMode === 'create' ? '添加本地商品' : modalMode === 'view' ? '商品详情' : '编辑商品'} width="max-w-3xl">
        <form onSubmit={saveProduct} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm">商品标题<input disabled={modalMode === 'view'} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">SKU<input disabled={modalMode === 'view'} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">图片 URL<input disabled={modalMode === 'view'} value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">售价<input disabled={modalMode === 'view'} inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">成本<input disabled={modalMode === 'view'} inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">货币<input disabled={modalMode === 'view'} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">库存<input disabled={modalMode === 'view'} inputMode="numeric" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">状态<select disabled={modalMode === 'view'} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"><option value="DRAFT">草稿</option><option value="ACTIVE">在售</option><option value="PAUSED">暂停</option></select></label>
          <label className="text-sm">Ozon 仓库 ID<input disabled={modalMode === 'view'} inputMode="numeric" value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          {editingProduct && isOzonProduct(editingProduct) && modalMode !== 'view' ? <label className="md:col-span-2 text-sm">变更原因<textarea value={form.changeReason} onChange={(event) => setForm({ ...form, changeReason: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label> : null}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            {editingProduct && isOzonProduct(editingProduct) && modalMode === 'edit' ? <><button type="button" disabled={saving} onClick={() => void requestOzonChange('ozon.price.update')} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">申请 Ozon 调价审批</button><button type="button" disabled={saving} onClick={() => void requestOzonChange('ozon.stock.update')} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">申请 Ozon 库存审批</button></> : null}
            <button type="button" onClick={() => setModalMode(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">关闭</button>
            {modalMode !== 'view' ? <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? '保存中' : '保存到本地'}</button> : null}
          </div>
        </form>
      </Modal>

      <Modal open={deleteIds.length > 0} onClose={() => !saving && setDeleteIds([])} title="确认删除本地商品">
        <p className="text-sm leading-6 text-gray-700">将删除 {deleteIds.length} 条本地商品记录。此操作不会调用 Ozon 删除接口，但本地记录无法自动恢复。</p>
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setDeleteIds([])} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button><button disabled={saving} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">确认删除</button></div>
      </Modal>
    </>
  );
}
