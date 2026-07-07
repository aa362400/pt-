import { api } from './client';
import type { TaskItem } from '../types';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task extends TaskItem {
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const tasksApi = {
  /** 任务列表 */
  list: (params?: {
    page?: number;
    limit?: number;
    status?: TaskStatus;
    priority?: string;
    assignee?: string;
  }) => api.get<{ items: Task[]; total: number }>('/tasks', { params }),

  /** 任务详情 */
  getById: (id: string) => api.get<Task>(`/tasks/${id}`),

  /** 创建任务 */
  create: (data: Partial<Task>) => api.post<Task>('/tasks', data),

  /** 更新任务 */
  update: (id: string, data: Partial<Task>) =>
    api.patch<Task>(`/tasks/${id}`, data),

  /** 删除任务 */
  delete: (id: string) => api.delete(`/tasks/${id}`),

  /** 状态流转 */
  transition: (id: string, status: TaskStatus) =>
    api.patch<Task>(`/tasks/${id}/status`, { status }),
};
