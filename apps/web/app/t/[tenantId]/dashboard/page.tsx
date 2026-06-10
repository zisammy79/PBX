'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBanner,
} from '@/components/app-shell';

type DashboardSummary = {
  calls: {
    active: number;
    todayTotal: number;
    todayCompleted: number;
    todayFailed: number;
    recent: Array<{ id: string; status: string; callerNumber: string | null; calleeNumber: string | null; startedAt: string }>;
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

  return (
    <>
      <PageHeader title="Dashboard" description="Operational overview for your tenant." />
      <StatusBanner demoAi externalAi stripe providerCost pstn />
      <div className="grid-stats" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="muted">Active calls</div>
          <div className="stat-value">{data.calls.active}</div>
        </div>
        <div className="card">
          <div className="muted">Calls today</div>
          <div className="stat-value">{data.calls.todayTotal}</div>
        </div>
        <div className="card">
          <div className="muted">Completed today</div>
          <div className="stat-value">{data.calls.todayCompleted}</div>
        </div>
        <div className="card">
          <div className="muted">Failed today</div>
          <div className="stat-value">{data.calls.todayFailed}</div>
        </div>
        <div className="card">
          <div className="muted">Registered extensions</div>
          <div className="stat-value">{data.extensions.registered}</div>
          <div className="muted">{data.extensions.unregistered} unregistered</div>
        </div>
        <div className="card">
          <div className="muted">Active AI sessions</div>
          <div className="stat-value">{data.aiSessions.active}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section className="card" aria-labelledby="usage-heading">
          <h2 id="usage-heading">Usage summary</h2>
          <p>Normalized events: {data.usage.normalizedEventCount}</p>
          <p>Unrated events: {data.usage.unratedCount}</p>
          <p className="muted">Provider cost — Unavailable</p>
        </section>
        <section className="card" aria-labelledby="billing-heading">
          <h2 id="billing-heading">Billing preview</h2>
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
      <section className="card" style={{ marginTop: '1rem' }} aria-labelledby="recent-calls-heading">
        <h2 id="recent-calls-heading">Recent calls</h2>
        {data.calls.recent.length === 0 ? (
          <p className="muted">No calls yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.calls.recent.map((call) => (
                  <tr key={call.id}>
                    <td>{formatDate(call.startedAt)}</td>
                    <td>{call.callerNumber ?? '—'}</td>
                    <td>{call.calleeNumber ?? '—'}</td>
                    <td>
                      <Link href={`/t/${tenantId}/calls/${call.id}`}>{call.status}</Link>
                    </td>
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
