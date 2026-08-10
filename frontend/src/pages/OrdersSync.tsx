import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import {
  channelsApi,
  type ChannelConnection,
  type MarketplaceOrder,
  type OzonDiagnosticProbe,
  type OzonDiagnosticsResponse,
  type OzonRfbsReturnDetailResponse,
  type OzonRfbsReturnListItem,
  type OzonSyncLog,
} from "../api/channels";
import { useToast } from "../components/ui/use-toast.ts";
import MarketplaceSwitcher from "../components/platform/MarketplaceSwitcher";
import { notifyDataUpdated, useAutoRefresh } from "../hooks/useAutoRefresh";
import { useMarketplaceProvider } from "../hooks/useMarketplaceProvider";
import {
  activeChannelForProvider,
  canUseMarketplaceBackend,
  channelsForProvider,
  marketplaceConfig,
  type MarketplaceProvider,
} from "../lib/marketplaces";

const EMPTY_MARKETPLACE_COUNTS: Record<MarketplaceProvider, number> = {
  OZON: 0,
  TEMU: 0,
};

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(
  value: number | string | null | undefined,
  currency?: string,
): string {
  const amount = numberValue(value);
  return `${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function latestSyncedAt(channels: ChannelConnection[]): string {
  const dates = channels
    .map((channel) => channel.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] ? formatDate(dates[0].toISOString()) : "-";
}

function orderSyncedAt(order: MarketplaceOrder): string {
  const rawSyncedAt = order.raw?.syncedAt;
  return formatDate(
    typeof rawSyncedAt === "string" ? rawSyncedAt : order.updatedAt,
  );
}

function probeStatusClass(status: OzonDiagnosticProbe["status"]): string {
  if (status === "ok") return "bg-[#EEFDF6] text-[#0F8A55]";
  if (status === "failed") return "bg-[#FFF5F5] text-[#B42318]";
  if (status === "skipped") return "bg-[#F8F9FF] text-[#6B7280]";
  return "bg-[#FFF8E8] text-[#8A5B00]";
}

function probeStatusLabel(status: OzonDiagnosticProbe["status"]): string {
  if (status === "ok") return "text";
  if (status === "failed") return "failed";
  if (status === "skipped") return "text";
  return "text";
}

function probeStatusIcon(status: OzonDiagnosticProbe["status"]) {
  if (status === "ok") return CheckCircle2;
  if (status === "failed") return XCircle;
  if (status === "skipped") return Clock3;
  return AlertTriangle;
}

function logStatusClass(status: string): string {
  if (status === "success") return "bg-[#EEFDF6] text-[#0F8A55]";
  if (status === "failed") return "bg-[#FFF5F5] text-[#B42318]";
  return "bg-[#F8F9FF] text-[#4A5578]";
}

function logSyncTypeLabel(syncType: string): string {
  if (syncType === "orders") return "orders";
  if (syncType === "product_catalog") return "product";
  return syncType;
}

export default function OrdersSync() {
  const { addToast } = useToast();
  const { activeProvider, activeMarketplace, setActiveProvider } =
    useMarketplaceProvider();
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [orderCounts, setOrderCounts] = useState<
    Record<MarketplaceProvider, number>
  >(EMPTY_MARKETPLACE_COUNTS);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<OzonDiagnosticsResponse | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [rfbsReturns, setRfbsReturns] = useState<OzonRfbsReturnListItem[]>([]);
  const [rfbsLoading, setRfbsLoading] = useState(false);
  const [rfbsError, setRfbsError] = useState<string | null>(null);
  const [selectedRfbsReturn, setSelectedRfbsReturn] = useState<
    OzonRfbsReturnDetailResponse["item"] | null
  >(null);
  const [rfbsDetailLoading, setRfbsDetailLoading] = useState(false);
  const [confirmFullRefund, setConfirmFullRefund] = useState(false);
  const [returnForBackWay, setReturnForBackWay] = useState("0");
  const [refundRequesting, setRefundRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diagnosedChannelIdRef = useRef<string | null>(null);

  const activeChannels = useMemo(
    () => channelsForProvider(channels, activeProvider),
    [activeProvider, channels],
  );
  const activeChannel = useMemo(
    () => activeChannelForProvider(channels, activeProvider),
    [activeProvider, channels],
  );
  const activeChannelId = activeChannel?.id ?? null;
  const canSyncActiveProvider = canUseMarketplaceBackend(activeProvider);
  const visibleRevenue = useMemo(
    () =>
      orders.reduce((sum, order) => sum + numberValue(order.totalAmount), 0),
    [orders],
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const [channelRes, ozonOrderCountRes, activeOrderRes] =
          await Promise.all([
            channelsApi.list({ limit: 100 }),
            channelsApi.listOrders({ limit: 1, provider: "OZON" }),
            activeProvider === "OZON"
              ? channelsApi.listOrders({
                  limit: 50,
                  provider: "OZON",
                  search: search.trim() || undefined,
                })
              : channelsApi.listOrders({
                  limit: 50,
                  search: search.trim() || undefined,
                }),
          ]);
        const activeItems =
          activeProvider === "OZON"
            ? (activeOrderRes.items ?? [])
            : (activeOrderRes.items ?? []).filter(
                (order) => order.provider === activeProvider,
              );
        setChannels(channelRes.items ?? []);
        setOrders(activeItems);
        setTotal(
          activeProvider === "OZON"
            ? (activeOrderRes.total ?? 0)
            : activeItems.length,
        );
        setOrderCounts({
          OZON: ozonOrderCountRes.total ?? 0,
          TEMU: activeProvider === "TEMU" ? activeItems.length : 0,
        });
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "orderssyncdatatextfailed";
        if (!silent) {
          setError(message);
          addToast(message, "error");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeProvider, addToast, search],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadRfbsReturns = useCallback(
    async (channelId: string, silent = false) => {
      if (!silent) setRfbsLoading(true);
      try {
        const result = await channelsApi.listOzonRfbsReturns(channelId, {
          limit: 30,
        });
        setRfbsReturns(result.items ?? []);
        setRfbsError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Ozon rFBS textreadfailed";
        setRfbsError(message);
        if (!silent) addToast(message, "error");
      } finally {
        if (!silent) setRfbsLoading(false);
      }
    },
    [addToast],
  );

  useEffect(() => {
    if (activeProvider !== "OZON" || !activeChannelId) {
      setRfbsReturns([]);
      setRfbsError(null);
      return;
    }
    void loadRfbsReturns(activeChannelId);
  }, [activeChannelId, activeProvider, loadRfbsReturns]);

  const refreshOrdersSilently = useCallback(async () => {
    await Promise.all([
      loadData(true),
      activeProvider === "OZON" && activeChannelId
        ? loadRfbsReturns(activeChannelId, true)
        : Promise.resolve(),
    ]);
  }, [activeChannelId, activeProvider, loadData, loadRfbsReturns]);
  useAutoRefresh(refreshOrdersSilently, 8000);

  const runDiagnostics = useCallback(
    async (channelId: string, silent = false) => {
      if (!silent) {
        setDiagnosticsLoading(true);
        setDiagnosticsError(null);
      }
      try {
        const result = await channelsApi.diagnoseOzon(channelId);
        setDiagnostics(result);
        setDiagnosticsError(null);
        if (!silent) {
          addToast(
            "Ozon APIenglish_textcompleted。",
            result.overallStatus === "ok" ? "success" : "warning",
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Ozon APItextfailed";
        setDiagnosticsError(message);
        if (!silent) addToast(message, "error");
      } finally {
        if (!silent) setDiagnosticsLoading(false);
      }
    },
    [addToast],
  );

  useEffect(() => {
    if (activeProvider !== "OZON" || !activeChannelId) {
      setDiagnostics(null);
      setDiagnosticsError(null);
      diagnosedChannelIdRef.current = null;
      return;
    }
    if (diagnosedChannelIdRef.current === activeChannelId) return;
    diagnosedChannelIdRef.current = activeChannelId;
    void runDiagnostics(activeChannelId, true);
  }, [activeChannelId, activeProvider, runDiagnostics]);

  const syncOrders = async () => {
    if (activeProvider !== "OZON") {
      addToast("TEMU orderssyncbackendenglish_text，english_textsync。", "error");
      return;
    }
    if (!activeChannel) {
      addToast("textyesenglish_text Ozon text，english_textsyncorders。", "error");
      return;
    }
    setSyncingId(activeChannel.id);
    try {
      const result = await channelsApi.syncOrders(activeChannel.id, {
        limit: 100,
      });
      const warningText =
        result.warnings.length > 0
          ? `；english_text：${result.warnings.map((item) => `${item.fulfillmentType} ${item.message}`).join("；")}`
          : "";
      addToast(
        `Ozon orderssynccompleted：read ${result.fetched} text，write/text ${result.synced} text，text/text ${result.changed ?? result.synced} text${warningText}`,
        result.warnings.length > 0 ? "warning" : "success",
      );
      await loadData(true);
      notifyDataUpdated({
        source: "ozon-order-sync",
        channelId: result.channelId,
        fetched: result.fetched,
        synced: result.synced,
      });
      void runDiagnostics(activeChannel.id, true);
    } catch (err) {
      addToast(
        err instanceof Error
          ? `Ozon orderssyncfailed：${err.message}`
          : "Ozon orderssyncfailed。",
        "error",
      );
    } finally {
      setSyncingId(null);
    }
  };

  const previewRfbsReturn = async (item: OzonRfbsReturnListItem) => {
    if (!activeChannel) return;
    setRfbsDetailLoading(true);
    setConfirmFullRefund(false);
    setReturnForBackWay("0");
    try {
      const result = await channelsApi.getOzonRfbsReturn(
        activeChannel.id,
        item.returnId,
      );
      setSelectedRfbsReturn(result.item);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Ozon rFBS english_textreadfailed",
        "error",
      );
    } finally {
      setRfbsDetailLoading(false);
    }
  };

  const requestRfbsRefund = async () => {
    if (!activeChannel || !selectedRfbsReturn) return;
    if (!selectedRfbsReturn.fullRefundAvailable || !confirmFullRefund) {
      addToast(
        "english_text Ozon english_text，english_text。",
        "error",
      );
      return;
    }
    const returnCost = Number(returnForBackWay);
    if (!Number.isFinite(returnCost) || returnCost < 0) {
      addToast("english_textyesenglish_text 0 english_text。", "error");
      return;
    }
    setRefundRequesting(true);
    try {
      const result = await channelsApi.requestOzonRfbsRefund(
        activeChannel.id,
        selectedRfbsReturn.returnId,
        { confirmFullRefund: true, returnForBackWay: returnCost },
      );
      addToast(
        `approvaltext ${result.notificationId} english_textnotificationtext；english_textwrite Ozon。`,
        "success",
      );
      setSelectedRfbsReturn(null);
      setConfirmFullRefund(false);
      await loadRfbsReturns(activeChannel.id, true);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "textapprovalenglish_textfailed",
        "error",
      );
    } finally {
      setRefundRequesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">orderssync</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            english_text {activeMarketplace.label}{" "}
            orders；textyesrealenglish_textbackendsyncenglish_textgenerationexampleorders。
          </p>
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
            onClick={() => void syncOrders()}
            disabled={
              !canSyncActiveProvider || !activeChannel || Boolean(syncingId)
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#005BFF] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncingId ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Database size={14} />
            )}
            sync {activeMarketplace.label} orders
          </button>
          <button
            onClick={() =>
              activeChannel && void runDiagnostics(activeChannel.id)
            }
            disabled={
              activeProvider !== "OZON" || !activeChannel || diagnosticsLoading
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {diagnosticsLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileText size={14} />
            )}
            english_text
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
        orderCounts={orderCounts}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            label: `${activeMarketplace.label} text`,
            value: activeChannels.length,
            note: activeChannel ? "english_text" : "english_text",
            icon: Database,
          },
          {
            label: "orderstext",
            value: total,
            note: "text /channels/orders",
            icon: ShoppingCart,
          },
          {
            label: "english_text",
            value: formatMoney(visibleRevenue, orders[0]?.currency ?? "RUB"),
            note: "english_text",
            icon: PackageCheck,
          },
          {
            label: "textsync",
            value: latestSyncedAt(activeChannels),
            note: "text lastSyncedAt",
            icon: RefreshCw,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#8B93B5]">{item.label}</p>
                  <p
                    className={`mt-1 break-words font-bold text-[#1A1A2E] ${
                      item.label === "textsync"
                        ? "text-base leading-5"
                        : "text-xl"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8F9FF] text-[#4A5578]">
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-2 text-xs text-[#8B93B5]">{item.note}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-[#EEF0FA] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1A1A2E]">
                {activeMarketplace.label} APItext
              </h3>
              <p className="mt-1 text-xs text-[#8B93B5]">
                {activeProvider === "OZON"
                  ? "english_textcredential、producttext、FBS orders、FBO orders；english_textwrite Ozon store。"
                  : "TEMU english_textbackendtextcustomertext access_token textcompletedenglish_textrealtext。"}
              </p>
            </div>
            <span
              className={`inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium ${
                diagnostics?.overallStatus === "ok"
                  ? "bg-[#EEFDF6] text-[#0F8A55]"
                  : diagnostics?.overallStatus === "failed"
                    ? "bg-[#FFF5F5] text-[#B42318]"
                    : "bg-[#FFF8E8] text-[#8A5B00]"
              }`}
            >
              {diagnostics
                ? diagnostics.overallStatus === "ok"
                  ? "allenglish_text"
                  : diagnostics.overallStatus === "failed"
                    ? "credentialfailed"
                    : "english_text"
                : activeChannel
                  ? "english_text"
                  : "english_text"}
            </span>
          </div>

          {diagnosticsError ? (
            <div className="border-b border-[#EEF0FA] bg-[#FFF5F5] px-4 py-2 text-xs text-[#B42318]">
              {diagnosticsError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            {activeProvider !== "OZON" ? (
              <div className="col-span-full rounded-lg border border-[#FFE1B8] bg-[#FFF8E8] p-4 text-xs leading-6 text-[#8A5B00]">
                <p className="font-semibold text-[#1A1A2E]">
                  TEMU APIenglish_text
                </p>
                <ul className="mt-2 space-y-1">
                  {marketplaceConfig.TEMU.requirements.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  backendenglish_text，english_text，english_text Ozon APItext TEMU。
                </p>
              </div>
            ) : activeChannel && !diagnostics ? (
              <div className="col-span-full py-6 text-center text-xs text-[#8B93B5]">
                {diagnosticsLoading
                  ? "english_text Ozon APItext..."
                  : "textnoneenglish_text，english_text“english_text”。"}
              </div>
            ) : !activeChannel ? (
              <div className="col-span-full py-6 text-center text-xs text-[#8B93B5]">
                english_text Ozon Seller API，english_textrealAPItext。
              </div>
            ) : (
              diagnostics?.probes.map((probe) => {
                const StatusIcon = probeStatusIcon(probe.status);
                return (
                  <div
                    key={probe.key}
                    className="rounded-lg border border-[#EEF0FA] bg-[#FAFBFF] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#1A1A2E]">
                            {probe.label}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${probeStatusClass(probe.status)}`}
                          >
                            <StatusIcon size={12} />
                            {probeStatusLabel(probe.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                          {probe.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-[#8B93B5]">
                        <div>read</div>
                        <div className="mt-1 font-semibold text-[#1A1A2E]">
                          {probe.fetched ?? probe.sampleCount ?? "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
          <div className="border-b border-[#EEF0FA] p-4">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">
              textsynctext
            </h3>
            <p className="mt-1 text-xs text-[#8B93B5]">
              textbackendrealnotificationtext，english_text。
            </p>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-4">
            {diagnostics?.syncLogs.length ? (
              <div className="space-y-3">
                {diagnostics.syncLogs.map((log: OzonSyncLog) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-[#EEF0FA] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-[#F8F9FF] px-1.5 py-0.5 text-[11px] font-medium text-[#4A5578]">
                            {logSyncTypeLabel(log.syncType)}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${logStatusClass(log.status)}`}
                          >
                            {log.status === "success"
                              ? "success"
                              : log.status === "failed"
                                ? "failed"
                                : log.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-[#1A1A2E]">
                          {log.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                          {log.status === "success"
                            ? `read ${log.fetched ?? 0} text，write/text ${log.synced ?? 0} text，text/text ${log.changed ?? 0} text。`
                            : (log.error ?? log.body ?? "backendenglish_texterrortext。")}
                        </p>
                        {log.warnings.length > 0 ? (
                          <p className="mt-1 text-xs text-[#8A5B00]">
                            {log.warnings
                              .map(
                                (warning) =>
                                  `${warning.fulfillmentType} ${warning.message}`,
                              )
                              .join("；")}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-right text-[11px] text-[#8B93B5]">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#8B93B5]">
                {activeProvider === "OZON"
                  ? activeChannel
                    ? "textnonesynctext。syncyestext、text、english_textfailedenglish_textwritetext。"
                    : "english_text Ozon text。"
                  : "TEMU backendsynctaskenglish_text，textnonerealsynctext。"}
              </div>
            )}
          </div>
        </div>
      </div>

      {activeProvider === "OZON" ? (
        <section className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#EEF0FA] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">
                  Ozon rFBS english_textreview
                </h3>
                <span className="rounded-md bg-[#FFF8E8] px-2 py-1 text-[11px] font-medium text-[#8A5B00]">
                  textrisktext
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#8B93B5]">
                english_text Ozon
                english_textAPI。english_textapprovaltext，notificationenglish_text
                Ozon，english_textsuccess。
              </p>
            </div>
            <button
              onClick={() =>
                activeChannel && void loadRfbsReturns(activeChannel.id)
              }
              disabled={!activeChannel || rfbsLoading}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rfbsLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              english_text
            </button>
          </div>

          {rfbsError ? (
            <div className="border-b border-[#EEF0FA] bg-[#FFF5F5] px-4 py-3 text-xs text-[#B42318]">
              {rfbsError}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                  <th className="px-4 py-3 font-medium">textSKU</th>
                  <th className="px-4 py-3 font-medium">Posting</th>
                  <th className="px-4 py-3 font-medium">product</th>
                  <th className="px-4 py-3 font-medium">status</th>
                  <th className="px-4 py-3 text-right font-medium">producttext</th>
                  <th className="px-4 py-3 text-right font-medium">english_text</th>
                  <th className="px-4 py-3 text-right font-medium">text</th>
                </tr>
              </thead>
              <tbody>
                {rfbsLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-xs text-[#8B93B5]"
                    >
                      textread Ozon rFBS text...
                    </td>
                  </tr>
                ) : rfbsReturns.length > 0 ? (
                  rfbsReturns.map((item) => (
                    <tr
                      key={item.returnId}
                      className="border-b border-[#F0F0F8] last:border-0"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">
                        {item.returnNumber ?? item.returnId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#4A5578]">
                        {item.postingNumber ?? "-"}
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-xs text-[#1A1A2E]">
                        <p className="truncate font-medium">
                          {item.product.name ?? "Ozon english_textproducttext"}
                        </p>
                        <p className="mt-1 text-[11px] text-[#8B93B5]">
                          {item.product.offerId ??
                            (item.product.sku
                              ? `SKU ${item.product.sku}`
                              : "-")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#4A5578]">
                        {item.state.moneyReturnStateName ??
                          item.state.stateName ??
                          item.state.state ??
                          "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-[#1A1A2E]">
                        {item.product.price
                          ? formatMoney(
                              item.product.price,
                              item.product.currencyCode ?? "RUB",
                            )
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[#6B7280]">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => void previewRfbsReturn(item)}
                          disabled={rfbsDetailLoading}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1F2] px-3 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF] disabled:opacity-50"
                        >
                          <Eye size={13} />
                          textevidence
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-xs text-[#8B93B5]"
                    >
                      {activeChannel
                        ? "text Ozon storetextyestext rFBS english_text。english_textacceptance。"
                        : "english_text Ozon Seller API store。"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#EEF0FA] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A2E]">
              realorderstext
            </h3>
            <p className="mt-1 text-xs text-[#8B93B5]">
              {activeProvider === "OZON"
                ? "text Ozon FBS/FBO posting sync；rFBS english_texthumanapprovalenglish_text，english_text。"
                : "TEMU ordersenglish_text bg.order.list.v2.get text，english_textAPItext；textbackendenglish_text。"}
            </p>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B93B5]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-lg border border-[#DDE1F2] bg-white pl-8 pr-3 text-xs outline-none focus:border-[#6C63FF] md:w-72"
              placeholder="searchorderstext / posting number"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                <th className="px-4 py-3 font-medium">orderstext</th>
                <th className="px-4 py-3 font-medium">Posting</th>
                <th className="px-4 py-3 font-medium">text</th>
                <th className="px-4 py-3 font-medium">status</th>
                <th className="px-4 py-3 text-right font-medium">producttext</th>
                <th className="px-4 py-3 text-right font-medium">text</th>
                <th className="px-4 py-3 text-right font-medium">english_text</th>
                <th className="px-4 py-3 text-right font-medium">synctext</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-xs text-[#8B93B5]"
                  >
                    textreadrealorders...
                  </td>
                </tr>
              ) : orders.length > 0 ? (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-[#F0F0F8] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">
                      {order.externalOrderId ?? "backendenglish_text"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#4A5578]">
                      {order.externalPostingNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4A5578]">
                      {order.fulfillmentType ?? "backendenglish_text"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[#F8F9FF] px-2 py-1 text-[11px] font-medium text-[#4A5578]">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[#1A1A2E]">
                      {order.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-[#1A1A2E]">
                      {formatMoney(order.totalAmount, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[#6B7280]">
                      {formatDate(order.orderedAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[#6B7280]">
                      {orderSyncedAt(order)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-xs text-[#8B93B5]"
                  >
                    {activeChannel
                      ? `textnonereal ${activeMarketplace.label} orders。english_textyestextorders。`
                      : marketplaceConfig[activeProvider].emptyState}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRfbsReturn ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#EEF0FA] p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[#1A1A2E]">
                    rFBS textevidencetext
                  </h3>
                  <span className="rounded-md bg-[#FFF5F5] px-2 py-1 text-[11px] font-semibold text-[#B42318]">
                    english_text
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8B93B5]">
                  english_text Ozon Seller API。
                </p>
              </div>
              <button
                onClick={() => setSelectedRfbsReturn(null)}
                aria-label="english_textevidencetext"
                className="rounded-lg p-1.5 text-[#8B93B5] hover:bg-[#F8F9FF]"
              >
                <XCircle size={19} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[
                  ["text ID", String(selectedRfbsReturn.returnId)],
                  ["textSKU", selectedRfbsReturn.returnNumber ?? "-"],
                  ["Posting", selectedRfbsReturn.postingNumber ?? "-"],
                  [
                    "status",
                    selectedRfbsReturn.state.moneyReturnStateName ??
                      selectedRfbsReturn.state.stateName ??
                      selectedRfbsReturn.state.state ??
                      "-",
                  ],
                  ["product", selectedRfbsReturn.product.name ?? "-"],
                  [
                    "producttext",
                    selectedRfbsReturn.product.price
                      ? formatMoney(
                          selectedRfbsReturn.product.price,
                          selectedRfbsReturn.product.currencyCode ?? "RUB",
                        )
                      : "-",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-[#F8F9FF] px-3 py-2.5"
                  >
                    <dt className="text-[11px] text-[#8B93B5]">{label}</dt>
                    <dd className="mt-1 break-words font-medium text-[#1A1A2E]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="text-xs font-semibold text-[#1A1A2E]">
                  Ozon english_text
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRfbsReturn.availableActions.length > 0 ? (
                    selectedRfbsReturn.availableActions.map((action) => (
                      <span
                        key={action.id}
                        className="rounded-md border border-[#DDE1F2] bg-white px-2 py-1 text-xs text-[#4A5578]"
                      >
                        {action.name} · ID {action.id}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[#B42318]">
                      Ozon english_textyesenglish_text。
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[#FFD6D6] bg-[#FFF5F5] p-4">
                <div className="flex items-start gap-2">
                  <ShieldAlert
                    size={18}
                    className="mt-0.5 shrink-0 text-[#B42318]"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#B42318]">
                      textyesenglish_text
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#7A271A]">
                      english_textapprovaltext，english_text。notificationenglish_text“text”text，backendenglish_text
                      Ozon；english_textfailed。
                    </p>
                  </div>
                </div>
              </div>

              <label className="block text-xs font-medium text-[#4A5578]">
                Ozon return_for_back_way（RUB）
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={returnForBackWay}
                  onChange={(event) => setReturnForBackWay(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm outline-none focus:border-[#6C63FF]"
                />
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#DDE1F2] p-3 text-xs leading-5 text-[#4A5578]">
                <input
                  type="checkbox"
                  checked={confirmFullRefund}
                  onChange={(event) =>
                    setConfirmFullRefund(event.target.checked)
                  }
                  disabled={!selectedRfbsReturn.fullRefundAvailable}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  english_textyes rFBS
                  english_text，english_texthumanreviewtask，english_textsuccess。
                </span>
              </label>

              {!selectedRfbsReturn.fullRefundAvailable ? (
                <p className="text-xs font-medium text-[#B42318]">
                  Ozon english_textyesenglish_text，english_textapprovaltext。
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#EEF0FA] p-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setSelectedRfbsReturn(null)}
                className="h-10 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
              >
                text
              </button>
              <button
                onClick={() => void requestRfbsRefund()}
                disabled={
                  refundRequesting ||
                  !selectedRfbsReturn.fullRefundAvailable ||
                  !confirmFullRefund
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B42318] px-4 text-sm font-semibold text-white hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refundRequesting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ShieldAlert size={15} />
                )}
                texthumanreview
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
