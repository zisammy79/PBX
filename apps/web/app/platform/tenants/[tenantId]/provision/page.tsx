'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { OneTimeSecretPanel } from '@/components/ui-panels';

type ProvisioningState = {
  tenantId: string;
  status: string;
  steps: Array<{ key: string; status: string; failureReason?: string | null }>;
  canActivate: boolean;
};

export default function ProvisionCustomerPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const router = useRouter();
  const [state, setState] = useState<ProvisioningState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extensions, setExtensions] = useState('1001,1002,1003');
  const [secrets, setSecrets] = useState<Array<{ extensionNumber: string; username: string; secret: string; domain: string }> | null>(null);

  async function load() {
    const s = await api.get<ProvisioningState>(`tenants/${tenantId}/provisioning`);
    setState(s);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load provisioning state'));
  }, [tenantId]);

  async function onProvision(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const initialExtensions = extensions
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((extensionNumber) => ({
          extensionNumber,
          displayName: `Extension ${extensionNumber}`,
        }));

      const result = await api.post<ProvisioningState & { credentials?: typeof secrets }>(
        `tenants/${tenantId}/provision`,
        { initialExtensions },
      );
      setState(result);
      if (result.credentials?.length) setSecrets(result.credentials);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <ErrorAlert message={error} />;
  if (!state) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Provision customer PBX" description={`Tenant status: ${state.status}`} />
      {error ? <ErrorAlert message={error} /> : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Provisioning steps</h2>
        <ul>
          {state.steps.map((step) => (
            <li key={step.key}>
              {step.key}: {step.status}
              {step.failureReason ? ` — ${step.failureReason}` : ''}
            </li>
          ))}
        </ul>
      </section>
      {state.status !== 'active' ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>Initial extensions</h2>
          <form onSubmit={onProvision}>
            <div className="field">
              <label className="label">Extension numbers (comma-separated)</label>
              <input className="input" value={extensions} onChange={(e) => setExtensions(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Run provisioning
            </button>
          </form>
        </section>
      ) : (
        <p className="muted">Customer PBX is active.</p>
      )}
      {secrets?.map((cred) => (
        <OneTimeSecretPanel
          key={cred.extensionNumber}
          title={`Extension ${cred.extensionNumber} credentials`}
          fields={[
            { label: 'Username', value: cred.username },
            { label: 'Password', value: cred.secret },
            { label: 'Domain', value: cred.domain },
          ]}
          advancedFields={[
            { label: 'Transport', value: 'UDP' },
            { label: 'Port', value: '5060' },
          ]}
          statusLabel="Provisioning ready"
          statusTone="success"
          onDismiss={() => setSecrets(null)}
        />
      ))}
      <p>
        <Link href={`/platform/tenants/${tenantId}`}>Back to customer</Link>
        {' · '}
        <button type="button" className="btn btn-secondary" onClick={() => router.push(`/platform/tenants`)}>
          Customer list
        </button>
      </p>
    </>
  );
}
