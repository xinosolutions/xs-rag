import { ErrorCode, ErrorEnvelope, LockedCopy } from '@xs-rag/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public override readonly message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function executeRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch {
    throw new ApiClientError(
      ErrorCode.INTERNAL,
      LockedCopy.GENERIC_ERROR,
      0,
    );
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let envelope: ErrorEnvelope | null = null;
    if (isJson) {
      try {
        envelope = (await res.json()) as ErrorEnvelope;
      } catch {
        // Fall back to generic error
      }
    }

    const code = envelope?.error?.code || (res.status === 401 ? ErrorCode.AUTH_REQUIRED : ErrorCode.INTERNAL);
    const message = envelope?.error?.message || LockedCopy.GENERIC_ERROR;
    const details = envelope?.error?.details;
    const requestId = envelope?.error?.requestId || res.headers.get('x-request-id') || undefined;

    // Client refresh: On 401 AUTH_TOKEN_EXPIRED the web client calls POST /auth/refresh once, then retries the original request once
    if (
      res.status === 401 &&
      code === ErrorCode.AUTH_TOKEN_EXPIRED &&
      !isRetry &&
      !path.includes('/auth/refresh') &&
      !path.includes('/auth/login') &&
      !path.includes('/auth/register')
    ) {
      const refreshed = await executeRefresh();
      if (refreshed) {
        return request<T>(path, options, true);
      }
    }

    throw new ApiClientError(code, message, res.status, details as Record<string, unknown>, requestId);
  }

  if (isJson) {
    return (await res.json()) as T;
  }

  return (await res.text()) as unknown as T;
}

export const apiClient = {
  get: <T = unknown>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T = unknown>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
