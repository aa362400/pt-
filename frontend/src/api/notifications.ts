import { api, tokenStore } from "./client";

export interface Notification {
  id: string;
  type:
    | "SYSTEM"
    | "ALERT"
    | "REPORT_READY"
    | "MENTION"
    | "TASK_ASSIGNED"
    | "APPROVAL_REQUIRED"
    | "MILESTONE";
  title: string;
  body?: string | null;
  isRead: boolean;
  readAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationDecisionResponse {
  status:
    | "executed"
    | "dismissed"
    | "approved_pending_external_adapter"
    | "external_execution_failed";
  notification: Notification;
  unreadCount: number;
  result?: unknown;
  actionProposal?: {
    id: string;
    payloadHash: string;
    status: "APPROVED" | "EXECUTED" | "DISMISSED" | "FAILED";
  } | null;
}

interface BackendNotification {
  id: string;
  type: Notification["type"];
  title: string;
  body?: string | null;
  readAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

function mapNotification(item: BackendNotification): Notification {
  return {
    ...item,
    isRead: Boolean(item.readAt),
  };
}

export type NotificationStreamEvent =
  | { type: "notification.created"; notification: Notification }
  | { type: "notification.updated"; notification: Notification }
  | { type: "notification.deleted"; id: string }
  | {
      type: "notification.read";
      ids?: string[];
      count: number;
      unreadCount: number;
      readAt: string;
    };

interface BackendNotificationStreamEvent {
  type: NotificationStreamEvent["type"] | "notification.ready";
  notification?: BackendNotification;
  id?: string;
  ids?: string[];
  count?: number;
  unreadCount?: number;
  readAt?: string;
}

interface NotificationStreamHandlers {
  onReady?: () => void;
  onCreated?: (notification: Notification) => void;
  onUpdated?: (notification: Notification) => void;
  onDeleted?: (id: string) => void;
  onRead?: (
    event: Extract<NotificationStreamEvent, { type: "notification.read" }>,
  ) => void;
  onError?: (error: string) => void;
}

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

function parseSseBlock(
  block: string,
  handleEvent: (eventType: string, rawData: string) => void,
) {
  let eventType = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length > 0) {
    handleEvent(eventType, dataLines.join("\n"));
  }
}

export function subscribeToNotificationStream(
  handlers: NotificationStreamHandlers,
): () => void {
  const abortController = new AbortController();
  let stopped = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const handleEvent = (eventType: string, rawData: string) => {
    let payload: BackendNotificationStreamEvent;
    try {
      payload = JSON.parse(rawData) as BackendNotificationStreamEvent;
    } catch {
      return;
    }

    if (
      eventType === "notification.ready" ||
      payload.type === "notification.ready"
    ) {
      retryAttempt = 0;
      handlers.onReady?.();
      return;
    }

    if (
      eventType === "notification.created" &&
      payload.notification &&
      handlers.onCreated
    ) {
      handlers.onCreated(mapNotification(payload.notification));
      return;
    }

    if (
      eventType === "notification.updated" &&
      payload.notification &&
      handlers.onUpdated
    ) {
      handlers.onUpdated(mapNotification(payload.notification));
      return;
    }

    if (
      eventType === "notification.deleted" &&
      typeof payload.id === "string" &&
      handlers.onDeleted
    ) {
      handlers.onDeleted(payload.id);
      return;
    }

    if (
      eventType === "notification.read" &&
      typeof payload.count === "number" &&
      typeof payload.unreadCount === "number" &&
      typeof payload.readAt === "string" &&
      handlers.onRead
    ) {
      handlers.onRead({
        type: "notification.read",
        ids: payload.ids,
        count: payload.count,
        unreadCount: payload.unreadCount,
        readAt: payload.readAt,
      });
    }
  };

  const scheduleReconnect = (message: string) => {
    if (stopped) return;
    handlers.onError?.(message);
    retryAttempt += 1;
    const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(retryAttempt, 5));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delayMs);
  };

  const connect = async () => {
    try {
      const token = tokenStore.getAccessToken();
      const locale = localStorage.getItem("i18nextLng") || "zh-CN";
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "X-Locale": locale,
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
        headers,
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Notification stream failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, "\n");

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (block.trim()) {
            parseSseBlock(block, handleEvent);
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

      scheduleReconnect("Notification stream closed");
    } catch (error) {
      if (!abortController.signal.aborted && !stopped) {
        scheduleReconnect(
          error instanceof Error ? error.message : "Notification stream failed",
        );
      }
    }
  };

  void connect();

  return () => {
    stopped = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
    abortController.abort();
  };
}

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number; isRead?: boolean }) =>
    api
      .get<{
        items: BackendNotification[];
        total: number;
        page: number;
        limit: number;
      }>("/notifications", {
        params: {
          page: params?.page,
          limit: params?.limit,
          read:
            typeof params?.isRead === "boolean"
              ? String(params.isRead)
              : undefined,
        },
      })
      .then((res) => ({
        ...res,
        items: res.items.map(mapNotification),
      })),

  markAsRead: (id: string) =>
    api.post<{ count: number; unreadCount?: number }>(
      "/notifications/mark-read",
      {
        ids: [id],
      },
    ),

  markAllAsRead: () =>
    api.post<{ count: number; unreadCount?: number }>(
      "/notifications/mark-read",
      {},
    ),

  decide: (id: string, decision: "execute" | "dismiss") =>
    api
      .post<{
        status:
          | "executed"
          | "dismissed"
          | "approved_pending_external_adapter"
          | "external_execution_failed";
        notification: BackendNotification;
        unreadCount: number;
        result?: unknown;
        actionProposal?: NotificationDecisionResponse["actionProposal"];
      }>(`/notifications/${id}/decision`, { decision })
      .then((res) => ({
        ...res,
        notification: mapNotification(res.notification),
      })),

  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
};
