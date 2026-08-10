import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Edit3,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import ChartCard from '../components/ui/ChartCard';
import Modal from '../components/ui/Modal.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import MarketplaceSwitcher from '../components/platform/MarketplaceSwitcher';
import { channelsApi, type ChannelConnection } from '../api/channels';
import { productsApi, type Product } from '../api/products';
import {
  productResearchApi,
  type ResearchCandidate,
} from '../api/productResearch';
import { notifyDataUpdated, useAutoRefresh } from '../hooks/useAutoRefresh';
import { useMarketplaceProvider } from '../hooks/useMarketplaceProvider';
import {
  activeChannelForProvider,
  canUseMarketplaceBackend,
  marketplaceConfig,
  marketplaceSource,
  type MarketplaceProvider,
} from '../lib/marketplaces';

type ProductFilter = 'all' | 'marketplace' | 'ozon' | 'temu' | 'agent' | 'draft' | 'active';
type ProductStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

interface ProductEditForm {
  title: string;
  sku: string;
  asinOrExternalId: string;
  price: string;
  cost: string;
  stock: string;
  warehouseId: string;
  currency: string;
  status: ProductStatus;
  imagesText: string;
  changeReason: string;
}

const PRODUCT_STATUSES: ProductStatus[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
  'DELETED',
];

const EMPTY_MARKETPLACE_COUNTS: Record<MarketplaceProvider, number> = {
  OZON: 0,
  TEMU: 0,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function productSource(product: Product): 'ozon' | 'temu' | 'agent' | 'local' {
  const source = asRecord(product.metadata).source;
  if (source === 'ozon') return 'ozon';
  if (source === 'temu') return 'temu';
  if (source === 'agent-product-research') return 'agent';
  return 'local';
}

function sourceLabel(product: Product): string {
  const source = productSource(product);
  if (source === 'ozon') return 'Ozon 同步';
  if (source === 'temu') return 'TEMU 同步';
  if (source === 'agent') return '智能体选品';
  return '本地商品';
}

function candidateMatchesProvider(
  candidate: ResearchCandidate,
  provider: MarketplaceProvider,
): boolean {
  const platform = (candidate.platform || '').toLowerCase();
  const providerKey = provider.toLowerCase();
  const providerLabel = marketplaceConfig[provider].label.toLowerCase();
  return platform.includes(providerKey) || platform.includes(providerLabel);
}

function formatMoney(value: unknown, currency?: string): string {
  const amount = asNumber(value);
  if (amount === null) return '后端未返回';
  return `${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${currency ?? ''}`.trim();
}

function formatCandidatePrice(candidate: ResearchCandidate): string {
  const { min, max } = candidate.priceRange;
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `>= ${min}`;
  if (max !== null) return `<= ${max}`;
  return '后端未返回';
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') {
    return 'bg-[#EEFDF6] text-[#0F8A55]';
  }
  if (status === 'DRAFT') {
    return 'bg-[#FFF8E8] text-[#8A5B00]';
  }
  if (status === 'PAUSED') {
    return 'bg-[#F8F9FF] text-[#4A5578]';
  }
  return 'bg-[#F3F4F6] text-[#6B7280]';
}

function hasLocalPendingChange(product: Product): boolean {
  const metadata = asRecord(product.metadata);
  return (
    metadata.source === 'agent-product-research' ||
    metadata.pendingExternalSync === true ||
    metadata.externalStoreMutation === 'not_executed' ||
    metadata.externalStoreMutation === 'pending_human_confirmation' ||
    Boolean(metadata.latestChangeOrder)
  );
}

function pendingChangeLabel(product: Product): string | null {
  const metadata = asRecord(product.metadata);
  const latestChangeOrder = asRecord(metadata.latestChangeOrder);
  if (latestChangeOrder.status === 'pending_approval') {
    const action = latestChangeOrder.action;
    if (action === 'ozon.price.update') return '调价待审批';
    if (action === 'ozon.stock.update') return '库存待审批';
    return '变更待审批';
  }
  if (metadata.externalStoreMutation === 'pending_human_confirmation') return '待人工确认';
  if (metadata.externalStoreMutation === 'not_executed') return '本地已改';
  if (metadata.pendingExternalSync === true) return '待提交';
  return null;
}

