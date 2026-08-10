import { api } from './client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  plan?: string;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    memberships?: number;
    workspaces?: number;
    agentRuns?: number;
  };
}

export interface OrganizationMember {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED';
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  };
}

export interface OrganizationWorkspace {
  id: string;
  name: string;
  platform: string;
  memberCount: number;
  active: boolean;
}

export const organizationsApi = {
  current: () => api.get<Organization>('/organizations/current'),

  updateCurrent: (data: Partial<Organization>) =>
    api.patch<Organization>('/organizations/current', data),

  listMembers: (params?: { page?: number; limit?: number }) =>
    api.get<{ items: OrganizationMember[]; total: number; page: number; limit: number }>(
      '/organizations/members',
      { params },
    ),

  changeMemberRole: (
    memberId: string,
    role: OrganizationMember['role'],
  ) => api.patch(`/organizations/members/${memberId}`, { role }),

  removeMember: (memberId: string) =>
    api.delete(`/organizations/members/${memberId}`),
};
