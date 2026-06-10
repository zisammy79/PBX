'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { canManageBilling } from '@/lib/permissions';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function CreditsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { user } = useAuth();
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('10.00');
  const [reason, setReason] = useState('manual_credit');

  async function load() {
    const rows = await api.get<Array<Record<string, unknown>>>('credits', tenantId);
    setEntries(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load credits'));
  }, [tenantId]);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('credits/adjustments', { amount, currency: 'USD', reason }, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply adjustment');
    }
  }

  if (error) return <ErrorAlert message={error} />;

  return (
    <>
      <PageHeader title="Credits" description="Append-only credit ledger." />
      {canManageBilling(user) ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>Manual adjustment</h2>
          <form onSubmit={onAdjust}>
            <div className="field">
              <label className="label" htmlFor="amount">Amount (USD)</label>
              <input id="amount" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="reason">Reason</label>
              <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">Apply adjustment</button>
          </form>
        </section>
      ) : (
        <p className="muted">You can view credits but cannot create adjustments.</p>
      )}
      {!entries ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Amount</th>
                <th>Balance after</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={String(entry.id)}>
                  <td>{formatDate(String(entry.createdAt))}</td>
                  <td>{formatCurrency(String(entry.amount), String(entry.currency ?? 'USD'))}</td>
                  <td>{formatCurrency(String(entry.balanceAfter), String(entry.currency ?? 'USD'))}</td>
                  <td>{String(entry.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