function createEditForm(product: Product): ProductEditForm {
  return {
    title: product.title,
    sku: product.sku ?? '',
    asinOrExternalId: product.asinOrExternalId ?? '',
    price: asNumber(product.price)?.toString() ?? '',
    cost: asNumber(product.cost)?.toString() ?? '',
    stock: asNumber(asRecord(product.metadata).stock)?.toString() ?? '',
    warehouseId:
      asNumber(
        asRecord(product.metadata).warehouseId ??
          asRecord(product.metadata).warehouse_id,
      )?.toString() ?? '',
    currency: (product.currency ?? 'USD').slice(0, 3).toUpperCase(),
    status: PRODUCT_STATUSES.includes(product.status as ProductStatus)
      ? (product.status as ProductStatus)
      : 'DRAFT',
    imagesText: (product.images ?? []).join('\n'),
    changeReason: '',
  };
}

function parseMoneyInput(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('价格和成本必须是非负数字。');
  }
  return parsed;
}

function parseStockInput(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('库存必须是非负整数。');
  }
  return parsed;
}

function parseWarehouseIdInput(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Ozon 仓库 ID 必须是正整数。');
  }
  return parsed;
}

function parseImagesInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function ProductManagement() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { activeProvider, activeMarketplace, setActiveProvider } =
    useMarketplaceProvider();
  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('marketplace');
  const [syncing, setSyncing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectingCandidate, setRejectingCandidate] = useState<ResearchCandidate | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<ProductEditForm | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [requestingChange, setRequestingChange] = useState<
    'ozon.price.update' | 'ozon.stock.update' | null
  >(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setCandidatesLoading(true);
      setError(null);
    }
    try {
      const [productRes, candidateRes, channelRes] = await Promise.all([
        productsApi.list({ limit: 100 }),
        productResearchApi.listCandidates({ limit: 50, status: 'pending' }),
        channelsApi.list({ limit: 100 }),
      ]);
      setProducts(productRes.items ?? []);
      setProductTotal(productRes.total ?? 0);
      setCandidates(candidateRes.items ?? []);
      setChannels(channelRes.items ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '商品管理真实接口读取失败';
      if (!silent) {
        setError(message);
        addToast(message, 'error');
        setProducts([]);
        setCandidates([]);
        setChannels([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
        setCandidatesLoading(false);
      }
    }
  }, [addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshProductsSilently = useCallback(() => loadData(true), [loadData]);
  useAutoRefresh(refreshProductsSilently, 10000);

  const activeMarketplaceChannel = useMemo(
    () => activeChannelForProvider(channels, activeProvider),
    [activeProvider, channels],
  );
  const canSyncActiveProvider = canUseMarketplaceBackend(activeProvider);
  const activeSource = marketplaceSource(activeProvider);

  const stats = useMemo(() => {
    const ozonCount = products.filter((product) => productSource(product) === 'ozon').length;
    const temuCount = products.filter((product) => productSource(product) === 'temu').length;
    const agentCount = products.filter((product) => productSource(product) === 'agent').length;
    const draftCount = products.filter((product) => product.status === 'DRAFT').length;
    const pendingExternalCount = products.filter(hasLocalPendingChange).length;
    const marketplaceCounts: Record<MarketplaceProvider, number> = {
      ...EMPTY_MARKETPLACE_COUNTS,
      OZON: ozonCount,
      TEMU: temuCount,
    };
    return {
      total: productTotal,
      marketplaceCounts,
      activeMarketplaceCount: marketplaceCounts[activeProvider],
      agentCount,
      draftCount,
      pendingExternalCount,
    };
  }, [activeProvider, productTotal, products]);

  const visibleCandidates = useMemo(
    () =>
      candidates.filter((candidate) =>
        candidateMatchesProvider(candidate, activeProvider),
      ),
    [activeProvider, candidates],
  );

  const filteredProducts = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return products.filter((product) => {
      const source = productSource(product);
      if (filter === 'marketplace' && source !== activeSource) return false;
      if (filter === 'ozon' && source !== 'ozon') return false;
      if (filter === 'temu' && source !== 'temu') return false;
      if (filter === 'agent' && source !== 'agent') return false;
      if (filter === 'draft' && product.status !== 'DRAFT') return false;
      if (filter === 'active' && product.status !== 'ACTIVE') return false;
      if (!search) return true;
      return (
        product.title.toLowerCase().includes(search) ||
        (product.sku ?? '').toLowerCase().includes(search) ||
        (product.asinOrExternalId ?? '').toLowerCase().includes(search)
      );
    });
  }, [activeSource, filter, products, searchText]);

  const syncMarketplaceProducts = async () => {
    if (activeProvider !== 'OZON') {
      addToast('TEMU 商品同步后端尚未接入，已拒绝假同步。', 'error');
      return;
    }
    if (!activeMarketplaceChannel) {
      addToast('没有已绑定的 Ozon 渠道，不能假同步商品。', 'error');
      return;
    }
    setSyncing(true);
    try {
      const result = await channelsApi.syncProducts(activeMarketplaceChannel.id, {
        limit: 50,
      });
      addToast(
        `Ozon 商品同步完成：读取 ${result.fetched} 个，写入/更新 ${result.synced} 个。`,
        'success',
      );
      await loadData();
      notifyDataUpdated({
        source: 'ozon-product-sync',
        channelId: result.channelId,
        fetched: result.fetched,
        synced: result.synced,
      });
    } catch (err) {
      addToast(
        err instanceof Error ? `Ozon 商品同步失败：${err.message}` : 'Ozon 商品同步失败。',
        'error',
      );
    } finally {
      setSyncing(false);
    }
  };

  const openCandidateReview = async (candidate: ResearchCandidate) => {
    setApprovingId(candidate.id);
    try {
      const result = await productResearchApi.ensureCandidateReview(candidate.id);
      navigate(`/review?task=${encodeURIComponent(result.reviewTaskId)}`);
    } catch (err) {
      addToast(
        err instanceof Error ? `打开审核预览失败：${err.message}` : '打开审核预览失败。',
        'error',
      );
    } finally {
      setApprovingId(null);
    }
  };

  const rejectCandidate = async () => {
    if (!rejectingCandidate || rejectingId) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      addToast('请填写不批准原因，智能体会将其作为后续选品约束。', 'error');
      return;
    }
    setRejectingId(rejectingCandidate.id);
    try {
      await productResearchApi.rejectCandidate(rejectingCandidate.id, reason);
      addToast(`已不批准“${rejectingCandidate.name}”，原因已写入店铺记忆。`, 'success');
      setRejectingCandidate(null);
      setRejectionReason('');
      await loadData();
      notifyDataUpdated({
        source: 'product-candidate-rejection',
        candidateId: rejectingCandidate.id,
      });
    } catch (err) {
      addToast(
        err instanceof Error ? `不批准选品失败：${err.message}` : '不批准选品失败。',
        'error',
      );
    } finally {
      setRejectingId(null);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditForm(createEditForm(product));
  };

  const updateEditField = <K extends keyof ProductEditForm>(
    field: K,
    value: ProductEditForm[K],
  ) => {
    setEditForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveProductEdit = async () => {
    if (!editingProduct || !editForm) return;
    const title = editForm.title.trim();
    if (!title) {
      addToast('商品标题不能为空。', 'error');
      return;
    }
    const currency = editForm.currency.trim().toUpperCase();
    if (!currency || currency.length > 3) {
      addToast('货币必须是 1-3 位代码，例如 USD、RUB、CNY。', 'error');
      return;
    }

    setSavingProductId(editingProduct.id);
    try {
      const now = new Date().toISOString();
      const metadata = {
        ...asRecord(editingProduct.metadata),
        ...(editForm.warehouseId.trim()
          ? { warehouseId: parseWarehouseIdInput(editForm.warehouseId) }
          : {}),
        localChangeStatus: 'local_product_updated',
        pendingExternalSync: true,
        externalStoreMutation: 'not_executed',
        lastLocalEditAt: now,
        changeSource: 'product_management_ui',
        guardrails: [
          '本次只更新本地 Product 表',
          '不会自动写入外部真实店铺',
          '发布、调价、库存写入仍需通知中心人工确认',
        ],
      };
      await productsApi.update(editingProduct.id, {
        title,
        sku: editForm.sku.trim() || undefined,
        asinOrExternalId: editForm.asinOrExternalId.trim() || undefined,
        price: parseMoneyInput(editForm.price),
        cost: parseMoneyInput(editForm.cost),
        currency,
        status: editForm.status,
        images: parseImagesInput(editForm.imagesText),
        metadata,
      });
      addToast(
        `商品“${title}”已更新到本地商品库；未写入外部真实店铺。`,
        'success',
      );
      setEditingProduct(null);
      setEditForm(null);
      await loadData();
    } catch (err) {
      addToast(
        err instanceof Error ? `商品保存失败：${err.message}` : '商品保存失败。',
        'error',
      );
    } finally {
      setSavingProductId(null);
    }
  };

  const requestOzonChangeApproval = async (
    action: 'ozon.price.update' | 'ozon.stock.update',
  ) => {
    if (!editingProduct || !editForm) return;
    if (productSource(editingProduct) !== 'ozon') {
      addToast('只有 Ozon 同步商品才能申请写入 Ozon 真实店铺。', 'error');
      return;
    }

    setRequestingChange(action);
    try {
      const reason = editForm.changeReason.trim() || undefined;
      const payload =
        action === 'ozon.price.update'
          ? {
              action,
              price: parseMoneyInput(editForm.price),
              reason,
            }
          : {
              action,
              stock: parseStockInput(editForm.stock),
              warehouseId: parseWarehouseIdInput(editForm.warehouseId),
              reason,
            };
      if (action === 'ozon.price.update' && payload.price === undefined) {
        addToast('申请 Ozon 调价前请填写目标售价。', 'error');
        return;
      }
      if (action === 'ozon.stock.update' && payload.stock === undefined) {
        addToast('申请 Ozon 库存写入前请填写目标库存。', 'error');
        return;
      }
      if (
        action === 'ozon.stock.update' &&
        payload.warehouseId === undefined
      ) {
        addToast('申请 Ozon 库存写入前请填写 Ozon 仓库 ID。', 'error');
        return;
      }

      const result = await productsApi.requestOzonChange(
        editingProduct.id,
        payload,
      );
      addToast(
        `已创建商品变更单：${action === 'ozon.price.update' ? 'Ozon 调价' : 'Ozon 库存写入'}，请到通知中心执行或不执行。`,
        'success',
      );
      setProducts((current) =>
        current.map((product) =>
          product.id === result.product.id ? result.product : product,
        ),
      );
      notifyDataUpdated({
        source: 'product-ozon-change-request',
        productId: editingProduct.id,
        notificationId: result.notification.id,
        action,
      });
    } catch (err) {
      addToast(
        err instanceof Error
          ? `创建 Ozon 变更单失败：${err.message}`
          : '创建 Ozon 变更单失败。',
        'error',
      );
    } finally {
      setRequestingChange(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">商品管理</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            当前查看 {activeMarketplace.label} 商品上下文；只展示真实 `/products` 数据和人工批准后的智能体选品。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-medium text-[#4A5578] transition-colors hover:bg-[#F8F9FF]"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            onClick={() => void syncMarketplaceProducts()}
            disabled={syncing || !canSyncActiveProvider || !activeMarketplaceChannel}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#005BFF] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            同步 {activeMarketplace.label} 商品
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[#FFD6D6] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B42318]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <MarketplaceSwitcher
        activeProvider={activeProvider}
        onChange={setActiveProvider}
        channels={channels}
        productCounts={stats.marketplaceCounts}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: '商品总数', value: stats.total, icon: Package, note: '来自 /products' },
          { label: `${activeMarketplace.label} 同步`, value: stats.activeMarketplaceCount, icon: Database, note: `metadata.source=${activeSource}` },
          { label: '本地草稿', value: stats.draftCount, icon: Clock3, note: '待人工完善/发布' },
          { label: '本地变更', value: stats.pendingExternalCount, icon: Edit3, note: '未写入外部店铺' },
          { label: '待批准选品', value: visibleCandidates.length, icon: ShieldCheck, note: `${activeMarketplace.label} 选品报告` },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#8B93B5]">{item.label}</p>
                  <p className="mt-1 text-2xl font-bold text-[#1A1A2E]">
                    {loading && item.label !== '待批准选品' ? '...' : item.value}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F8F9FF] text-[#4A5578]">
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-2 text-xs text-[#8B93B5]">{item.note}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ChartCard
          title={`${activeMarketplace.label} 真实商品库`}
          subtitle={`${activeMarketplace.label} 切换后只看该平台来源商品；未接入则显示空状态，不生成假商品`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B93B5]"
                />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="h-8 w-56 rounded-lg border border-[#DDE1F2] bg-white pl-8 pr-3 text-xs outline-none focus:border-[#6C63FF]"
                  placeholder="搜索标题、SKU、外部 ID"
                />
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as ProductFilter)}
                className="h-8 rounded-lg border border-[#DDE1F2] bg-white px-2 text-xs text-[#4A5578] outline-none focus:border-[#6C63FF]"
              >
                <option value="all">全部商品</option>
                <option value="marketplace">当前平台同步</option>
                <option value="ozon">Ozon 同步</option>
                <option value="temu">TEMU 同步</option>
                <option value="agent">智能体选品</option>
                <option value="draft">草稿</option>
                <option value="active">已上架/活跃</option>
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8]">
                  <th className="py-2 text-left text-xs font-medium text-[#8B93B5]">商品</th>
                  <th className="py-2 text-left text-xs font-medium text-[#8B93B5]">来源</th>
                  <th className="py-2 text-left text-xs font-medium text-[#8B93B5]">SKU / 外部 ID</th>
                  <th className="py-2 text-right text-xs font-medium text-[#8B93B5]">价格</th>
                  <th className="py-2 text-center text-xs font-medium text-[#8B93B5]">状态</th>
                  <th className="py-2 text-right text-xs font-medium text-[#8B93B5]">创建时间</th>
                  <th className="py-2 text-right text-xs font-medium text-[#8B93B5]">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-[#8B93B5]">
                      正在读取真实商品库...
                    </td>
                  </tr>
                ) : filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b border-[#F0F0F8] last:border-0">
                      <td className="py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {product.images?.[0] ? (
                            <img
                              src={product.images[0]}
                              alt=""
                              className="h-10 w-10 rounded-lg border border-[#E8E8F0] object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8F9FF] text-[#8B93B5]">
                              <Package size={16} />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#1A1A2E]">{product.title}</p>
                            <p className="truncate text-xs text-[#8B93B5]">{product.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-xs text-[#4A5578]">
                        <div>{sourceLabel(product)}</div>
                        {pendingChangeLabel(product) ? (
                          <div className="mt-1 inline-flex rounded-md bg-[#FFF8E8] px-1.5 py-0.5 text-[10px] font-medium text-[#8A5B00]">
                            {pendingChangeLabel(product)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-xs text-[#4A5578]">
                        <div>{product.sku || '后端未返回 SKU'}</div>
                        <div className="text-[#8B93B5]">
                          {product.asinOrExternalId || '后端未返回外部 ID'}
                        </div>
                      </td>
                      <td className="py-3 text-right text-xs font-medium text-[#1A1A2E]">
                        {formatMoney(product.price, product.currency)}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${statusBadge(product.status)}`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-xs text-[#8B93B5]">
                        {new Date(product.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => openEditModal(product)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#DDE1F2] px-2 text-xs font-medium text-[#4A5578] transition-colors hover:bg-[#F8F9FF]"
                        >
                          <Edit3 size={13} />
                          编辑
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-[#8B93B5]">
                      当前筛选下没有真实商品记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title={`${activeMarketplace.label} 智能体选品待审核`}
          subtitle="在人工审核中心查看证据、确认图片生成与 Ozon 上架"
        >
          <div className="space-y-3">
            {candidatesLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#E8E8F0] py-8 text-xs text-[#8B93B5]">
                <Loader2 size={14} className="animate-spin" />
                正在读取真实选品候选...
              </div>
            ) : visibleCandidates.length > 0 ? (
              visibleCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border border-[#E8E8F0] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1A1A2E]">
                        {candidate.name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#8B93B5]">
                        来源报告：{candidate.query}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-[#FFF8E8] px-2 py-1 text-[11px] font-medium text-[#8A5B00]">
                      待批准
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-[#F8F9FF] p-2">
                      <p className="text-[#8B93B5]">平台</p>
                      <p className="mt-1 truncate font-medium text-[#1A1A2E]">
                        {candidate.platform || '后端未返回'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#F8F9FF] p-2">
                      <p className="text-[#8B93B5]">价格区间</p>
                      <p className="mt-1 truncate font-medium text-[#1A1A2E]">
                        {formatCandidatePrice(candidate)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#F8F9FF] p-2">
                      <p className="text-[#8B93B5]">后端 rating</p>
                      <p className="mt-1 truncate font-medium text-[#1A1A2E]">
                        {candidate.rating ?? '后端未返回'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void openCandidateReview(candidate)}
                    disabled={approvingId === candidate.id}
                    className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F8A55] text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {approvingId === candidate.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Edit3 size={14} />
                    )}
                    打开审核预览
                  </button>
                  <button
                    onClick={() => {
                      setRejectingCandidate(candidate);
                      setRejectionReason('');
                    }}
                    disabled={approvingId === candidate.id}
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 border border-[#FECACA] bg-white text-xs font-semibold text-[#B91C1C] transition-colors hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle size={14} />
                    不批准并记录原因
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-6 text-center">
                <ShieldCheck size={24} className="mx-auto text-[#C6CCDA]" />
                <p className="mt-2 text-sm font-medium text-[#4A5578]">
                  暂无 {activeMarketplace.label} 待批准选品
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8B93B5]">
                  这里只显示后端 `/product-research/candidates` 的真实候选；绑定店铺后的自动选品巡检会把待批准候选推到这里。
                </p>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      <Modal
        open={!!rejectingCandidate}
        onClose={() => {
          if (!rejectingId) {
            setRejectingCandidate(null);
            setRejectionReason('');
          }
        }}
        title="不批准智能体选品"
      >
        {rejectingCandidate ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[#475569]">
              “{rejectingCandidate.name}”不会创建本地商品，也不会对 Ozon 执行任何写入。
            </p>
            <label className="block text-sm font-medium text-[#334155]">
              不批准原因
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="例如：不符合目标类目、包含禁售词、运输风险过高"
                className="mt-1.5 w-full resize-y border border-[#D8DCEB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-[#E8E8F0] pt-4">
              <button
                type="button"
                onClick={() => {
                  setRejectingCandidate(null);
                  setRejectionReason('');
                }}
                disabled={!!rejectingId}
                className="h-9 border border-[#D8DCEB] px-3 text-sm font-medium text-[#475569] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void rejectCandidate()}
                disabled={!!rejectingId}
                className="inline-flex h-9 items-center gap-2 bg-[#B91C1C] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rejectingId ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                确认不批准
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!editingProduct && !!editForm}
        onClose={() => {
          setEditingProduct(null);
          setEditForm(null);
        }}
        title="编辑商品"
        width="max-w-2xl"
      >
        {editingProduct && editForm ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#FFE1B8] bg-[#FFF8E8] p-3 text-xs leading-5 text-[#8A5B00]">
              “保存本地变更”只更新 Product 表；平台写入审批只创建通知中心变更单。真实外部店铺不会被无确认修改。
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[#4A5578]">商品标题</span>
                <input
                  value={editForm.title}
                  onChange={(event) => updateEditField('title', event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">SKU</span>
                <input
                  value={editForm.sku}
                  onChange={(event) => updateEditField('sku', event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="后端未返回可留空"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">外部商品 ID</span>
                <input
                  value={editForm.asinOrExternalId}
                  onChange={(event) =>
                    updateEditField('asinOrExternalId', event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="平台 offer_id / product_id"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">售价</span>
                <input
                  value={editForm.price}
                  onChange={(event) => updateEditField('price', event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">成本</span>
                <input
                  value={editForm.cost}
                  onChange={(event) => updateEditField('cost', event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">目标库存</span>
                <input
                  value={editForm.stock}
                  onChange={(event) => updateEditField('stock', event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  inputMode="numeric"
                  placeholder="用于申请平台库存写入审批"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">
                  Ozon 仓库 ID
                </span>
                <input
                  value={editForm.warehouseId}
                  onChange={(event) =>
                    updateEditField('warehouseId', event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  inputMode="numeric"
                  placeholder="库存审批必填"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">货币</span>
                <input
                  value={editForm.currency}
                  onChange={(event) =>
                    updateEditField('currency', event.target.value.toUpperCase())
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  maxLength={3}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#4A5578]">本地状态</span>
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    updateEditField('status', event.target.value as ProductStatus)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm outline-none focus:border-[#6C63FF]"
                >
                  {PRODUCT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[#4A5578]">变更原因</span>
                <input
                  value={editForm.changeReason}
                  onChange={(event) =>
                    updateEditField('changeReason', event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                  placeholder="会写入通知中心变更单，便于人工审批"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[#4A5578]">
                  图片 URL（一行一个，或用英文逗号分隔）
                </span>
                <textarea
                  value={editForm.imagesText}
                  onChange={(event) =>
                    updateEditField('imagesText', event.target.value)
                  }
                  className="min-h-24 w-full rounded-lg border border-[#DDE1F2] px-3 py-2 text-sm outline-none focus:border-[#6C63FF]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-[#EEF0FA] pt-4 sm:flex-row sm:justify-end">
              {productSource(editingProduct) === 'ozon' ? (
                <>
                  <button
                    onClick={() => void requestOzonChangeApproval('ozon.price.update')}
                    disabled={requestingChange !== null}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE1F2] px-4 text-xs font-medium text-[#4A5578] transition-colors hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestingChange === 'ozon.price.update' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    申请 Ozon 调价审批
                  </button>
                  <button
                    onClick={() => void requestOzonChangeApproval('ozon.stock.update')}
                    disabled={requestingChange !== null}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE1F2] px-4 text-xs font-medium text-[#4A5578] transition-colors hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestingChange === 'ozon.stock.update' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    申请 Ozon 库存审批
                  </button>
                </>
              ) : productSource(editingProduct) === 'temu' ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE1F2] px-4 text-xs font-medium text-[#8B93B5] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ShieldCheck size={14} />
                  TEMU 写入审批后端待接入
                </button>
              ) : null}
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setEditForm(null);
                }}
                className="h-9 rounded-lg border border-[#DDE1F2] px-4 text-xs font-medium text-[#4A5578] transition-colors hover:bg-[#F8F9FF]"
              >
                取消
              </button>
              <button
                onClick={() => void saveProductEdit()}
                disabled={savingProductId === editingProduct.id}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0F8A55] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProductId === editingProduct.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                保存本地变更
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default ProductManagement;
