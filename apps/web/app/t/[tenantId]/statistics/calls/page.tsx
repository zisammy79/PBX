'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { CallsHourlyChart } from '@/components/telephony/calls-chart';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';

type DashboardSummary = {
  calls: {
    todayInbound: number;
    todayOutbound: number;
    todayInternal: number;
    todayMissed: number;
    totalTalkSecondsToday: number;
    avgInboundAnswerSeconds: number;
    avgOutboundAnswerSeconds: number;
    hourlyChart: Array<{ hour: number; inbound: number; outbound: number; internal: number }>;
  };
};

export default function StatisticsCallsPage() {
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

  const calls = data.calls;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Statistics', href: `/t/${tenantId}/statistics` },
          { label: 'Call statistics' },
        ]}
      />
      <PageHeader title="Call statistics" description="Today's call volumes and timing." />
      <KpiGrid>
        <KpiCard label="Inbound" value={calls.todayInbound} tone="inbound" />
        <KpiCard label="Outbound" value={calls.todayOutbound} tone="outbound" />
        <KpiCard label="Local" value={calls.todayInternal} tone="local" />
        <KpiCard label="Missed" value={calls.todayMissed} tone="missed" />
      </KpiGrid>
      <section className="card">
        <h2>Talk time</h2>
        <p>Total: {formatDuration(calls.totalTalkSecondsToday)}</p>
        <p>Avg inbound answer: {formatDuration(Math.round(calls.avgInboundAnswerSeconds))}</p>
        <p>Avg outbound answer: {formatDuration(Math.round(calls.avgOutboundAnswerSeconds))}</p>
        <Link href={`/t/${tenantId}/calls`}>Open call records →</Link>
      </section>
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Hourly volume</h2>
        <CallsHourlyChart data={calls.hourlyChart} />
      </section>
    </>
  );
}
