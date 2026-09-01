'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';
import type { TenantPhoneNumberRow } from '@pbx/contracts';

export default function StatisticsNumbersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [numbers, setNumbers] = useState<TenantPhoneNumberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ numbers: TenantPhoneNumberRow[] }>(`tenants/${tenantId}/phone-numbers`, tenantId)
      .then((res) => setNumbers(res.numbers))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load numbers'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!numbers) return <LoadingBlock />;

  const active = numbers.filter((n) => n.isActive).length;
  const routed = numbers.filter((n) => n.inboundRouteId).length;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Statistics', href: `/t/${tenantId}/statistics` },
          { label: 'DID statistics' },
        ]}
      />
      <PageHeader title="DID statistics" description="Phone number inventory for your tenant." />
      <KpiGrid>
        <KpiCard label="Total numbers" value={numbers.length} />
        <KpiCard label="Active" value={active} tone="inbound" />
        <KpiCard label="With inbound route" value={routed} tone="outbound" />
      </KpiGrid>
      <section className="card">
        <Link href={`/t/${tenantId}/numbers`}>Open my numbers →</Link>
      </section>
    </>
  );
}
