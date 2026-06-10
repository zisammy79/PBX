'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type Health = {
  status: string;
  timestamp: string;
  dependencies: Array<{ name: string; status: string; latencyMs?: number; message?: string }>;
};

export default function TenantHealthPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Health>('health', tenantId)
      .then(setHealth)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load health'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!health) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Telephony health"
        description="High-level service status. Technical details are in the advanced section."
      />
      <div className="card">
        <p>
          Overall status: <strong>{health.status}</strong>
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {health.dependencies.map((dep) => (
                <tr key={dep.name}>
                  <td>{dep.name}</td>
                  <td>{dep.status}</td>
                  <td>{dep.message ?? (dep.latencyMs != null ? `${dep.latencyMs} ms` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details style={{ marginTop: '1rem' }}>
          <summary>Advanced diagnostics</summary>
          <p className="muted">Checked at {health.timestamp}</p>
        </details>
      </div>
    </>
  );
}
