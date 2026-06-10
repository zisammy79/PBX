'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function AiSessionsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ items: Array<Record<string, unknown>> }>('ai/sessions?page=1&limit=25', tenantId)
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sessions'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!items) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="AI sessions" description="Review AI voice session lifecycle and diagnostics." />
      <StatusBanner externalAi providerCost />
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Provider</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {items.map((session) => (
              <tr key={String(session.id)}>
                <td>{formatDate(String(session.startedAt))}</td>
                <td>
                  <Link href={`/t/${tenantId}/ai/sessions/${String(session.id)}`}>
                    {String(session.status)}
                  </Link>
                </td>
                <td>{String(session.providerType)}</td>
                <td>{String(session.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
