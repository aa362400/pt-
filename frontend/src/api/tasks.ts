import { api } from './client';
import type { TaskItem } from '../types';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task extends TaskItem {
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  workspaceId?: string;
  assigneeId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueAt?: string;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
}

export const tasksApi = {
  /** tasktext */
  list: (params?: {
    page?: number;
    limit?: number;
    status?: TaskStatus;
    priority?: string;
    assignee?: string;
  }) => api.get<{ items: Task[]; total: number }>('/tasks', { params }),

  /** tasktext */
  getById: (id: string) => api.get<Task>(`/tasks/${id}`),

  /** texttask */
  create: (data: CreateTaskInput) => api.post<Task>('/tasks', data),

  /** texttask */
  update: (id: string, data: UpdateTaskInput) =>
    api.patch<Task>(`/tasks/${id}`, data),

  /** texttask */
  delete: (id: string) => api.delete(`/tasks/${id}`),

  /** statustext */
  transition: (id: string, status: TaskStatus) =>
    api.patch<Task>(`/tasks/${id}/status`, { status }),
};
