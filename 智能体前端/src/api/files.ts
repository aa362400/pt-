import { api } from './client';

export type FilePurpose =
  | 'PRODUCT_IMAGE'
  | 'KNOWLEDGE_DOC'
  | 'LISTING_IMAGE'
  | 'BRAND_ASSET'
  | 'REPORT_EXPORT'
  | 'AVATAR'
  | 'OTHER';

export interface FileAsset {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  ownerId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  publicUrl?: string | null;
  purpose: FilePurpose;
  createdAt: string;
}

export interface UploadFileInput {
  filename: string;
  mimeType: string;
  dataBase64: string;
  purpose: FilePurpose;
  workspaceId?: string;
}

export const filesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    purpose?: FilePurpose;
    workspaceId?: string;
  }) =>
    api.get<{ items: FileAsset[]; total: number; page: number; limit: number }>(
      '/files',
      { params },
    ),

  upload: (data: UploadFileInput) => api.post<FileAsset>('/files', data),

  delete: (id: string) => api.delete<{ id: string }>(`/files/${id}`),
};
