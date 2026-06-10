'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate, formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type Call = {
  id: string;
  direction: string;
  status: string;
  callerNumber: string | null;
  calleeNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
  correlationId: string;
};

type PaginatedCalls = {
  data: Call[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export default function CallsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [active, setActive] = useState<Call[]>([]);
  const [history, setHistory] = useState<PaginatedCalls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<Call[]>('calls/active', tenantId),
      api.get<PaginatedCalls>('calls?page=1&pageSize=20', tenantId),
    ])
      .then(([activeCalls, callHistory]) => {
        setActive(activeCalls);
        setHistory(callHistory);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load calls'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!history) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Calls" description="Active calls and call history." />
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Active calls ({active.length})</h2>
        {active.length === 0 ? (
          <p className="muted">No active calls.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {active.map((call) => (
                  <tr key={call.id}>
                    <td>{call.callerNumber ?? '—'}</td>
                    <td>{call.calleeNumber ?? '—'}</td>
                    <td>
                      <Link href={`/t/${tenantId}/calls/${call.id}`}>{call.status}</Link>
                    </td>
                    <td>{formatDate(call.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Call history</h2>
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
              {history.data.map((call) => (
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
      </section>
    </>
  );
}
