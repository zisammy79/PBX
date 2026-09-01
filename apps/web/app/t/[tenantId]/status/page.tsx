'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { downloadCsv } from '@/lib/csv-export';

type RegistrationItem = {
  extensionId: string;
  extensionNumber: string;
  registrationStatus: 'online' | 'offline' | 'unknown';
  endpointState: string | null;
  contactCount: number;
  lastObservedAt: string;
};

type RegistrationBatch = {
  items: RegistrationItem[];
  observedAt: string;
  asteriskReachable: boolean;
};

type Extension = {
  id: string;
  extensionNumber: string;
  displayName: string;
  status: string;
};

function registrationLabel(status: RegistrationItem['registrationStatus']) {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

function registrationTone(status: RegistrationItem['registrationStatus']) {
  switch (status) {
    case 'online':
      return 'success';
    case 'offline':
      return 'neutral';
    default:
      return 'warning';
  }
}

export default function StatusPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [batch, setBatch] = useState<RegistrationBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRegistration = useCallback(async () => {
    const reg = await api.get<RegistrationBatch>('extensions/registration-status', tenantId);
    setBatch(reg);
  }, [tenantId]);

  useEffect(() => {
    void Promise.all([
      api.get<Extension[]>(`tenants/${tenantId}/extensions`, tenantId),
      loadRegistration(),
    ])
      .then(([exts]) => setExtensions(exts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load status'))
      .finally(() => setLoading(false));

    const timer = window.setInterval(() => void loadRegistration(), 12000);
    return () => window.clearInterval(timer);
  }, [tenantId, loadRegistration]);

  function exportCsv() {
    if (!batch) return;
    const byId = new Map(extensions.map((e) => [e.id, e]));
    const headers = ['Extension', 'Name', 'Registration', 'Endpoint state', 'Contacts', 'Observed'];
    const rows = batch.items.map((item) => {
      const ext = byId.get(item.extensionId);
      return [
        item.extensionNumber,
        ext?.displayName ?? '',
        registrationLabel(item.registrationStatus),
        item.endpointState ?? '',
        String(item.contactCount),
        item.lastObservedAt,
      ];
    });
    downloadCsv(`extension-status-${tenantId.slice(0, 8)}.csv`, headers, rows);
  }

  if (error) return <ErrorAlert message={error} />;
  if (loading || !batch) return <LoadingBlock />;

  const regById = new Map(batch.items.map((i) => [i.extensionId, i]));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Extensions', href: `/t/${tenantId}/extensions` },
          { label: 'Devices' },
        ]}
      />
      <PageHeader
        title="Extension devices"
        description="SIP registration status for each extension endpoint."
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        }
      />

      <div className="alert alert-info" role="status">
        Asterisk reachable: {batch.asteriskReachable ? 'Yes' : 'No'} · Last observed{' '}
        {formatDate(batch.observedAt)}
      </div>

      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Extension</th>
              <th>Name</th>
              <th>Enabled</th>
              <th>Registration</th>
              <th>Endpoint</th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            {extensions.map((ext) => {
              const reg = regById.get(ext.id);
              return (
                <tr key={ext.id}>
                  <td>
                    <Link href={`/t/${tenantId}/extensions/${ext.id}`}>{ext.extensionNumber}</Link>
                  </td>
                  <td>{ext.displayName}</td>
                  <td>{ext.status}</td>
                  <td>
                    <span
                      className={`badge badge-${registrationTone(reg?.registrationStatus ?? 'unknown')}`}
                    >
                      {registrationLabel(reg?.registrationStatus ?? 'unknown')}
                    </span>
                  </td>
                  <td>{reg?.endpointState ?? '—'}</td>
                  <td>{reg?.contactCount ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
