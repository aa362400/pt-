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
    sku: product.sku || product.asinOrExternalId || 'english_text',
    image: product.imageUrl || product.images?.[0] || 'O',
    platforms: isOzonProduct(product) ? ['Ozon'] : ['local'],
    price: `${price.toLocaleString('zh-CN')} ${product.currency || 'RUB'}`,
    cost: Number.isFinite(cost) && cost > 0 ? `${cost.toLocaleString('zh-CN')} ${product.currency || 'RUB'}` : 'english_text',
    profit: Number.isFinite(cost) && cost > 0 ? `${(price - cost).toLocaleString('zh-CN')} ${product.currency || 'RUB'}` : 'english_text',
    stock,
    sales30d: numberFromMetadata(product, 'sales30d') ?? 'english_text',
    views30d: numberFromMetadata(product, 'views30d') ?? 'english_text',
    conversionRate: typeof product.metadata?.conversionRate === 'string' ? product.metadata.conversionRate : 'english_text',
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
    if (productsResult.status === 'fulfilled') setSourceProducts(productsResult.value.items); else { setSourceProducts([]); addToast(productsResult.reason instanceof Error ? productsResult.reason.message : 'productdatareadfailed', 'error'); }
    if (channelsResult.status === 'fulfilled') setChannels(channelsResult.value.items); else setChannels([]);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const products = useMemo(() => sourceProducts.map(mapProduct), [sourceProducts]);
  const sourceById = useMemo(() => new Map(sourceProducts.map((product) => [product.id, product])), [sourceProducts]);
  const active = products.filter((item) => item.status === 'active').length;
  const alerts = products.filter((item) => item.status === 'low_stock' || item.status === 'out_of_stock').length;
  const stats = [
    { label: 'textproduct', value: String(active), change: 'real /products', trend: 'up' as const, icon: Package },
    { label: 'producttext', value: String(products.length), change: 'realtext', trend: 'up' as const, icon: TrendingUp },
    { label: 'english_text', value: String(alerts), change: 'english_textfields', trend: alerts ? 'down' as const : 'up' as const, icon: AlertCircle },
    { label: 'profittext', value: String(sourceProducts.filter((item) => Number(item.cost ?? 0) > 0).length), change: 'english_textprofittext', trend: 'up' as const, icon: Star },
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
    if (!form.title.trim()) return addToast('producttitleenglish_text', 'error');
    const price = money(form.price);
    const cost = money(form.cost);
    const stock = Number(form.stock);
    if (form.price.trim() && price === undefined) return addToast('pricetextyesenglish_text', 'error');
    if (form.cost.trim() && cost === undefined) return addToast('costtextyesenglish_text', 'error');
    if (!Number.isInteger(stock) || stock < 0) return addToast('english_textyesenglish_text', 'error');
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
      addToast(editingProduct ? 'productenglish_textlocalproducttext，english_textwrite Ozon。' : 'localproductenglish_text。', 'success');
      setModalMode(null);
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'producttextfailed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestOzonChange = async (action: 'ozon.price.update' | 'ozon.stock.update') => {
    if (!editingProduct || !isOzonProduct(editingProduct)) return addToast('textyes Ozon syncproductenglish_textrealstoretext。', 'error');
    const price = money(form.price);
    const stock = Number(form.stock);
    const warehouseId = Number(form.warehouseId);
    if (action === 'ozon.price.update' && price === undefined) return addToast('english_textyesenglish_textprice', 'error');
    if (action === 'ozon.stock.update' && (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(warehouseId) || warehouseId <= 0)) return addToast('english_textyesenglish_text Ozon text ID', 'error');
    setSaving(true);
    try {
      await productsApi.requestOzonChange(editingProduct.id, action === 'ozon.price.update'
        ? { action, price, reason: form.changeReason.trim() || undefined }
        : { action, stock, warehouseId, reason: form.changeReason.trim() || undefined });
      addToast('english_texthumanenglish_text；textwrite Ozon。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'english_textfailed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncOzon = async () => {
    const channel = channels.find((item) => item.provider === 'OZON' && item.syncStatus !== 'DISCONNECTED');
    if (!channel) return addToast('textyesenglish_text Ozon text，english_textsyncproduct。', 'error');
    setSyncing(true);
    try {
      const result = await channelsApi.syncProducts(channel.id, { limit: 50 });
      addToast(`Ozon productsynccompleted：read ${result.fetched} text，write/text ${result.synced} text。`, 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon productsyncfailed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const copyProduct = async (id: string) => {
    const product = sourceById.get(id);
    if (!product) return;
    try {
      await productsApi.create({
        title: `${product.title}（text）`, sku: undefined, price: product.price, cost: product.cost, currency: product.currency, status: 'DRAFT', imageUrl: product.imageUrl, images: product.images,
        metadata: { ...(product.metadata ?? {}), source: 'local', copiedFromProductId: product.id, externalStoreMutation: 'not_executed' },
      });
      addToast('english_textlocalenglish_text，textwrite Ozon。', 'success');
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'textproductfailed', 'error'); }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await Promise.all(deleteIds.map((id) => productsApi.delete(id)));
      addToast(`english_text ${deleteIds.length} textlocalproducttext。`, 'success');
      setDeleteIds([]);
      await load();
    } catch (error) { addToast(error instanceof Error ? error.message : 'textproductfailed', 'error'); }
    finally { setSaving(false); }
  };

  const exportProducts = () => {
    const rows = [['ID', 'title', 'SKU', 'status', 'price', 'cost', 'text'], ...sourceProducts.map((product) => [product.id, product.title, product.sku ?? '', product.status, String(product.price ?? ''), String(product.cost ?? ''), product.currency ?? ''])];
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
        onBatchEdit={(ids) => ids[0] ? openProduct(ids[0], 'edit') : addToast('english_textproduct', 'error')}
        onBatchDelete={(ids) => setDeleteIds(ids)}
      />

      <Modal open={Boolean(modalMode)} onClose={() => !saving && setModalMode(null)} title={modalMode === 'create' ? 'textlocalproduct' : modalMode === 'view' ? 'producttext' : 'textproduct'} width="max-w-3xl">
        <form onSubmit={saveProduct} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 text-sm">producttitle<input disabled={modalMode === 'view'} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">SKU<input disabled={modalMode === 'view'} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">image URL<input disabled={modalMode === 'view'} value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">price<input disabled={modalMode === 'view'} inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">cost<input disabled={modalMode === 'view'} inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">text<input disabled={modalMode === 'view'} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">text<input disabled={modalMode === 'view'} inputMode="numeric" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          <label className="text-sm">status<select disabled={modalMode === 'view'} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"><option value="DRAFT">text</option><option value="ACTIVE">text</option><option value="PAUSED">text</option></select></label>
          <label className="text-sm">Ozon text ID<input disabled={modalMode === 'view'} inputMode="numeric" value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
          {editingProduct && isOzonProduct(editingProduct) && modalMode !== 'view' ? <label className="md:col-span-2 text-sm">english_text<textarea value={form.changeReason} onChange={(event) => setForm({ ...form, changeReason: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label> : null}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            {editingProduct && isOzonProduct(editingProduct) && modalMode === 'edit' ? <><button type="button" disabled={saving} onClick={() => void requestOzonChange('ozon.price.update')} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">text Ozon textapproval</button><button type="button" disabled={saving} onClick={() => void requestOzonChange('ozon.stock.update')} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">text Ozon textapproval</button></> : null}
            <button type="button" onClick={() => setModalMode(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">text</button>
            {modalMode !== 'view' ? <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? 'english_text' : 'english_textlocal'}</button> : null}
          </div>
        </form>
      </Modal>

      <Modal open={deleteIds.length > 0} onClose={() => !saving && setDeleteIds([])} title="english_textlocalproduct">
        <p className="text-sm leading-6 text-gray-700">english_text {deleteIds.length} textlocalproducttext。english_text Ozon textAPI，textlocaltextnonetextautomatictext。</p>
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setDeleteIds([])} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">text</button><button disabled={saving} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">english_text</button></div>
      </Modal>
    </>
  );
}
