'use client';

import { AppShell } from '@/components/app-shell';
import { RequireAuth, RequirePlatformAdmin } from '@/components/route-guards';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RequirePlatformAdmin>
        <AppShell mode="platform">{children}</AppShell>
      </RequirePlatformAdmin>
    </RequireAuth>
  );
}
