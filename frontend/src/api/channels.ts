import { api } from "./client";

export type ChannelProvider =
  | "AMAZON_US"
  | "AMAZON_EU"
  | "AMAZON_JP"
  | "AMAZON_AU"
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "OZON"
  | "OZON_PERFORMANCE"
  | "TEMU"
  | "MANUAL";

export type ChannelSyncStatus =
  "PENDING" | "SYNCING" | "SUCCESS" | "FAILED" | "DISCONNECTED";

export interface ChannelConnection {
  id: string;
  workspaceId: string;
  provider: ChannelProvider;
  externalShopId?: string | null;
  syncStatus: ChannelSyncStatus;
  lastSyncedAt?: string | null;
  tokenExpiresAt?: string | null;
}

export interface ChannelCapability {
  key: string;
  label: string;
  status:
    | "connected"
    | "pending_credentials"
    | "human_confirmation_required"
    | "not_connected";
  mode: string;
}

export interface ChannelCapabilities {
  provider: ChannelProvider;
  channelId: string;
  connected: boolean;
  source: string;
  docs: string;
  features: ChannelCapability[];
}

export interface MarketplaceOrder {
  id: string;
  organizationId: string;
  workspaceId: string;
  channelId?: string | null;
  provider: ChannelProvider;
  fulfillmentType?: string | null;
  externalOrderId?: string | null;
  externalPostingNumber: string;
  status: string;
  orderedAt?: string | null;
  deliveredAt?: string | null;
  currency: string;
  totalAmount: number | string;
  itemCount: number;
  raw?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncOrdersResponse {
  channelId: string;
  provider: "OZON";
  fetched: number;
  synced: number;
  changed?: number;
  warnings: Array<{ fulfillmentType: "FBS" | "FBO"; message: string }>;
  items: MarketplaceOrder[];
  capabilities: ChannelCapabilities;
}

export interface OzonDiagnosticProbe {
  key: string;
  label: string;
  status: "ok" | "warning" | "failed" | "skipped";
  message: string;
  checkedAt: string;
  fetched?: number;
  total?: number;
  sampleCount?: number;
  lastId?: string;
}

export interface OzonSyncLog {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  createdAt: string;
  syncType: string;
  status: string;
  fetched?: number;
  synced?: number;
  changed?: number;
  error?: string;
  warnings: Array<{ fulfillmentType: string; message: string }>;
}

export interface OzonDiagnosticsResponse {
  channel: ChannelConnection;
  checkedAt: string;
  overallStatus: "ok" | "warning" | "failed";
  docs: string;
  probes: OzonDiagnosticProbe[];
  syncLogs: OzonSyncLog[];
  capabilities: ChannelCapabilities;
}

export interface OzonRfbsReturnAction {
  id: number;
  name: string;
}

export interface OzonRfbsReturnState {
  groupState?: string;
  state?: string;
  stateName?: string;
  moneyReturnStateName?: string;
}

export interface OzonRfbsReturnProduct {
  name?: string;
  offerId?: string;
  sku?: number;
  price?: string;
  currencyCode?: string;
}

export interface OzonRfbsReturnListItem {
  returnId: number;
  returnNumber?: string;
  postingNumber?: string;
  orderNumber?: string;
  createdAt?: string;
  product: OzonRfbsReturnProduct;
  state: OzonRfbsReturnState;
}

export interface OzonRfbsReturnListResponse {
  source: string;
  fetchedAt: string;
  channelId: string;
  items: OzonRfbsReturnListItem[];
  hasNext: boolean;
}

export interface OzonRfbsReturnDetailResponse {
  source: string;
  fetchedAt: string;
  channelId: string;
  item: OzonRfbsReturnListItem & {
    availableActions: OzonRfbsReturnAction[];
    fullRefundAvailable: boolean;
  };
}

export interface ConnectOzonResponse {
  channel: ChannelConnection;
  verification: {
    ok: boolean;
    total?: number;
    sampleCount?: number;
    lastId?: string;
  };
  credentials: {
    clientId: string;
    apiKeyMasked: string;
  };
  capabilities: ChannelCapabilities;
  initialSync:
    | {
        status: "success";
        fetched: number;
        synced: number;
      }
    | {
        status: "failed";
        fetched: 0;
        synced: 0;
        error: string;
      };
  initialOrderSync:
    | {
        status: "success";
        fetched: number;
        synced: number;
        changed?: number;
        warnings: Array<{ fulfillmentType: "FBS" | "FBO"; message: string }>;
      }
    | {
        status: "failed";
        fetched: 0;
        synced: 0;
        warnings: [];
        error: string;
      };
}

export interface OzonCustomerOverview {
  source: string;
  docs: string;
  fetchedAt: string;
  channel: ChannelConnection;
  summary: {
    chats: number;
    unreadChats: number;
    questions: number;
    unprocessedQuestions: number;
    reviews: number;
    unprocessedReviews: number;
  };
  chats: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    unreadCount: number;
    lastMessage: string;
  }>;
  questions: Array<{
    id: string;
    sku?: number;
    author: string;
    text: string;
    status: string;
    publishedAt: string;
  }>;
  reviews: Array<{
    id: string;
    sku: string;
    text: string;
    rating: number;
    status: string;
    publishedAt: string;
  }>;
  sources: Record<
    "chats" | "questions" | "reviews",
    {
      status: "connected" | "unavailable";
      subscription: string | null;
      reason?: string;
    }
  >;
}

