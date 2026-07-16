import { api } from './client';

interface BackendImagePromptProject {
  id: string;
  title: string;
  productId?: string | null;
  mode?: string;
  prompt?: string | null;
  settings?: Record<string, unknown> | null;
  generatedAssets?: unknown;
  qaStatus?: string;
  status?: 'DRAFT' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface ImagePromptProject {
  id: string;
  name: string;
  description?: string;
  mode: string;
  stylePreset?: string;
  prompt: string;
  negativePrompt?: string;
  imageCount: number;
  images: Array<{ id: string; url: string; thumbnailUrl?: string }>;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  qaStatus?: string;
  createdAt: string;
  updatedAt: string;
}

function extractImages(value: unknown, projectId: string): ImagePromptProject['images'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry === 'string' && entry.trim()) {
      return [{ id: `${projectId}-${index}`, url: entry }];
    }
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Record<string, unknown>;
    const url = typeof source.url === 'string' ? source.url : typeof source.imageUrl === 'string' ? source.imageUrl : '';
    if (!url) return [];
    return [{
      id: typeof source.id === 'string' ? source.id : `${projectId}-${index}`,
      url,
      thumbnailUrl: typeof source.thumbnailUrl === 'string' ? source.thumbnailUrl : undefined,
    }];
  });
}

function mapProject(project: BackendImagePromptProject): ImagePromptProject {
  const images = extractImages(project.generatedAssets, project.id);
  return {
    id: project.id,
    name: project.title,
    mode: project.mode ?? 'SINGLE',
    prompt: project.prompt ?? '',
    imageCount: images.length,
    images,
    status: (project.status ?? 'DRAFT').toLowerCase() as ImagePromptProject['status'],
    qaStatus: project.qaStatus,
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
  };
}

export const imagePromptApi = {
  list: async (_params?: { page?: number; limit?: number; status?: string }) => {
    const projects = await api.get<BackendImagePromptProject[]>('/image-prompt');
    const items = projects.map(mapProject);
    return { items, total: items.length };
  },
  getById: async (id: string) => mapProject(await api.get<BackendImagePromptProject>(`/image-prompt/${id}`)),
  create: async (data: Partial<ImagePromptProject>) => mapProject(await api.post<BackendImagePromptProject>('/image-prompt', {
    title: data.name,
    prompt: data.prompt,
  })),
  update: async (id: string, data: Partial<ImagePromptProject>) => mapProject(await api.patch<BackendImagePromptProject>(`/image-prompt/${id}`, {
    title: data.name,
    prompt: data.prompt,
    status: data.status?.toUpperCase(),
  })),
  delete: (id: string) => api.delete(`/image-prompt/${id}`),
};
