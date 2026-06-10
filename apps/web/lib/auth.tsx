'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from './api-client';
import { canAccessTenant } from './permissions';

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  activeTenantId: string | null;
  setActiveTenantId: (tenantId: string | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!res.ok) {
        setUser(null);
        setActiveTenantIdState(null);
        return;
      }
      const session = (await res.json()) as SessionUser;
      setUser(session);
      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem('pbx_active_tenant') : null;
      const preferred =
        stored && session.tenantMemberships.some((m) => m.tenantId === stored)
          ? stored
          : session.tenantMemberships[0]?.tenantId ?? null;
      setActiveTenantIdState(preferred);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    setUser(null);
    setActiveTenantIdState(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pbx_active_tenant');
    }
    router.replace('/login');
  }, [router]);

  const setActiveTenantId = useCallback(
    (tenantId: string | null) => {
      if (tenantId && user && !canAccessTenant(user, tenantId)) return;
      setActiveTenantIdState(tenantId);
      if (typeof window !== 'undefined') {
        if (tenantId) window.localStorage.setItem('pbx_active_tenant', tenantId);
        else window.localStorage.removeItem('pbx_active_tenant');
      }
    },
    [user],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onExpired = () => {
      void logout();
    };
    window.addEventListener('pbx:session-expired', onExpired);
    return () => window.removeEventListener('pbx:session-expired', onExpired);
  }, [logout]);

  const value = useMemo(
    () => ({ user, loading, activeTenantId, setActiveTenantId, refresh, logout }),
    [user, loading, activeTenantId, setActiveTenantId, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function loginRequest(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message ?? 'Login failed');
  }
  return body as { user: SessionUser; mustChangePassword?: boolean };
}
