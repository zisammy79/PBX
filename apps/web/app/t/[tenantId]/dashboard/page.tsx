'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDuration } from '@/lib/format';
import {
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBanner,
} from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { CallsHourlyChart } from '@/components/telephony/calls-chart';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';

type DashboardSummary = {
  calls: {
    active: number;
    todayTotal: number;
    todayCompleted: number;
    todayFailed: number;
    todayInbound: number;
    todayOutbound: number;
    todayInternal: number;
    todayMissed: number;
    liveInbound: number;
    liveOutbound: number;
    liveInternal: number;
    liveOnHold: number;
    totalTalkSecondsToday: number;
    avgInboundAnswerSeconds: number;
    avgOutboundAnswerSeconds: number;
    hourlyChart: Array<{ hour: number; inbound: number; outbound: number; internal: number }>;
    recent: Array<{
      id: string;
      direction: string;
      status: string;
      callerNumber: string | null;
      calleeNumber: string | null;
      startedAt: string;
      durationSeconds: number | null;
    }>;
  };
  extensions: { total: number; registered: number; unregistered: number };
  aiSessions: { active: number };
  usage: { normalizedEventCount: number; unratedCount: number; providerCostStatus: string };
  billing: { previewTotal: string; currency: string; stripeStatus: string; providerCostStatus: string } | null;
  subscription: { planName: string | null; monthlyAmount: string | null; currency: string } | null;
};

export default function TenantDashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<DashboardSummary>(`tenants/${tenantId}/dashboard`, tenantId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const calls = data.calls;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Overview' },
        ]}
      />
      <PageHeader
        title="Dashboard"
        description="Today's call activity, live queue, and quick links."
        actions={
          <Link href={`/t/${tenantId}/statistics`} className="btn btn-secondary">
            Statistics hub
          </Link>
        }
      />
      <StatusBanner demoAi externalAi stripe providerCost pstn />

      <KpiGrid>
        <KpiCard
          label="Inbound today"
          value={calls.todayInbound}
          tone="inbound"
          href={`/t/${tenantId}/calls?direction=inbound`}
        />
        <KpiCard
          label="Outbound today"
          value={calls.todayOutbound}
          tone="outbound"
          href={`/t/${tenantId}/calls?direction=outbound`}
        />
        <KpiCard
          label="Local today"
          value={calls.todayInternal}
          tone="local"
          href={`/t/${tenantId}/calls?direction=internal`}
        />
        <KpiCard
          label="Missed today"
          value={calls.todayMissed}
          tone="missed"
          href={`/t/${tenantId}/calls?status=failed`}
        />
        <KpiCard
          label="Live calls"
          value={calls.active}
          hint={`${calls.liveOnHold} on hold`}
          tone="live"
          href={`/t/${tenantId}/operator`}
        />
        <KpiCard
          label="Extensions online"
          value={data.extensions.registered}
          hint={`${data.extensions.unregistered} offline`}
          href={`/t/${tenantId}/status`}
        />
      </KpiGrid>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section className="card">
          <h2>Live breakdown</h2>
          <p>Inbound: {calls.liveInbound}</p>
          <p>Outbound: {calls.liveOutbound}</p>
          <p>Local: {calls.liveInternal}</p>
          <p>On hold: {calls.liveOnHold}</p>
          <Link href={`/t/${tenantId}/operator`}>Open operator panel →</Link>
        </section>
        <section className="card">
          <h2>Talk time today</h2>
          <p>Total: {formatDuration(calls.totalTalkSecondsToday)}</p>
          <p>Avg inbound answer: {formatDuration(Math.round(calls.avgInboundAnswerSeconds))}</p>
          <p>Avg outbound answer: {formatDuration(Math.round(calls.avgOutboundAnswerSeconds))}</p>
        </section>
        <section className="card">
          <h2>Usage summary</h2>
          <p>Normalized events: {data.usage.normalizedEventCount}</p>
          <p>Unrated events: {data.usage.unratedCount}</p>
          <p className="muted">Provider cost — Unavailable</p>
        </section>
        <section className="card">
          <h2>Billing preview</h2>
          {data.billing ? (
            <>
              <p>
                Current period estimate:{' '}
                {formatCurrency(data.billing.previewTotal, data.billing.currency)}
              </p>
              <p className="muted">Payment integration — Disabled</p>
            </>
          ) : (
            <p className="muted">Invoice preview unavailable</p>
          )}
          {data.subscription ? (
            <p>
              Plan: {data.subscription.planName ?? 'Assigned'} —{' '}
              {formatCurrency(data.subscription.monthlyAmount, data.subscription.currency)}/mo
            </p>
          ) : (
            <p className="muted">No subscription assigned</p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Hourly volume (today)</h2>
        <CallsHourlyChart data={calls.hourlyChart} />
      </section>

      <section className="card" style={{ marginTop: '1rem' }} aria-labelledby="recent-calls-heading">
        <h2 id="recent-calls-heading">Recent calls</h2>
        {calls.recent.length === 0 ? (
          <p className="muted">No calls yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Direction</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {calls.recent.map((call) => (
                  <tr key={call.id}>
                    <td>{formatDate(call.startedAt)}</td>
                    <td>{call.direction}</td>
                    <td>{call.callerNumber ?? '—'}</td>
                    <td>{call.calleeNumber ?? '—'}</td>
                    <td>
                      <Link href={`/t/${tenantId}/calls/${call.id}`}>{call.status}</Link>
                    </td>
                    <td>{formatDuration(call.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
