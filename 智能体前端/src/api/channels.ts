import { api } from './client';

export interface ChannelConnection {
  id: string;
  platform: string;
  platformLabel: string;
  icon: string;
  isConnected: boolean;
  status: 'active' | 'error' | 'expired' | 'pending';
  lastSyncAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const channelsApi = {
  /** 渠道连接列表 */
  list: () => api.get<ChannelConnection[]>('/channels'),

  /** 获取单个渠道 */
  getById: (id: string) => api.get<ChannelConnection>(`/channels/${id}`),

  /** 建立连接（授权） */
  connect: (platform: string, data?: Record<string, unknown>) =>
    api.post<ChannelConnection>('/channels/connect', { platform, ...data }),

  /** 断开连接 */
  disconnect: (id: string) => api.delete(`/channels/${id}`),

  /** 刷新连接状态 */
  refreshStatus: (id: string) =>
    api.patch<ChannelConnection>(`/channels/${id}/refresh`),
};
