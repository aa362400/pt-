import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, RefreshCw, Sparkles, Wifi } from 'lucide-react';
import { api } from '../api/client';
import {
  channelsApi,
  type ChannelConnection,
  type OzonDiagnosticsResponse,
} from '../api/channels';
import { productsApi } from '../api/products';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast';
import {
  PlatformConnection,
  type PlatformConnectionItem,
} from '../figma-exact/PlatformConnection';

interface WorkspaceSummary {
  id: string;
  name?: string;
}

interface OzonConnectionDraft {
  clientId: string;
  apiKey: string;
  externalShopId: string;
}

const EMPTY_CONNECTION_DRAFT: OzonConnectionDraft = {
  clientId: '',
  apiKey: '',
  externalShopId: '',
};

function formatDate(value?: string | null) {
  if (!value) return '从未同步';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间无效'
    : date.toLocaleString('zh-CN', { hour12: false });
}

function platformStatus(channels: ChannelConnection[]): PlatformConnectionItem['status'] {
  if (channels.some((channel) => channel.syncStatus === 'SUCCESS' || channel.syncStatus === 'SYNCING' || channel.syncStatus === 'PENDING')) {
    return 'connected';
  }
  if (channels.some((channel) => channel.syncStatus === 'FAILED')) return 'error';
  return 'disconnected';
}

