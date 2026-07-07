import { api } from './client';
import type { ImageMode, StylePreset } from '../types';

export interface ImagePromptProject {
  id: string;
  name: string;
  description?: string;
  mode: string;
  stylePreset?: string;
  prompt: string;
  negativePrompt?: string;
  imageCount: number;
  images: Array<{
    id: string;
    url: string;
    thumbnailUrl?: string;
  }>;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export const imagePromptApi = {
  /** 图片生成项目列表 */
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<{ items: ImagePromptProject[]; total: number }>('/image-prompts', { params }),

  /** 项目详情 */
  getById: (id: string) => api.get<ImagePromptProject>(`/image-prompts/${id}`),

  /** 创建项目 */
  create: (data: Partial<ImagePromptProject>) =>
    api.post<ImagePromptProject>('/image-prompts', data),

  /** 更新项目 */
  update: (id: string, data: Partial<ImagePromptProject>) =>
    api.patch<ImagePromptProject>(`/image-prompts/${id}`, data),

  /** 删除项目 */
  delete: (id: string) => api.delete(`/image-prompts/${id}`),

  /** 触发生成 */
  generate: (id: string) =>
    api.post<ImagePromptProject>(`/image-prompts/${id}/generate`),

  /** 获取可用模式 */
  getModes: () => api.get<ImageMode[]>('/image-prompts/modes'),

  /** 获取风格预设 */
  getStylePresets: (modeId?: string) =>
    api.get<StylePreset[]>('/image-prompts/style-presets', {
      params: modeId ? { modeId } : undefined,
    }),
};
