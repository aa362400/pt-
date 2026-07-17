/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { tokenStore } from '../api/client';
import * as authApi from '../api/auth';
import type { AuthUser, LoginResult } from '../api/auth';
import { usersApi } from '../api/users';

interface AuthState {
  /** null = 未登录；undefined = 初始化中 */
  user: AuthUser | null | undefined;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (tempToken: string, token: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const USER_CACHE_KEY = 'shopmate.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    // 恢复会话：有 token 就校验一次 /auth/me
    const bootstrap = async () => {
      if (!tokenStore.getAccessToken() && !tokenStore.getRefreshToken()) {
        setUser(null);
        return;
      }
      try {
        const profile = await usersApi.getMe();
        const currentUser = {
          id: profile.id,
          email: profile.email,
          name: profile.name ?? '用户',
        };
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser));
        setUser(currentUser);
      } catch {
        tokenStore.clear();
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
      }
    };
    void bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.kind === 'two-factor-required') {
      return res;
    }
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.user));
    setUser(res.user);
    return res;
  }, []);

  const verifyTwoFactor = useCallback(
    async (tempToken: string, token: string) => {
      const verifiedUser = await authApi.verifyTwoFactor(tempToken, token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(verifiedUser));
      setUser(verifiedUser);
    },
    [],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register(name, email, password);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.user));
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    const profile = await usersApi.updateMe({ name });
    const currentUser = {
      id: profile.id,
      email: profile.email,
      name: profile.name ?? '用户',
    };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(currentUser));
    setUser(currentUser);
  }, []);

  const value = useMemo(
    () => ({ user, login, verifyTwoFactor, register, updateProfile, logout }),
    [user, login, verifyTwoFactor, register, updateProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
