'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/permissions';
import { LoadingBlock } from '@/components/app-shell';

export default function HomePage() {
  const { user, loading, activeTenantId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (activeTenantId) {
      router.replace(`/t/${activeTenantId}/dashboard`);
      return;
    }
    if (isPlatformAdmin(user)) {
      router.replace('/platform/dashboard');
      return;
    }
    router.replace('/access-denied');
  }, [user, loading, activeTenantId, router]);

  return <LoadingBlock />;
}
