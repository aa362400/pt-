import { api } from './client';

export type DocumentVisibility = 'PRIVATE' | 'WORKSPACE' | 'ORGANIZATION';

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  tags: string[];
  visibility: DocumentVisibility;
  workspaceId?: string | null;
  fileAssetId?: string | null;
  createdBy: string;
  createdAt: string;
  creator?: {
    id: string;
    name: string | null;
  };
}

export interface CreateKnowledgeDocumentInput {
  title: string;
  content: string;
  tags?: string[];
  visibility?: DocumentVisibility;
  workspaceId?: string;
  fileAssetId?: string;
}

export const knowledgeBaseApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    tag?: string;
    workspaceId?: string;
  }) =>
    api.get<{ items: KnowledgeDocument[]; total: number; page: number; limit: number }>(
      '/knowledge-base',
      { params },
    ),

  create: (data: CreateKnowledgeDocumentInput) =>
    api.post<KnowledgeDocument>('/knowledge-base', data),
};
