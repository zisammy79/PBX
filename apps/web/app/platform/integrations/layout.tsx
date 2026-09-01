'use client';

import { SubNav } from '@/components/sub-nav';
import { INTEGRATION_TABS } from '@/lib/nav-config';

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-stack">
      <SubNav items={INTEGRATION_TABS} ariaLabel="Integration sections" />
      {children}
    </div>
  );
}
