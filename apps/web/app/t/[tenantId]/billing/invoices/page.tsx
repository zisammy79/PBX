'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function InvoicesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const periodEnd = new Date().toISOString();
    const periodStart = new Date(Date.now() - 30 * 86400000).toISOString();
    void Promise.all([
      api.get<Array<Record<string, unknown>>>('invoices', tenantId),
      api.post('invoices/preview', { periodStart, periodEnd, currency: 'USD' }, tenantId),
    ])
      .then(([invoices, prev]) => {
        setItems(invoices);
        setPreview(prev as Record<string, unknown>);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!preview) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Invoices" description="Review draft and finalized invoices." />
      <StatusBanner stripe />
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Current period preview</h2>
        <p>Total: {formatCurrency(String(preview.total), String(preview.currency ?? 'USD'))}</p>
        <p className="muted">Payment integration: Disabled</p>
      </section>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Status</th>
              <th>Total</th>
              <th>Period end</th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => (
              <tr key={String(inv.id)}>
                <td>
                  <Link href={`/t/${tenantId}/billing/invoices/${String(inv.id)}`}>
                    {String(inv.invoiceNumber)}
                  </Link>
                </td>
                <td>{String(inv.status)}</td>
                <td>{formatCurrency(String(inv.total), String(inv.currency ?? 'USD'))}</td>
                <td>{formatDate(inv.periodEnd ? String(inv.periodEnd) : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
