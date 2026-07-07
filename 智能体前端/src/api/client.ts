/**
 * 统一 API Client：
 * - baseURL 来自 VITE_API_BASE_URL（默认 /api/v1，开发时由 Vite proxy 转发到后端）
 * - 自动附带 Bearer token
 * - access token 过期时自动用 refresh token 换新并重放请求
 */

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

const ACCESS_TOKEN_KEY = 'shopmate.accessToken';
const REFRESH_TOKEN_KEY = 'shopmate.refreshToken';

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export class ApiRequestError extends Error implements ApiError {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export const tokenStore = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: (): string | null =>
    localStorage.getItem(REFRESH_TOKEN_KEY),
  set(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 跳过自动 401 刷新（用于登录/刷新接口本身） */
  skipAuthRefresh?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  // 并发 401 时只发一次 refresh 请求
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      tokenStore.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseError(res: Response): Promise<ApiRequestError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
      message?: string | string[];
    };
    const message =
      body.error?.message ??
      (Array.isArray(body.message) ? body.message.join('; ') : body.message) ??
      res.statusText;
    return new ApiRequestError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      message,
    );
  } catch {
    return new ApiRequestError(res.status, 'UNKNOWN', res.statusText);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const token = tokenStore.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401 && !options.skipAuthRefresh) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  get: <T>(path: string, options?: { params?: Record<string, unknown> }) =>
    apiRequest<T>(`${path}${buildQueryString(options?.params)}`),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/** Convenience alias for `api` */
export const apiClient = api;
