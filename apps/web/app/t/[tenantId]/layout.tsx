'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { RequireAuth, RequireTenant } from '@/components/route-guards';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  return (
    <RequireAuth>
      <RequireTenant tenantId={tenantId}>
        <AppShell mode="tenant" tenantId={tenantId}>
          {children}
        </AppShell>
      </RequireTenant>
    </RequireAuth>
  );
}
