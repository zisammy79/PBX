'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';

type DashboardSummary = {
  extensions: { total: number; registered: number; unregistered: number };
};

export default function StatisticsExtensionsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<DashboardSummary>(`tenants/${tenantId}/dashboard`, tenantId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load statistics'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Statistics', href: `/t/${tenantId}/statistics` },
          { label: 'Extension statistics' },
        ]}
      />
      <PageHeader title="Extension statistics" description="Registration summary for your tenant." />
      <KpiGrid>
        <KpiCard label="Total extensions" value={data.extensions.total} />
        <KpiCard label="Online" value={data.extensions.registered} tone="local" />
        <KpiCard label="Offline" value={data.extensions.unregistered} tone="missed" />
      </KpiGrid>
      <section className="card">
        <Link href={`/t/${tenantId}/status`}>View device registration table →</Link>
      </section>
    </>
  );
}
