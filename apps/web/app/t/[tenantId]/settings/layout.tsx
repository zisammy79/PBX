'use client';

import { useParams } from 'next/navigation';
import { SubNav } from '@/components/sub-nav';
import { TENANT_SETTINGS_TABS } from '@/lib/nav-config';

export default function TenantSettingsLayout({ children }: { children: React.ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  return (
    <div className="page-stack">
      <SubNav items={TENANT_SETTINGS_TABS(tenantId)} ariaLabel="Tenant settings" />
      {children}
    </div>
  );
}
