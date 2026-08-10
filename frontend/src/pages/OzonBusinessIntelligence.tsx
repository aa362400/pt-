import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { channelsApi, type ChannelConnection, type MarketplaceOrder } from '../api/channels';
import { productsApi, type Product } from '../api/products';
import { useToast } from '../components/ui/use-toast.ts';
import { notifyDataUpdated, useAutoRefresh } from '../hooks/useAutoRefresh';

type OzonBusinessMode = 'competition' | 'market';

interface OzonBusinessIntelligenceProps {
  mode: OzonBusinessMode;
}

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: number | string | null | undefined, currency = 'RUB'): string {
  const amount = numberValue(value);
  return `${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${currency}`.trim();
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function productSource(product: Product): string {
  const source = product.metadata?.source;
  return typeof source === 'string' ? source.toLowerCase() : '';
}

function ozonStatus(product: Product): string {
  const status = product.metadata?.ozonStatus;
  return typeof status === 'string' && status ? status : product.status;
}

function isOzonProduct(product: Product): boolean {
  return productSource(product) === 'ozon';
}

function latestChannel(channels: ChannelConnection[]): ChannelConnection | null {
  return channels
    .filter((channel) => channel.provider === 'OZON')
    .sort((a, b) => {
      const left = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
      const right = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
      return right - left;
    })[0] ?? null;
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DDE1F2] bg-[#FAFBFF] px-4 py-8 text-center text-sm leading-6 text-[#6B7280]">
      {children}
    </div>
  );
}

function MetricTile({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#8B93B5]">{label}</p>
          <p className="mt-1 break-words text-xl font-bold text-[#1A1A2E]">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8F9FF] text-[#4A5578]">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#8B93B5]">{note}</p>
    </div>
  );
}

