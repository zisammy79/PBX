'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function PlatformDashboardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get('platform/dashboard')
      .then((res) => setData(res as Record<string, unknown>))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load platform dashboard'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const tenants = data.tenants as Record<string, number>;
  const billing = data.billing as Record<string, unknown>;

  return (
    <>
      <PageHeader title="Platform dashboard" description="Cross-tenant operational overview." />
      <StatusBanner stripe />
      <div className="grid-stats">
        <div className="card"><div className="muted">Tenants</div><div className="stat-value">{tenants.total}</div></div>
        <div className="card"><div className="muted">Active tenants</div><div className="stat-value">{tenants.active}</div></div>
        <div className="card"><div className="muted">Suspended</div><div className="stat-value">{tenants.suspended}</div></div>
        <div className="card"><div className="muted">Rated revenue</div><div className="stat-value">{formatCurrency(String(billing.ratedRevenueTotal), 'USD')}</div></div>
      </div>
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Infrastructure health</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(data.health, null, 2)}</pre>
      </section>
    </>
  );
}
