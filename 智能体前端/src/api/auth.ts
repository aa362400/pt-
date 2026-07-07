import { apiRequest, tokenStore } from './client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface MeResponse {
  id: string;
  email: string;
  orgId?: string;
  role?: string;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRefresh: true,
  });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { name, email, password },
    skipAuthRefresh: true,
  });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data;
}

export async function fetchMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me');
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    tokenStore.clear();
  }
}
