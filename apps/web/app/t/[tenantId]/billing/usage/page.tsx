'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function UsagePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [usage, setUsage] = useState<Array<Record<string, unknown>>>([]);
  const [rated, setRated] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<Array<Record<string, unknown>>>('usage', tenantId),
      api.get<Array<Record<string, unknown>>>('rated-usage', tenantId),
    ])
      .then(([u, r]) => {
        setUsage(u);
        setRated(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load usage'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!usage) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Usage" description="Normalized and rated usage for billing." />
      <StatusBanner stripe providerCost />
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Normalized usage events</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Meter</th>
                <th>Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={String(row.id)}>
                  <td>{formatDate(String(row.eventTimestamp))}</td>
                  <td>{String(row.meterName)}</td>
                  <td>{String(row.quantity)}</td>
                  <td>{String(row.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Rated usage</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Meter</th>
                <th>Charge</th>
                <th>Currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.meterName ?? '—')}</td>
                  <td>{formatCurrency(String(row.customerCharge), String(row.currency ?? 'USD'))}</td>
                  <td>{String(row.currency ?? 'USD')}</td>
                  <td>{String(row.ratingStatus ?? 'rated')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Provider cost: Unavailable</p>
      </section>
    </>
  );
}
