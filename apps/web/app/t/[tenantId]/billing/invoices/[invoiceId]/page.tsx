'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function InvoiceDetailPage() {
  const { tenantId, invoiceId } = useParams<{ tenantId: string; invoiceId: string }>();
  const [data, setData] = useState<{ invoice: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get(`invoices/${invoiceId}`, tenantId)
      .then((res) => setData(res as typeof data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoice'));
  }, [tenantId, invoiceId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const inv = data.invoice;

  return (
    <>
      <PageHeader title={`Invoice ${String(inv.invoiceNumber)}`} description={`Status: ${String(inv.status)}`} />
      <StatusBanner stripe />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Subtotal: {formatCurrency(String(inv.subtotal), String(inv.currency))}</p>
        <p>Tax: {formatCurrency(String(inv.tax), String(inv.currency))}</p>
        <p>Total: {formatCurrency(String(inv.total), String(inv.currency))}</p>
        <p>Period: {formatDate(String(inv.periodStart))} – {formatDate(String(inv.periodEnd))}</p>
      </div>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={String(line.id)}>
                <td>{String(line.description)}</td>
                <td>{String(line.lineType ?? 'usage')}</td>
                <td>{formatCurrency(String(line.amount), String(inv.currency))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