export default function PlatformConnectionV2() {
  const { addToast } = useToast();
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [ozonProductTotal, setOzonProductTotal] = useState<number | null>(null);
  const [orderTotals, setOrderTotals] = useState<Record<string, number | null>>({});
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<OzonConnectionDraft>(EMPTY_CONNECTION_DRAFT);
  const [diagnostic, setDiagnostic] = useState<OzonDiagnosticsResponse | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await channelsApi.list({ limit: 100 });
      const nextChannels = response.items;
      const ozonChannels = nextChannels.filter((channel) => channel.provider === 'OZON');
      setChannels(nextChannels);

      const [productsResult, ...orderResults] = await Promise.allSettled([
        productsApi.list({ limit: 1 }),
        ...ozonChannels.map((channel) =>
          channelsApi.listOrders({ limit: 1, channelId: channel.id, provider: 'OZON' }),
        ),
      ]);

      setOzonProductTotal(
        productsResult.status === 'fulfilled' ? productsResult.value.total : null,
      );
      const nextOrderTotals: Record<string, number | null> = {};
      ozonChannels.forEach((channel, index) => {
        const result = orderResults[index];
        nextOrderTotals[channel.id] = result?.status === 'fulfilled' ? result.value.total : null;
      });
      setOrderTotals(nextOrderTotals);

      if (
        productsResult.status === 'rejected'
        || orderResults.some((result) => result.status === 'rejected')
      ) {
        addToast('平台连接已读取，但部分商品或订单统计读取失败。失败项显示“未读取”。', 'error');
      }
    } catch (error) {
      setChannels([]);
      setOzonProductTotal(null);
      setOrderTotals({});
      addToast(error instanceof Error ? error.message : '平台连接读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSyncStore = useCallback(async (platformId: string, storeId: string) => {
    if (platformId !== 'OZON') {
      addToast('TEMU 真实同步客户端尚未接入，未执行假同步。', 'error');
      return;
    }
    setSyncingStoreId(storeId);
    try {
      const [productsResult, ordersResult] = await Promise.allSettled([
        channelsApi.syncProducts(storeId, { limit: 100 }),
        channelsApi.syncOrders(storeId, { limit: 100 }),
      ]);
      const succeeded = Number(productsResult.status === 'fulfilled') + Number(ordersResult.status === 'fulfilled');
      if (succeeded === 0) {
        const reason = productsResult.status === 'rejected' ? productsResult.reason : ordersResult.status === 'rejected' ? ordersResult.reason : null;
        throw reason instanceof Error ? reason : new Error('Ozon 商品和订单同步均失败');
      }
      addToast(
        succeeded === 2
          ? 'Ozon 商品和订单同步完成，正在回读真实统计。'
          : 'Ozon 仅部分同步成功，失败部分未标记为成功。',
        succeeded === 2 ? 'success' : 'error',
      );
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon 同步失败', 'error');
    } finally {
      setSyncingStoreId(null);
    }
  }, [addToast, load]);

  const handleDiagnoseStore = useCallback(async (platformId: string, storeId: string) => {
    if (platformId !== 'OZON') {
      addToast('TEMU 真实诊断接口尚未接入。', 'error');
      return;
    }
    setDiagnostic(null);
    setDiagnosticLoading(true);
    try {
      setDiagnostic(await channelsApi.diagnoseOzon(storeId));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon 连接诊断失败', 'error');
    } finally {
      setDiagnosticLoading(false);
    }
  }, [addToast]);

  const handleConnectOzon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connectionDraft.clientId.trim() || !connectionDraft.apiKey.trim()) return;
    setConnecting(true);
    try {
      const workspaces = await api.get<{ items: WorkspaceSummary[]; total: number }>('/workspaces', {
        params: { limit: 1 },
      });
      const workspace = workspaces.items[0];
      if (!workspace) throw new Error('当前账号没有可用工作区，无法连接 Ozon。');
      const result = await channelsApi.connectOzon({
        workspaceId: workspace.id,
        clientId: connectionDraft.clientId.trim(),
        apiKey: connectionDraft.apiKey.trim(),
        ...(connectionDraft.externalShopId.trim()
          ? { externalShopId: connectionDraft.externalShopId.trim() }
          : {}),
      });
      if (!result.verification.ok) throw new Error('Ozon 凭据验证未通过。');
      setConnectionOpen(false);
      setConnectionDraft(EMPTY_CONNECTION_DRAFT);
      addToast('Ozon 凭据验证通过，连接记录已创建。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon 连接失败', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const platforms = useMemo<PlatformConnectionItem[]>(() => {
    const ozonChannels = channels.filter((channel) => channel.provider === 'OZON');
    const temuChannels = channels.filter((channel) => channel.provider === 'TEMU');
    const hasSingleOzonStore = ozonChannels.length === 1;
    return [
      {
        id: 'OZON',
        name: 'Ozon',
        logo: 'O',
        color: 'bg-blue-600',
        status: platformStatus(ozonChannels),
        stores: ozonChannels.map((channel) => ({
          name: channel.externalShopId || 'Ozon 店铺',
          storeId: channel.id,
          connected: channel.syncStatus !== 'DISCONNECTED',
          products: hasSingleOzonStore ? ozonProductTotal : null,
          orders: orderTotals[channel.id] ?? null,
          countScope: hasSingleOzonStore
            ? '商品数为当前组织唯一 Ozon 店铺的真实商品总数；订单数按此连接统计。'
            : '多店铺模式下商品缺少店铺归属字段，因此不重复展示组织总数。',
          lastSync: formatDate(channel.lastSyncedAt),
          apiStatus: channel.syncStatus === 'FAILED'
            ? 'error'
            : channel.syncStatus === 'SUCCESS'
              ? 'healthy'
              : 'warning',
          warning: channel.syncStatus === 'FAILED' ? '最近同步失败，请运行连接诊断。' : undefined,
        })),
        features: ['商品同步', '订单同步', '库存读取', '人工批准后写入'],
        apiVersion: 'Seller API',
        quota: null,
      },
      {
        id: 'TEMU',
        name: 'TEMU',
        logo: 'T',
        color: 'bg-orange-500',
        status: platformStatus(temuChannels),
        stores: temuChannels.map((channel) => ({
          name: channel.externalShopId || 'TEMU 店铺',
          storeId: channel.id,
          connected: channel.syncStatus !== 'DISCONNECTED',
          products: null,
          orders: null,
          lastSync: formatDate(channel.lastSyncedAt),
          apiStatus: channel.syncStatus === 'FAILED' ? 'error' : 'warning',
          warning: 'TEMU 真实后端能力尚未完成验收。',
        })),
        features: ['等待真实授权客户端', '等待商品同步', '等待订单同步'],
        apiVersion: '待接入',
        quota: null,
      },
    ];
  }, [channels, orderTotals, ozonProductTotal]);

  const connected = channels.filter(
    (channel) => channel.syncStatus !== 'DISCONNECTED' && channel.syncStatus !== 'FAILED',
  );
  const stats = [
    { label: '已连接平台', value: String(new Set(connected.map((channel) => channel.provider)).size), icon: Wifi, color: 'text-green-600' },
    { label: '已连接店铺', value: String(connected.length), icon: CheckCircle2, color: 'text-blue-600' },
    { label: '同步成功通道', value: String(channels.filter((channel) => channel.syncStatus === 'SUCCESS').length), icon: RefreshCw, color: 'text-purple-600' },
    { label: 'API 健康度', value: connected.length ? `${Math.round(connected.filter((channel) => channel.syncStatus === 'SUCCESS').length / connected.length * 100)}%` : '未连接', icon: Sparkles, color: 'text-green-600' },
  ];

  return (
    <>
      <PlatformConnection
        platforms={platforms}
        stats={stats}
        loading={loading}
        syncingStoreId={syncingStoreId}
        onConnectPlatform={() => setConnectionOpen(true)}
        onSyncStore={(platformId, storeId) => void handleSyncStore(platformId, storeId)}
        onDiagnoseStore={(platformId, storeId) => void handleDiagnoseStore(platformId, storeId)}
        onOpenDocs={(platformId) => {
          const url = platformId === 'OZON'
            ? 'https://docs.ozon.ru/api/seller/'
            : 'https://seller.temu.com/';
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
      />

      <Modal open={connectionOpen} onClose={() => !connecting && setConnectionOpen(false)} title="连接 Ozon 店铺" width="max-w-xl">
        <form onSubmit={(event) => void handleConnectOzon(event)} className="space-y-4">
          <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            这里只连接 Ozon Seller API。密钥仅提交给本地后端验证，页面不会回显完整密钥。
          </p>
          <label className="block text-sm text-gray-700">
            Client ID
            <input required autoComplete="off" value={connectionDraft.clientId} onChange={(event) => setConnectionDraft((current) => ({ ...current, clientId: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-700">
            API Key
            <input required type="password" autoComplete="new-password" value={connectionDraft.apiKey} onChange={(event) => setConnectionDraft((current) => ({ ...current, apiKey: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-700">
            店铺名称或外部 ID（可选）
            <input value={connectionDraft.externalShopId} onChange={(event) => setConnectionDraft((current) => ({ ...current, externalShopId: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={connecting} onClick={() => setConnectionOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">取消</button>
            <button type="submit" disabled={connecting || !connectionDraft.clientId.trim() || !connectionDraft.apiKey.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{connecting ? '验证并连接中' : '验证并连接'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={diagnosticLoading || Boolean(diagnostic)}
        onClose={() => {
          setDiagnostic(null);
          setDiagnosticLoading(false);
        }}
        title="Ozon 连接诊断"
        width="max-w-3xl"
      >
        {diagnosticLoading && !diagnostic ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500"><RefreshCw className="h-4 w-4 animate-spin" />正在执行只读诊断...</div>
        ) : diagnostic ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="font-medium text-gray-950">总体状态：{diagnostic.overallStatus === 'ok' ? '正常' : diagnostic.overallStatus === 'warning' ? '有警告' : '失败'}</p>
              <p className="mt-1 text-gray-600">检查时间：{formatDate(diagnostic.checkedAt)}</p>
            </div>
            <div className="space-y-2">
              {diagnostic.probes.map((probe) => (
                <div key={probe.key} className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 text-sm">
                  <div><p className="font-medium text-gray-950">{probe.label}</p><p className="mt-1 leading-5 text-gray-600">{probe.message}</p></div>
                  <span className={probe.status === 'ok' ? 'text-green-700' : probe.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>{probe.status === 'ok' ? '正常' : probe.status === 'failed' ? '失败' : probe.status === 'skipped' ? '未执行' : '警告'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