export default function OzonBusinessIntelligence({ mode }: OzonBusinessIntelligenceProps) {
  const { addToast } = useToast();
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [channelRes, productRes, orderRes] = await Promise.all([
        channelsApi.list({ provider: 'OZON', limit: 20 }),
        productsApi.list({ limit: 100 }),
        channelsApi.listOrders({ provider: 'OZON', limit: 100 }),
      ]);
      setChannels(channelRes.items);
      setProducts(productRes.items.filter(isOzonProduct));
      setOrders(orderRes.items);
      setOrderTotal(orderRes.total);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ozon textdatatextfailed';
      if (!silent) {
        setError(message);
        addToast(message, 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useAutoRefresh(useCallback(() => loadData(true), [loadData]), 10000);

  const activeChannel = useMemo(() => latestChannel(channels), [channels]);
  const connected = activeChannel?.syncStatus === 'SUCCESS';
  const staleDays = daysSince(activeChannel?.lastSyncedAt);

  const totalRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + numberValue(order.totalAmount), 0),
    [orders],
  );
  const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
  const productPrices = products.map((product) => numberValue(product.price)).filter((price) => price > 0);
  const averagePrice =
    productPrices.length > 0
      ? productPrices.reduce((sum, price) => sum + price, 0) / productPrices.length
      : 0;
  const minProductPrice = productPrices.length > 0 ? Math.min(...productPrices) : 0;
  const maxProductPrice = productPrices.length > 0 ? Math.max(...productPrices) : 0;
  const missingPriceCount = products.filter((product) => numberValue(product.price) <= 0).length;
  const missingSkuCount = products.filter((product) => !product.sku && !product.asinOrExternalId).length;
  const inactiveCount = products.filter((product) => !String(ozonStatus(product)).toLowerCase().includes('active')).length;

  const orderByDay = useMemo(() => {
    const map = new Map<string, { date: string; orders: number; revenue: number }>();
    for (const order of orders) {
      const day = (order.orderedAt ?? order.createdAt).slice(0, 10);
      const current = map.get(day) ?? { date: day, orders: 0, revenue: 0 };
      current.orders += 1;
      current.revenue += numberValue(order.totalAmount);
      map.set(day, current);
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  }, [orders]);

  const riskyProducts = useMemo(
    () =>
      products
        .map((product) => {
          const price = numberValue(product.price);
          const reasons = [
            price <= 0 ? 'english_text' : null,
            !product.sku && !product.asinOrExternalId ? 'text SKU/textID' : null,
            !String(ozonStatus(product)).toLowerCase().includes('active') ? `status ${ozonStatus(product)}` : null,
          ].filter((item): item is string => Boolean(item));
          return { product, price, reasons };
        })
        .filter((item) => item.reasons.length > 0)
        .slice(0, 10),
    [products],
  );

  const syncAll = async () => {
    if (!activeChannel) {
      addToast('textyesenglish_text Ozon text，textsync。', 'error');
      return;
    }
    setSyncing(true);
    try {
      const [productSync, orderSync] = await Promise.all([
        channelsApi.syncProducts(activeChannel.id, { limit: 50 }),
        channelsApi.syncOrders(activeChannel.id, { limit: 100 }),
      ]);
      addToast(
        `Ozon textsync：product ${productSync.synced} text，orders ${orderSync.synced} text。`,
        orderSync.warnings.length > 0 ? 'warning' : 'success',
      );
      notifyDataUpdated({
        source: 'ozon-business-sync',
        channelId: activeChannel.id,
        productSync,
        orderSync,
      });
      await loadData(true);
    } catch (err) {
      addToast(err instanceof Error ? `Ozon syncfailed：${err.message}` : 'Ozon syncfailed。', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const pageTitle = mode === 'competition' ? 'Ozon textmonitoring' : 'Ozon english_text';
  const pageSubtitle =
    mode === 'competition'
      ? 'textreal Ozon productenglish_text、statusenglish_textriskmonitoring；english_textAPIenglish_textdata。'
      : 'textreal Ozon orderstextproductsyncenglish_text、english_text。';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{pageTitle}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-[#6B7280]">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
          >
            <RefreshCw size={14} />
            text
          </button>
          <button
            onClick={() => void syncAll()}
            disabled={!connected || syncing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#005BFF] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Database size={14} />
            {syncing ? 'synctext' : 'sync Ozon'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[#FFD6D6] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B42318]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#DDE6FF] bg-[#F7FAFF] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
              connected ? 'bg-[#EAF8F1] text-[#0F8A55]' : 'bg-[#FFF5F5] text-[#B42318]'
            }`}>
              {connected ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1A1A2E]">
                {connected ? 'Ozon Seller API textconnection' : 'Ozon Seller API english_textconnectionstatus'}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5F6B8A]">
                text：{activeChannel?.externalShopId ?? activeChannel?.id ?? 'english_text'}；status：
                {activeChannel?.syncStatus ?? 'english_text'}；textsync：{formatDate(activeChannel?.lastSyncedAt)}
              </p>
            </div>
          </div>
          <span className="w-fit rounded-md bg-white px-2.5 py-1 text-xs font-medium text-[#4A5578]">
            {staleDays === null ? 'textnonesynctext' : staleDays > 0 ? `${staleDays} textsync` : 'english_textsync'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Ozon product" value={products.length} note="text Product.metadata.source=ozon" icon={Package} />
        <MetricTile label="Ozon orders" value={orderTotal} note="text /channels/orders?provider=OZON" icon={ShoppingCart} />
        <MetricTile label="textorderstext" value={formatMoney(totalRevenue, orders[0]?.currency ?? 'RUB')} note="english_textorderstext" icon={TrendingUp} />
        <MetricTile
          label={mode === 'competition' ? 'textrisk' : 'english_text'}
          value={mode === 'competition' ? missingPriceCount + missingSkuCount + inactiveCount : formatMoney(averageOrderValue, orders[0]?.currency ?? 'RUB')}
          note={mode === 'competition' ? 'english_text、english_textIDtext active status' : 'textordersenglish_text'}
          icon={BarChart3}
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-8 text-center text-sm text-[#8B93B5]">
          textreadreal Ozon data...
        </div>
      ) : mode === 'competition' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="border-b border-[#EEF0FA] p-4">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">english_textrisk</h3>
              <p className="mt-1 text-xs text-[#8B93B5]">real Ozon producttextrisk，english_text。</p>
            </div>
            <div className="p-4">
              {riskyProducts.length ? (
                <div className="space-y-3">
                  {riskyProducts.map(({ product, price, reasons }) => (
                    <div key={product.id} className="rounded-lg border border-[#EEF0FA] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#1A1A2E]">{product.title}</p>
                          <p className="mt-1 text-xs text-[#8B93B5]">{product.sku ?? product.asinOrExternalId ?? 'text SKU/textID'}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#1A1A2E]">{formatMoney(price, product.currency ?? 'RUB')}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reasons.map((reason) => (
                          <span key={reason} className="rounded-md bg-[#FFF5F5] px-2 py-1 text-[11px] font-medium text-[#B42318]">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.length ? (
                <EmptyState>english_text Ozon producttextyesenglish_text、text SKU/textID text active status。</EmptyState>
              ) : (
                <EmptyState>textnonereal Ozon product。english_text Ozon textsyncproducttext。</EmptyState>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="border-b border-[#EEF0FA] p-4">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">english_text</h3>
              <p className="mt-1 text-xs text-[#8B93B5]">textsyncproductenglish_text。</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg bg-[#F8F9FF] p-3">
                <p className="text-xs text-[#8B93B5]">text</p>
                <p className="mt-1 text-xl font-bold text-[#1A1A2E]">{formatMoney(averagePrice, products[0]?.currency ?? 'RUB')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#EEF0FA] p-3">
                  <p className="text-xs text-[#8B93B5]">english_text</p>
                  <p className="mt-1 font-semibold text-[#1A1A2E]">{formatMoney(minProductPrice, products[0]?.currency ?? 'RUB')}</p>
                </div>
                <div className="rounded-lg border border-[#EEF0FA] p-3">
                  <p className="text-xs text-[#8B93B5]">english_text</p>
                  <p className="mt-1 font-semibold text-[#1A1A2E]">{formatMoney(maxProductPrice, products[0]?.currency ?? 'RUB')}</p>
                </div>
              </div>
              <p className="text-xs leading-5 text-[#8B93B5]">
                textcompetitor price、text、textAPIenglish_text；english_textyesproductenglish_textcompetitor price。
              </p>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="border-b border-[#EEF0FA] p-4">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">text 7 textyesorderstext</h3>
              <p className="mt-1 text-xs text-[#8B93B5]">textreal Ozon orders orderedAt text。</p>
            </div>
            <div className="p-4">
              {orderByDay.length ? (
                <div className="space-y-3">
                  {orderByDay.map((item) => (
                    <div key={item.date} className="grid grid-cols-[110px_1fr_130px] items-center gap-3 rounded-lg border border-[#EEF0FA] p-3 text-sm">
                      <span className="font-medium text-[#1A1A2E]">{item.date}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-[#EEF0FA]">
                        <div
                          className="h-full rounded-full bg-[#005BFF]"
                          style={{ width: `${Math.max(8, Math.min(100, (item.revenue / Math.max(totalRevenue, 1)) * 100))}%` }}
                        />
                      </div>
                      <span className="text-right text-xs font-semibold text-[#4A5578]">
                        {item.orders} text / {formatMoney(item.revenue, orders[0]?.currency ?? 'RUB')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>textnonereal Ozon orders。textsyncorders。</EmptyState>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="border-b border-[#EEF0FA] p-4">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">textorders</h3>
              <p className="mt-1 text-xs text-[#8B93B5]">english_text MarketplaceOrder。</p>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-4">
              {orders.length ? (
                <div className="space-y-3">
                  {orders.slice(0, 10).map((order) => (
                    <div key={order.id} className="rounded-lg border border-[#EEF0FA] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-[#1A1A2E]">{order.externalPostingNumber}</p>
                          <p className="mt-1 text-xs text-[#8B93B5]">{order.fulfillmentType ?? '-'} / {order.status}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#1A1A2E]">
                          {formatMoney(order.totalAmount, order.currency)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[#8B93B5]">{formatDate(order.orderedAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>textnonereal Ozon orders。</EmptyState>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
