'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate, formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';

type ActiveCall = {
  id: string;
  direction: string;
  status: string;
  callerNumber: string | null;
  calleeNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
};

type RecentCall = ActiveCall & { answeredAt: string | null };

export default function AgentPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [active, setActive] = useState<ActiveCall[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.get<ActiveCall[]>('calls/active', tenantId),
      api.get<{ data: RecentCall[] }>('calls?page=1&pageSize=10', tenantId),
    ])
      .then(([activeCalls, history]) => {
        setActive(activeCalls);
        setRecent(history.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load agent panel'))
      .finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      void api.get<ActiveCall[]>('calls/active', tenantId).then(setActive).catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (loading) return <LoadingBlock />;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Agent panel' },
        ]}
      />
      <PageHeader
        title="Agent panel"
        description="Your live queue and recent activity. Use your SIP softphone or mobile app to place calls."
      />

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Webphone</h2>
        <p>
          Browser webphone is not enabled yet. Configure your SIP client using credentials from{' '}
          <Link href={`/t/${tenantId}/extensions`}>Extensions</Link>.
        </p>
        <p className="muted">Hold, transfer, and click-to-call controls will appear here in a future release.</p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Active calls ({active.length})</h2>
        {active.length === 0 ? (
          <p className="muted">No active calls company-wide.</p>
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
        <h2>Recent calls</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((call) => (
                <tr key={call.id}>
                  <td>{formatDate(call.startedAt)}</td>
                  <td>{call.direction}</td>
                  <td>{call.callerNumber ?? '—'}</td>
                  <td>{call.calleeNumber ?? '—'}</td>
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
