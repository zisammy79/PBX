export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly correlationId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type SessionUser = {
  id: string;
  email: string;
  platformRoles: string[];
  tenantMemberships: Array<{ tenantId: string; roles: string[] }>;
  supportSession?: { tenantId: string; reason?: string; expiresAt?: string } | null;
  mustChangePassword?: boolean;
};

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  tenantId?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.tenantId) {
    headers['X-Tenant-Id'] = options.tenantId;
  }

  const init: RequestInit = {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    credentials: 'same-origin',
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) {
    init.signal = options.signal;
  }

  const res = await fetch(`/api/backend/${path.replace(/^\//, '')}`, init);

  const text = await res.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pbx:session-expired'));
    }
    throw new ApiError('UNAUTHORIZED', 'Session expired. Please sign in again.', 401);
  }

  if (!res.ok) {
    const err = payload as {
      code?: string;
      message?: string;
      correlationId?: string;
      details?: Record<string, unknown>;
    };
    throw new ApiError(
      err.code ?? 'REQUEST_FAILED',
      err.message ?? `Request failed (${res.status})`,
      res.status,
      err.correlationId,
      err.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, tenantId?: string, signal?: AbortSignal) =>
    apiFetch<T>(path, {
      ...(tenantId ? { tenantId } : {}),
      ...(signal ? { signal } : {}),
    }),
  post: <T>(path: string, body?: unknown, tenantId?: string) =>
    apiFetch<T>(path, {
      method: 'POST',
      body,
      ...(tenantId ? { tenantId } : {}),
    }),
  patch: <T>(path: string, body?: unknown, tenantId?: string) =>
    apiFetch<T>(path, {
      method: 'PATCH',
      body,
      ...(tenantId ? { tenantId } : {}),
    }),
  delete: <T>(path: string, tenantId?: string) =>
    apiFetch<T>(path, { method: 'DELETE', ...(tenantId ? { tenantId } : {}) }),
};
