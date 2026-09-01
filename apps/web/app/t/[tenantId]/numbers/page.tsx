'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import type { TenantPhoneNumberRow } from '@pbx/contracts';

type AssignableDestinations = {
  destinations: Array<{
    type: string;
    id: string;
    label: string;
  }>;
};

function destinationLabel(
  row: TenantPhoneNumberRow,
  destinations: Map<string, string>,
): string {
  if (!row.destinationType || !row.destinationId) return 'Not routed';
  const key = `${row.destinationType}:${row.destinationId}`;
  return destinations.get(key) ?? `${row.destinationType} ${row.destinationId.slice(0, 8)}…`;
}

export default function NumbersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [numbers, setNumbers] = useState<TenantPhoneNumberRow[]>([]);
  const [destinations, setDestinations] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.get<{ numbers: TenantPhoneNumberRow[] }>(`tenants/${tenantId}/phone-numbers`, tenantId),
      api.get<AssignableDestinations>(`tenants/${tenantId}/assignable-destinations`, tenantId),
    ])
      .then(([numbersRes, destRes]) => {
        setNumbers(numbersRes.numbers);
        const map = new Map<string, string>();
        for (const dest of destRes.destinations) {
          map.set(`${dest.type}:${dest.id}`, dest.label);
        }
        setDestinations(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load numbers'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const activeCount = useMemo(() => numbers.filter((n) => n.isActive).length, [numbers]);

  if (error) return <ErrorAlert message={error} />;
  if (loading) return <LoadingBlock />;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'My numbers' },
        ]}
      />
      <PageHeader
        title="My numbers"
        description={`${activeCount} active numbers assigned to your tenant.`}
      />
      {numbers.length === 0 ? (
        <div className="empty-state card">
          <p>No phone numbers assigned yet.</p>
          <p className="muted">Contact your platform administrator to purchase or assign DIDs.</p>
        </div>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Status</th>
                <th>Route to</th>
                <th>Provider</th>
                <th>On trunk</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((row) => (
                <tr key={row.id}>
                  <td>{row.e164}</td>
                  <td>{row.friendlyName ?? '—'}</td>
                  <td>
                    <span className={`badge badge-${row.isActive ? 'success' : 'neutral'}`}>
                      {row.isActive ? row.status : 'inactive'}
                    </span>
                  </td>
                  <td>{destinationLabel(row, destinations)}</td>
                  <td>{row.provider}</td>
                  <td>{row.onTwilioTrunk ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
