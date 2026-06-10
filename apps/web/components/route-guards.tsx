'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { canAccessTenant, isPlatformAdmin } from '@/lib/permissions';
import { LoadingBlock } from '@/components/app-shell';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <LoadingBlock />;
  if (!user) return null;
  return <>{children}</>;
}

export function RequireTenant({ tenantId, children }: { tenantId: string; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !canAccessTenant(user, tenantId)) {
      router.replace('/access-denied');
    }
  }, [loading, user, tenantId, router]);

  if (loading) return <LoadingBlock />;
  if (!user || !canAccessTenant(user, tenantId)) return null;
  return <>{children}</>;
}

export function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !isPlatformAdmin(user)) {
      router.replace('/access-denied');
    }
  }, [loading, user, router]);

  if (loading) return <LoadingBlock />;
  if (!user || !isPlatformAdmin(user)) return null;
  return <>{children}</>;
}
