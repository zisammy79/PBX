import { SubNav } from '@/components/sub-nav';
import { EXTENSION_TABS } from '@/lib/nav-config';

export default async function ExtensionsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return (
    <>
      <SubNav items={EXTENSION_TABS(tenantId)} ariaLabel="Extensions sections" />
      {children}
    </>
  );
}
