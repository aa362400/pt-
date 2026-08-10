/**
 * text API Client：
 * - baseURL text VITE_API_BASE_URL（text /api/v1，english_text Vite proxy english_textbackend）
 * - automatictext Bearer token
 * - access token english_textautomatictext refresh token english_textrequest
 */

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

const ACCESS_TOKEN_KEY = "shopmate.accessToken";
const REFRESH_TOKEN_KEY = "shopmate.refreshToken";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export class ApiRequestError extends Error implements ApiError {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** textautomatic 401 text（english_text/textAPItext） */
  skipAuthRefresh?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  // text 401 english_text refresh request
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      code?: string;
      message?: string | string[];
      [key: string]: unknown;
    };
    const message =
      body.error?.message ??
      (Array.isArray(body.message) ? body.message.join("; ") : body.message) ??
      res.statusText;
    return new ApiRequestError(
      res.status,
      body.error?.code ?? body.code ?? "UNKNOWN",
      message,
      {
        ...body,
        ...(body.error && typeof body.error === "object" ? body.error : {}),
      },
    );
  } catch {
    return new ApiRequestError(res.status, "UNKNOWN", res.statusText);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const token = tokenStore.getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // textrequesttextuserenglish_text（stage4：english_text）
    const locale = localStorage.getItem("i18nextLng") || "zh-CN";
    headers["X-Locale"] = locale;
    return fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  get: <T>(path: string, options?: { params?: Record<string, unknown> }) =>
    apiRequest<T>(`${path}${buildQueryString(options?.params)}`),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "DELETE", body }),
};

/** Convenience alias for `api` */
export const apiClient = api;
