'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { EntitlementUsage } from '@pbx/contracts';

export default function TenantEntitlementsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [rows, setRows] = useState<EntitlementUsage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<EntitlementUsage[]>(`tenants/${tenantId}/entitlements`, tenantId)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load entitlements'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!rows.length) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Entitlements" description="Plan usage and remaining capacity." />
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Used</th>
              <th>Limit</th>
              <th>Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dimension}>
                <td>{row.dimension}</td>
                <td>{row.used}</td>
                <td>{row.limit ?? 'Unlimited'}</td>
                <td>{row.remaining ?? '—'}</td>
                <td>
                  {row.overLimit ? 'Over limit' : row.limit === null ? 'Unlimited' : row.remaining === 0 ? 'At limit' : 'OK'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link href={`/t/${tenantId}/billing/plan`}>View plan details</Link>
      </p>
    </>
  );
}