export interface OzonChatHistory {
  source: string;
  fetchedAt: string;
  channelId: string;
  chatId: string;
  hasNext: boolean;
  messages: Array<{
    id: string;
    text: string;
    createdAt: string;
    sender: string;
    isRead: boolean;
  }>;
}

export interface OzonPerformanceOverview {
  connected: boolean;
  source: string;
  docs: string;
  fetchedAt: string;
  reason?: string;
  channel?: ChannelConnection;
  campaigns: Array<{
    id: string;
    title: string;
    state: string;
    paymentType?: string;
    budget?: number;
    dailyBudget?: number;
    weeklyBudget?: number;
  }>;
  dailyStatistics: Array<Record<string, unknown>>;
  summary: {
    campaigns: number;
    running: number;
    spend: number | null;
    orders: number | null;
    revenue: number | null;
  };
  statisticsError?: string | null;
}

export const channelsApi = {
  /** textconnectiontext */
  list: (params?: {
    page?: number;
    limit?: number;
    workspaceId?: string;
    provider?: ChannelProvider;
    syncStatus?: ChannelSyncStatus;
  }) =>
    api.get<{
      items: ChannelConnection[];
      total: number;
      page: number;
      limit: number;
    }>("/channels", { params }),

  /** english_text */
  getById: (id: string) => api.get<ChannelConnection>(`/channels/${id}`),

  /** textconnection（textreal workspace english_text token） */
  create: (data: {
    workspaceId: string;
    provider: ChannelProvider;
    externalShopId?: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    tokenExpiresAt?: string;
  }) => api.post<ChannelConnection>("/channels", data),

  /** realconnection Ozon Seller API。backendenglish_text Ozon API text Client-Id / Api-Key。 */
  connectOzon: (data: {
    workspaceId?: string;
    workspaceName?: string;
    clientId: string;
    apiKey: string;
    externalShopId?: string;
  }) => api.post<ConnectOzonResponse>("/channels/ozon/connect", data),

  customerServiceOverview: (params?: {
    workspaceId?: string;
    limit?: number;
  }) =>
    api.get<OzonCustomerOverview>("/channels/ozon/customer-service/overview", {
      params,
    }),

  customerChatHistory: (
    chatId: string,
    params: { channelId: string; limit?: number },
  ) =>
    api.get<OzonChatHistory>(
      `/channels/ozon/customer-service/chats/${encodeURIComponent(chatId)}/history`,
      { params },
    ),

  requestCustomerAction: (
    targetId: string,
    data: {
      channelId: string;
      action: "CHAT_REPLY" | "QUESTION_ANSWER" | "REVIEW_COMMENT";
      text: string;
      sku?: number;
    },
  ) =>
    api.post<{
      status: "pending_human_confirmation";
      notificationId: string;
      action: string;
      targetId: string;
    }>(
      `/channels/ozon/customer-service/targets/${encodeURIComponent(targetId)}/action-request`,
      data,
    ),

  connectOzonPerformance: (data: {
    workspaceId: string;
    clientId: string;
    clientSecret: string;
  }) => api.post("/channels/ozon-performance/connect", data),

  ozonPerformanceOverview: (params?: {
    workspaceId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    api.get<OzonPerformanceOverview>("/channels/ozon-performance/overview", {
      params,
    }),

  requestOzonCampaignAction: (
    campaignId: string,
    data: {
      channelId: string;
      action: "ACTIVATE" | "DEACTIVATE" | "UPDATE_WEEKLY_BUDGET";
      weeklyBudgetRub?: number;
    },
  ) =>
    api.post<{
      status: "pending_human_confirmation";
      notificationId: string;
      action: string;
      campaignId: string;
    }>(
      `/channels/ozon-performance/campaigns/${encodeURIComponent(campaignId)}/action-request`,
      data,
    ),

  getCapabilities: (id: string) =>
    api.get<ChannelCapabilities>(`/channels/${id}/capabilities`),

  diagnoseOzon: (id: string) =>
    api.get<OzonDiagnosticsResponse>(`/channels/${id}/diagnostics`),

  syncProducts: (id: string, data?: { limit?: number }) =>
    api.post<{
      channelId: string;
      provider: "OZON";
      fetched: number;
      synced: number;
      items: unknown[];
      capabilities: ChannelCapabilities;
    }>(`/channels/${id}/sync-products`, data ?? {}),

  listOrders: (params?: {
    page?: number;
    limit?: number;
    workspaceId?: string;
    channelId?: string;
    provider?: ChannelProvider;
    status?: string;
    search?: string;
  }) =>
    api.get<{
      items: MarketplaceOrder[];
      total: number;
      page: number;
      limit: number;
    }>("/channels/orders", { params }),

  syncOrders: (
    id: string,
    data?: { since?: string; to?: string; limit?: number },
  ) => api.post<SyncOrdersResponse>(`/channels/${id}/sync-orders`, data ?? {}),

  listOzonRfbsReturns: (
    id: string,
    params?: { limit?: number; postingNumber?: string },
  ) =>
    api.get<OzonRfbsReturnListResponse>(`/channels/${id}/rfbs-returns`, {
      params,
    }),

  getOzonRfbsReturn: (id: string, returnId: number) =>
    api.get<OzonRfbsReturnDetailResponse>(
      `/channels/${id}/rfbs-returns/${returnId}`,
    ),

  requestOzonRfbsRefund: (
    id: string,
    returnId: number,
    data: { confirmFullRefund: true; returnForBackWay?: number },
  ) =>
    api.post<{
      status: "pending_human_confirmation";
      notificationId: string;
      action: "ozon.order.refund";
      returnId: number;
      externalMutation: false;
    }>(`/channels/${id}/rfbs-returns/${returnId}/refund-request`, data),

  /** textconnection */
  disconnect: (id: string) =>
    api.post<ChannelConnection>(`/channels/${id}/disconnect`),

  /** textconnectionstatus */
  updateSyncStatus: (id: string, syncStatus: ChannelSyncStatus) =>
    api.patch<ChannelConnection>(`/channels/${id}/sync-status`, { syncStatus }),

  delete: (id: string) => api.delete<{ id: string }>(`/channels/${id}`),
};
