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
  if (status === "ok") return "正常";
  if (status === "failed") return "失败";
  if (status === "skipped") return "跳过";
  return "警告";
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
  if (syncType === "orders") return "订单";
  if (syncType === "product_catalog") return "商品";
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
          err instanceof Error ? err.message : "订单同步数据加载失败";
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
          err instanceof Error ? err.message : "Ozon rFBS 退货读取失败";
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
            "Ozon 接口诊断已完成。",
            result.overallStatus === "ok" ? "success" : "warning",
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Ozon 接口诊断失败";
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
      addToast("TEMU 订单同步后端尚未接入，已拒绝假同步。", "error");
      return;
    }
    if (!activeChannel) {
      addToast("没有已绑定的 Ozon 渠道，不能假同步订单。", "error");
      return;
    }
    setSyncingId(activeChannel.id);
    try {
      const result = await channelsApi.syncOrders(activeChannel.id, {
        limit: 100,
      });
      const warningText =
        result.warnings.length > 0
          ? `；部分链路返回警告：${result.warnings.map((item) => `${item.fulfillmentType} ${item.message}`).join("；")}`
          : "";
      addToast(
        `Ozon 订单同步完成：读取 ${result.fetched} 单，写入/更新 ${result.synced} 单，新增/变更 ${result.changed ?? result.synced} 单${warningText}`,
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
          ? `Ozon 订单同步失败：${err.message}`
          : "Ozon 订单同步失败。",
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
        err instanceof Error ? err.message : "Ozon rFBS 退货详情读取失败",
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
        "必须确认当前 Ozon 返回了全额退款动作，并明确勾选确认。",
        "error",
      );
      return;
    }
    const returnCost = Number(returnForBackWay);
    if (!Number.isFinite(returnCost) || returnCost < 0) {
      addToast("退回运费必须是大于等于 0 的数字。", "error");
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
        `审批单 ${result.notificationId} 已进入通知中心；当前尚未写入 Ozon。`,
        "success",
      );
      setSelectedRfbsReturn(null);
      setConfirmFullRefund(false);
      await loadRfbsReturns(activeChannel.id, true);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "退款审批单创建失败",
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
          <h2 className="text-xl font-bold text-[#1A1A2E]">订单同步</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            当前查看 {activeMarketplace.label}{" "}
            订单；没有真实授权和后端同步链路时不会生成示例订单。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
          >
            <RefreshCw size={14} />
            刷新
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
            同步 {activeMarketplace.label} 订单
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
            重新诊断
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
            label: `${activeMarketplace.label} 渠道`,
            value: activeChannels.length,
            note: activeChannel ? "已绑定" : "未绑定",
            icon: Database,
          },
          {
            label: "订单总数",
            value: total,
            note: "来自 /channels/orders",
            icon: ShoppingCart,
          },
          {
            label: "本页金额",
            value: formatMoney(visibleRevenue, orders[0]?.currency ?? "RUB"),
            note: "当前列表合计",
            icon: PackageCheck,
          },
          {
            label: "最近同步",
            value: latestSyncedAt(activeChannels),
            note: "渠道 lastSyncedAt",
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
                      item.label === "最近同步"
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
                {activeMarketplace.label} 接口诊断
              </h3>
              <p className="mt-1 text-xs text-[#8B93B5]">
                {activeProvider === "OZON"
                  ? "独立探测凭据、商品目录、FBS 订单、FBO 订单；这里不会写入 Ozon 店铺。"
                  : "TEMU 诊断需要后端签名客户端和 access_token 存储完成后才能真实探测。"}
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
                  ? "全部可访问"
                  : diagnostics.overallStatus === "failed"
                    ? "凭据失败"
                    : "部分异常"
                : activeChannel
                  ? "等待诊断"
                  : "未绑定"}
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
                  TEMU 接口预检清单
                </p>
                <ul className="mt-2 space-y-1">
                  {marketplaceConfig.TEMU.requirements.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  后端未实现前，诊断按钮禁用，页面不会用 Ozon 接口冒充 TEMU。
                </p>
              </div>
            ) : activeChannel && !diagnostics ? (
              <div className="col-span-full py-6 text-center text-xs text-[#8B93B5]">
                {diagnosticsLoading
                  ? "正在调用 Ozon 接口诊断..."
                  : "暂无诊断结果，请点击“重新诊断”。"}
              </div>
            ) : !activeChannel ? (
              <div className="col-span-full py-6 text-center text-xs text-[#8B93B5]">
                请先在侧边栏绑定 Ozon Seller API，系统才会诊断真实接口权限。
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
                        <div>读取</div>
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
              最近同步日志
            </h3>
            <p className="mt-1 text-xs text-[#8B93B5]">
              来自后端真实通知记录，不补假日志。
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
                              ? "成功"
                              : log.status === "failed"
                                ? "失败"
                                : log.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-[#1A1A2E]">
                          {log.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                          {log.status === "success"
                            ? `读取 ${log.fetched ?? 0} 条，写入/更新 ${log.synced ?? 0} 条，新增/变更 ${log.changed ?? 0} 条。`
                            : (log.error ?? log.body ?? "后端未返回错误详情。")}
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
                    ? "暂无同步日志。同步有新增、变更、警告或失败时才会写入日志。"
                    : "未绑定 Ozon 渠道。"
                  : "TEMU 后端同步任务未接入，暂无真实同步日志。"}
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
                  Ozon rFBS 退货与退款审核
                </h3>
                <span className="rounded-md bg-[#FFF8E8] px-2 py-1 text-[11px] font-medium text-[#8A5B00]">
                  高风险操作
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#8B93B5]">
                列表和详情来自 Ozon
                实时只读接口。全额退款只能先创建审批单，通知中心确认后才调用
                Ozon，并以回读结果判定成功。
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
              刷新退货
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
                  <th className="px-4 py-3 font-medium">退货号</th>
                  <th className="px-4 py-3 font-medium">Posting</th>
                  <th className="px-4 py-3 font-medium">商品</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 text-right font-medium">商品价</th>
                  <th className="px-4 py-3 text-right font-medium">创建时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rfbsLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-xs text-[#8B93B5]"
                    >
                      正在读取 Ozon rFBS 退货...
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
                          {item.product.name ?? "Ozon 未返回商品名"}
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
                          预览证据
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
                        ? "当前 Ozon 店铺没有返回 rFBS 退货记录。空列表不代表退款能力已执行验收。"
                        : "请先绑定 Ozon Seller API 店铺。"}
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
              真实订单列表
            </h3>
            <p className="mt-1 text-xs text-[#8B93B5]">
              {activeProvider === "OZON"
                ? "支持 Ozon FBS/FBO posting 同步；rFBS 全额退款已接入人工审批和回读验证，其他售后动作仍保持阻断。"
                : "TEMU 订单计划按 bg.order.list.v2.get 轮询，地址和金额分接口补齐；当前后端未接入。"}
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
              placeholder="搜索订单号 / posting number"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                <th className="px-4 py-3 font-medium">订单号</th>
                <th className="px-4 py-3 font-medium">Posting</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">商品数</th>
                <th className="px-4 py-3 text-right font-medium">金额</th>
                <th className="px-4 py-3 text-right font-medium">下单时间</th>
                <th className="px-4 py-3 text-right font-medium">同步时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-xs text-[#8B93B5]"
                  >
                    正在读取真实订单...
                  </td>
                </tr>
              ) : orders.length > 0 ? (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-[#F0F0F8] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">
                      {order.externalOrderId ?? "后端未返回"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#4A5578]">
                      {order.externalPostingNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4A5578]">
                      {order.fulfillmentType ?? "后端未返回"}
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
                      ? `暂无真实 ${activeMarketplace.label} 订单。已绑定渠道但当前没有落库订单。`
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
                    rFBS 退款证据预览
                  </h3>
                  <span className="rounded-md bg-[#FFF5F5] px-2 py-1 text-[11px] font-semibold text-[#B42318]">
                    全额退款
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8B93B5]">
                  详情和可用动作来自刚刚回读的 Ozon Seller API。
                </p>
              </div>
              <button
                onClick={() => setSelectedRfbsReturn(null)}
                aria-label="关闭退款证据预览"
                className="rounded-lg p-1.5 text-[#8B93B5] hover:bg-[#F8F9FF]"
              >
                <XCircle size={19} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[
                  ["退货 ID", String(selectedRfbsReturn.returnId)],
                  ["退货号", selectedRfbsReturn.returnNumber ?? "-"],
                  ["Posting", selectedRfbsReturn.postingNumber ?? "-"],
                  [
                    "状态",
                    selectedRfbsReturn.state.moneyReturnStateName ??
                      selectedRfbsReturn.state.stateName ??
                      selectedRfbsReturn.state.state ??
                      "-",
                  ],
                  ["商品", selectedRfbsReturn.product.name ?? "-"],
                  [
                    "商品价格",
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
                  Ozon 当前可用动作
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
                      Ozon 当前没有返回可执行动作。
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
                      这是不可随意撤销的外部资金动作
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#7A271A]">
                      本页只创建审批单，不会直接退款。通知中心再次选择“执行”后，后端才调用
                      Ozon；回读不一致时必须显示失败。
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
                  我确认这是 rFBS
                  全额退款申请，并理解当前只会创建人工审核任务，不代表退款已经成功。
                </span>
              </label>

              {!selectedRfbsReturn.fullRefundAvailable ? (
                <p className="text-xs font-medium text-[#B42318]">
                  Ozon 当前没有唯一的全额退款动作，系统已阻止创建审批单。
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#EEF0FA] p-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setSelectedRfbsReturn(null)}
                className="h-10 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
              >
                取消
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
                提交人工审核
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
