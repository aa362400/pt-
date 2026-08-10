export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  requiresTwoFactor?: boolean;
  tempToken?: string;
}

export type LoginResponseClassification =
  | {
      kind: 'two-factor-required';
      tempToken: string;
    }
  | {
      kind: 'authenticated';
      accessToken: string;
      refreshToken: string;
    };

export function classifyLoginResponse(
  response: LoginResponse,
): LoginResponseClassification {
  if (response.requiresTwoFactor) {
    const tempToken = response.tempToken?.trim();
    if (!tempToken) {
      throw new Error('Login response is missing two-factor credentials');
    }
    return { kind: 'two-factor-required', tempToken };
  }

  const accessToken = response.accessToken?.trim();
  const refreshToken = response.refreshToken?.trim();
  if (!accessToken || !refreshToken) {
    throw new Error('Login response is missing valid credentials');
  }

  return { kind: 'authenticated', accessToken, refreshToken };
}
