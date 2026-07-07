import { api } from './client';

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  /** 通知列表 */
  list: (params?: { page?: number; limit?: number; isRead?: boolean }) =>
    api.get<{ items: Notification[]; total: number }>('/notifications', { params }),

  /** 标记为已读 */
  markAsRead: (id: string) =>
    api.patch<Notification>(`/notifications/${id}/read`),

  /** 全部标记为已读 */
  markAllAsRead: () => api.patch<void>('/notifications/read-all'),

  /** 未读通知数 */
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
};
