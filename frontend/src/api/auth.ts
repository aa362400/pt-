import { apiRequest, tokenStore } from './client';
import {
  classifyLoginResponse,
  type AuthUser,
  type LoginResponse,
} from './auth-session';

export type { AuthUser, LoginResponse as AuthResponse } from './auth-session';

export type LoginResult =
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'two-factor-required'; tempToken: string };

export interface MeResponse {
  id: string;
  email: string;
  orgId?: string;
  role?: string;
  twoFactorEnabled: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCode: string;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const data = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRefresh: true,
  });
  const classification = classifyLoginResponse(data);
  if (classification.kind === 'two-factor-required') {
    return classification;
  }
  tokenStore.set(classification.accessToken, classification.refreshToken);
  return { kind: 'authenticated', user: data.user };
}

export async function verifyTwoFactor(
  tempToken: string,
  token: string,
): Promise<AuthUser> {
  const data = await apiRequest<LoginResponse>('/auth/2fa/verify', {
    method: 'POST',
    body: { tempToken, token },
    skipAuthRefresh: true,
  });
  const classification = classifyLoginResponse(data);
  if (classification.kind !== 'authenticated') {
    throw new Error('双重验证未返回有效登录凭据');
  }
  tokenStore.set(classification.accessToken, classification.refreshToken);
  return data.user;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/auth/register', {
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

export async function generateTwoFactor(): Promise<TwoFactorSetup> {
  return apiRequest<TwoFactorSetup>('/auth/2fa/generate', { method: 'POST' });
}

export async function enableTwoFactor(token: string): Promise<void> {
  await apiRequest('/auth/2fa/enable', { method: 'POST', body: { token } });
}

export async function disableTwoFactor(token: string): Promise<void> {
  await apiRequest('/auth/2fa/disable', { method: 'POST', body: { token } });
}

export async function stepUpTwoFactor(
  password: string,
  token: string,
): Promise<AuthUser> {
  const data = await apiRequest<LoginResponse>('/auth/2fa/step-up', {
    method: 'POST',
    body: { password, token },
  });
  const classification = classifyLoginResponse(data);
  if (classification.kind !== 'authenticated') {
    throw new Error('高风险操作身份验证未返回有效登录凭据');
  }
  tokenStore.set(classification.accessToken, classification.refreshToken);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    tokenStore.clear();
  }
}
