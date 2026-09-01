'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatDate, formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';

type RecentCall = {
  id: string;
  direction: string;
  status: string;
  callerNumber: string | null;
  calleeNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
};

export default function StatisticsMyPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ data: RecentCall[] }>('calls?page=1&pageSize=15', tenantId)
      .then((res) => setRecent(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!recent) return <LoadingBlock />;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Statistics', href: `/t/${tenantId}/statistics` },
          { label: 'My statistics' },
        ]}
      />
      <PageHeader
        title="My statistics"
        description="Recent tenant call activity. Personal extension mapping will refine this view in a future release."
      />
      <section className="card">
        <h2>Recent calls</h2>
        {recent.length === 0 ? (
          <p className="muted">No recent calls.</p>
        ) : (
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
        )}
        <p style={{ marginTop: '1rem' }}>
          <Link href={`/t/${tenantId}/agent`}>Open agent panel →</Link>
        </p>
      </section>
    </>
  );
}
