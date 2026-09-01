'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';

type DashboardSummary = {
  calls: {
    active: number;
    liveInbound: number;
    liveOutbound: number;
    liveInternal: number;
    liveOnHold: number;
  };
};

export default function StatisticsLivePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .get<DashboardSummary>(`tenants/${tenantId}/dashboard`, tenantId)
        .then(setData)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load live stats'));

    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [tenantId]);

  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const calls = data.calls;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Statistics', href: `/t/${tenantId}/statistics` },
          { label: 'Live statistics' },
        ]}
      />
      <PageHeader title="Live statistics" description="Real-time call activity snapshot." />
      <KpiGrid>
        <KpiCard label="Active calls" value={calls.active} tone="live" />
        <KpiCard label="Inbound live" value={calls.liveInbound} tone="inbound" />
        <KpiCard label="Outbound live" value={calls.liveOutbound} tone="outbound" />
        <KpiCard label="Local live" value={calls.liveInternal} tone="local" />
        <KpiCard label="On hold" value={calls.liveOnHold} tone="missed" />
      </KpiGrid>
      <section className="card">
        <Link href={`/t/${tenantId}/operator`}>Open operator panel →</Link>
      </section>
    </>
  );
}
