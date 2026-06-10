'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function PlatformIntegrationsAuditPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Array<Record<string, unknown>>>('platform/integrations/audit')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load audit history'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!rows) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Integration audit" description="Credential lifecycle audit events (secrets redacted)." />
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Connection</th><th>Tenant</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>{String(row.createdAt)}</td>
                <td>{String(row.action)}</td>
                <td>{String(row.connectionId ?? '—')}</td>
                <td>{String(row.tenantId ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
