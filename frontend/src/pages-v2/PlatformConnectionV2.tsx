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
  if (!value) return 'textsync';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'textnonetext'
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
        addToast('platformconnectiontextread，english_textproducttextorderstextreadfailed。failedenglish_text“textread”。', 'error');
      }
    } catch (error) {
      setChannels([]);
      setOzonProductTotal(null);
      setOrderTotals({});
      addToast(error instanceof Error ? error.message : 'platformconnectionreadfailed', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSyncStore = useCallback(async (platformId: string, storeId: string) => {
    if (platformId !== 'OZON') {
      addToast('TEMU realsynccustomerenglish_text，english_textsync。', 'error');
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
        throw reason instanceof Error ? reason : new Error('Ozon producttextorderssynctextfailed');
      }
      addToast(
        succeeded === 2
          ? 'Ozon producttextorderssynccompleted，english_textrealtext。'
          : 'Ozon english_textsyncsuccess，failedenglish_textsuccess。',
        succeeded === 2 ? 'success' : 'error',
      );
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon syncfailed', 'error');
    } finally {
      setSyncingStoreId(null);
    }
  }, [addToast, load]);

  const handleDiagnoseStore = useCallback(async (platformId: string, storeId: string) => {
    if (platformId !== 'OZON') {
      addToast('TEMU realtextAPIenglish_text。', 'error');
      return;
    }
    setDiagnostic(null);
    setDiagnosticLoading(true);
    try {
      setDiagnostic(await channelsApi.diagnoseOzon(storeId));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon connectiontextfailed', 'error');
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
      if (!workspace) throw new Error('english_textyesenglish_text，nonetextconnection Ozon。');
      const result = await channelsApi.connectOzon({
        workspaceId: workspace.id,
        clientId: connectionDraft.clientId.trim(),
        apiKey: connectionDraft.apiKey.trim(),
        ...(connectionDraft.externalShopId.trim()
          ? { externalShopId: connectionDraft.externalShopId.trim() }
          : {}),
      });
      if (!result.verification.ok) throw new Error('Ozon credentialenglish_textpassed。');
      setConnectionOpen(false);
      setConnectionDraft(EMPTY_CONNECTION_DRAFT);
      addToast('Ozon credentialtextpassed，connectionenglish_text。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Ozon connectionfailed', 'error');
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
          name: channel.externalShopId || 'Ozon store',
          storeId: channel.id,
          connected: channel.syncStatus !== 'DISCONNECTED',
          products: hasSingleOzonStore ? ozonProductTotal : null,
          orders: orderTotals[channel.id] ?? null,
          countScope: hasSingleOzonStore
            ? 'productenglish_text Ozon storetextrealproducttext；ordersenglish_textconnectiontext。'
            : 'textstoreenglish_textproducttextstoretextfields，english_text。',
          lastSync: formatDate(channel.lastSyncedAt),
          apiStatus: channel.syncStatus === 'FAILED'
            ? 'error'
            : channel.syncStatus === 'SUCCESS'
              ? 'healthy'
              : 'warning',
          warning: channel.syncStatus === 'FAILED' ? 'textsyncfailed，english_textconnectiontext。' : undefined,
        })),
        features: ['productsync', 'orderssync', 'textread', 'humanenglish_textwrite'],
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
          name: channel.externalShopId || 'TEMU store',
          storeId: channel.id,
          connected: channel.syncStatus !== 'DISCONNECTED',
          products: null,
          orders: null,
          lastSync: formatDate(channel.lastSyncedAt),
          apiStatus: channel.syncStatus === 'FAILED' ? 'error' : 'warning',
          warning: 'TEMU realbackendenglish_textcompletedacceptance。',
        })),
        features: ['textrealtextcustomertext', 'textproductsync', 'textorderssync'],
        apiVersion: 'english_text',
        quota: null,
      },
    ];
  }, [channels, orderTotals, ozonProductTotal]);

  const connected = channels.filter(
    (channel) => channel.syncStatus !== 'DISCONNECTED' && channel.syncStatus !== 'FAILED',
  );
  const stats = [
    { label: 'textconnectionplatform', value: String(new Set(connected.map((channel) => channel.provider)).size), icon: Wifi, color: 'text-green-600' },
    { label: 'textconnectionstore', value: String(connected.length), icon: CheckCircle2, color: 'text-blue-600' },
    { label: 'syncsuccesstext', value: String(channels.filter((channel) => channel.syncStatus === 'SUCCESS').length), icon: RefreshCw, color: 'text-purple-600' },
    { label: 'API english_text', value: connected.length ? `${Math.round(connected.filter((channel) => channel.syncStatus === 'SUCCESS').length / connected.length * 100)}%` : 'textconnection', icon: Sparkles, color: 'text-green-600' },
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

      <Modal open={connectionOpen} onClose={() => !connecting && setConnectionOpen(false)} title="connection Ozon store" width="max-w-xl">
        <form onSubmit={(event) => void handleConnectOzon(event)} className="space-y-4">
          <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            english_textconnection Ozon Seller API。secretenglish_textlocalbackendtext，english_textsecret。
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
            storeenglish_text ID（text）
            <input value={connectionDraft.externalShopId} onChange={(event) => setConnectionDraft((current) => ({ ...current, externalShopId: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={connecting} onClick={() => setConnectionOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">text</button>
            <button type="submit" disabled={connecting || !connectionDraft.clientId.trim() || !connectionDraft.apiKey.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{connecting ? 'english_textconnectiontext' : 'english_textconnection'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={diagnosticLoading || Boolean(diagnostic)}
        onClose={() => {
          setDiagnostic(null);
          setDiagnosticLoading(false);
        }}
        title="Ozon connectiontext"
        width="max-w-3xl"
      >
        {diagnosticLoading && !diagnostic ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500"><RefreshCw className="h-4 w-4 animate-spin" />english_text...</div>
        ) : diagnostic ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="font-medium text-gray-950">textstatus：{diagnostic.overallStatus === 'ok' ? 'text' : diagnostic.overallStatus === 'warning' ? 'yestext' : 'failed'}</p>
              <p className="mt-1 text-gray-600">english_text：{formatDate(diagnostic.checkedAt)}</p>
            </div>
            <div className="space-y-2">
              {diagnostic.probes.map((probe) => (
                <div key={probe.key} className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 text-sm">
                  <div><p className="font-medium text-gray-950">{probe.label}</p><p className="mt-1 leading-5 text-gray-600">{probe.message}</p></div>
                  <span className={probe.status === 'ok' ? 'text-green-700' : probe.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>{probe.status === 'ok' ? 'text' : probe.status === 'failed' ? 'failed' : probe.status === 'skipped' ? 'english_text' : 'text'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
