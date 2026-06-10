'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function ExtensionDetailPage() {
  const { tenantId, extensionId } = useParams<{ tenantId: string; extensionId: string }>();
  const [data, setData] = useState<{
    extension: { extensionNumber: string; displayName: string; status: string; createdAt: string };
    sipCredential: { username: string; secretVersion: number; createdAt: string } | null;
  } | null>(null);
  const [registration, setRegistration] = useState<{
    registered: boolean;
    contact: string | null;
    asteriskState: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get(`tenants/${tenantId}/extensions/${extensionId}`, tenantId),
      api.get(`extensions/${extensionId}/registration`, tenantId),
    ])
      .then(([detail, reg]) => {
        setData(detail as typeof data);
        setRegistration(reg as typeof registration);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load extension'));
  }, [tenantId, extensionId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title={`Extension ${data.extension.extensionNumber}`}
        description={data.extension.displayName}
      />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Status: {data.extension.status}</p>
        <p>Created: {formatDate(data.extension.createdAt)}</p>
        <p>
          Registration: {registration?.registered ? 'Registered' : 'Not registered'}
          {registration?.asteriskState ? ` (${registration.asteriskState})` : ''}
        </p>
      </div>
      <section className="card">
        <h2>SIP credential</h2>
        {data.sipCredential ? (
          <>
            <p>Username: {data.sipCredential.username}</p>
            <p>Secret version: {data.sipCredential.secretVersion}</p>
            <p className="muted">Plaintext secret is never shown after initial creation.</p>
          </>
        ) : (
          <p className="muted">No SIP credential on file.</p>
        )}
      </section>
    </>
  );
}
