'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';

type OperatorPanel = {
  observedAt: string;
  extensions: {
    total: number;
    registered: number;
    unregistered: number;
    items: Array<{
      id: string;
      extensionNumber: string;
      displayName: string;
      registered: boolean;
    }>;
  };
  activeCalls: Array<{
    id: string;
    direction: string;
    status: string;
    callerNumber: string | null;
    calleeNumber: string | null;
    startedAt: string;
    fromExtensionNumber: string | null;
    fromExtensionName: string | null;
    toExtensionNumber: string | null;
    toExtensionName: string | null;
  }>;
};

export default function OperatorPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<OperatorPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const panel = await api.get<OperatorPanel>('calls/operator', tenantId);
      setData(panel);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operator panel');
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Operator panel' },
        ]}
      />
      <PageHeader
        title="Operator panel"
        description="Live call supervision (read-only). Refreshes every 8 seconds."
      />
      {error ? <ErrorAlert message={error} /> : null}

      <KpiGrid>
        <KpiCard label="Active calls" value={data.activeCalls.length} tone="live" />
        <KpiCard label="Extensions online" value={data.extensions.registered} tone="default" />
        <KpiCard label="Extensions offline" value={data.extensions.unregistered} tone="missed" />
      </KpiGrid>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Active calls ({data.activeCalls.length})</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Last updated {formatDate(data.observedAt)}
        </p>
        {data.activeCalls.length === 0 ? (
          <p className="muted">No active calls.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {data.activeCalls.map((call) => (
                  <tr key={call.id}>
                    <td>{call.direction}</td>
                    <td>
                      {call.fromExtensionName
                        ? `${call.fromExtensionName} (${call.fromExtensionNumber})`
                        : call.callerNumber ?? '—'}
                    </td>
                    <td>
                      {call.toExtensionName
                        ? `${call.toExtensionName} (${call.toExtensionNumber})`
                        : call.calleeNumber ?? '—'}
                    </td>
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
        <h2>Extension status</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Extension</th>
                <th>Name</th>
                <th>Registration</th>
              </tr>
            </thead>
            <tbody>
              {data.extensions.items.map((ext) => (
                <tr key={ext.id}>
                  <td>{ext.extensionNumber}</td>
                  <td>{ext.displayName}</td>
                  <td>
                    <span className={`badge badge-${ext.registered ? 'success' : 'neutral'}`}>
                      {ext.registered ? 'Online' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
