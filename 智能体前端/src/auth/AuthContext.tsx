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
import type { AuthUser } from '../api/auth';

interface AuthState {
  /** null = 未登录；undefined = 初始化中 */
  user: AuthUser | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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
        const me = await authApi.fetchMe();
        const cached = localStorage.getItem(USER_CACHE_KEY);
        const cachedUser = cached
          ? (JSON.parse(cached) as AuthUser)
          : null;
        setUser({
          id: me.id,
          email: me.email,
          name: cachedUser?.name ?? me.email.split('@')[0] ?? '用户',
        });
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
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }, []);

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

  const value = useMemo(
    () => ({ user, login, register, logout }),
    [user, login, register, logout],
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
