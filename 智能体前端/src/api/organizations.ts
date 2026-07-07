import { api } from './client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

export interface OrganizationWorkspace {
  id: string;
  name: string;
  platform: string;
  memberCount: number;
  active: boolean;
}

export const organizationsApi = {
  // ── CRUD ──
  list: () => api.get<Organization[]>('/organizations'),

  getById: (id: string) => api.get<Organization>(`/organizations/${id}`),

  create: (data: Partial<Organization>) =>
    api.post<Organization>('/organizations', data),

  update: (id: string, data: Partial<Organization>) =>
    api.patch<Organization>(`/organizations/${id}`, data),

  delete: (id: string) => api.delete(`/organizations/${id}`),

  // ── Membership ──
  listMembers: (orgId: string) =>
    api.get<OrganizationMember[]>(`/organizations/${orgId}/members`),

  changeMemberRole: (
    orgId: string,
    memberId: string,
    role: OrganizationMember['role'],
  ) => api.patch(`/organizations/${orgId}/members/${memberId}`, { role }),

  inviteMember: (orgId: string, data: { email: string; role: OrganizationMember['role'] }) =>
    api.post<OrganizationMember>(`/organizations/${orgId}/members`, data),

  removeMember: (orgId: string, memberId: string) =>
    api.delete(`/organizations/${orgId}/members/${memberId}`),

  // ── Workspaces ──
  listWorkspaces: (orgId: string) =>
    api.get<OrganizationWorkspace[]>(`/organizations/${orgId}/workspaces`),
};
