import { api } from './client';

export interface CurrentUserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

export const usersApi = {
  getMe: () => api.get<CurrentUserProfile>('/users/me'),
  updateMe: (data: { name: string }) =>
    api.patch<CurrentUserProfile>('/users/me', data),
};
