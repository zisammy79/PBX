'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type TwilioStatus = {
  configured: boolean;
  accountSid: string | null;
  trunkSid: string | null;
  terminationSipUri: string | null;
  originationSipUri: string | null;
  publicIp: string | null;
  testDid: string | null;
  defaultCountry: string;
  numberAssignmentMode: string;
};

type TrunkStatus = {
  trunkSid?: string;
  originationUriMatches?: boolean;
  ipAclContainsPbx?: boolean;
  attachedNumberCount?: number;
};

export default function PlatformTwilioPage() {
  const [status, setStatus] = useState<TwilioStatus | null>(null);
  const [trunk, setTrunk] = useState<TrunkStatus | null>(null);
  const [numbers, setNumbers] = useState<Array<{ e164: string; trunkSid: string | null }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState('');
  const [extension, setExtension] = useState('100');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, t, n, tenantRows] = await Promise.all([
      api.get<TwilioStatus>('twilio/status'),
      api.get<TrunkStatus>('twilio/trunk').catch(() => null),
      api.get<{ numbers: Array<{ e164: string; trunkSid: string | null }> }>('twilio/numbers').then((r) => r.numbers),
      api.get<Array<{ id: string; name: string }>>('tenants'),
    ]);
    setStatus(s);
    setTrunk(t);
    setNumbers(n);
    setTenants(tenantRows);
    if (!tenantId && tenantRows[0]) setTenantId(tenantRows[0].id);
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Twilio status'));
  }, []);

  async function run(action: () => Promise<unknown>, okMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(okMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    if (error) return <ErrorAlert message={error} />;
    return <LoadingBlock />;
  }

  return (
    <>
      <PageHeader
        title="Twilio Elastic SIP Trunk"
        description="Platform Administration → Twilio Production trunk, test DID assignment, and Israeli number provisioning."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Configuration status</h2>
        <ul>
          <li>Configured: {status.configured ? 'Yes' : 'No — set TWILIO_* env vars on the API host'}</li>
          <li>Account SID: {status.accountSid ?? '—'}</li>
          <li>Trunk SID: {status.trunkSid ?? '—'}</li>
          <li>Origination URI: {status.originationSipUri ?? '—'}</li>
          <li>Public IP: {status.publicIp ?? '—'}</li>
          <li>Test DID (redacted): {status.testDid ?? '—'}</li>
          <li>Assignment mode: {status.numberAssignmentMode}</li>
        </ul>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={busy || !status.configured} onClick={() => void run(() => api.post('twilio/validate'), 'Credentials validated')}>
            Validate credentials
          </button>
          <button type="button" className="btn" disabled={busy || !status.configured} onClick={() => void run(() => api.post('twilio/trunk/sync'), 'Trunk synchronized')}>
            Sync trunk (origination + IP ACL)
          </button>
        </div>
      </div>

      {trunk ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2>Trunk health</h2>
          <ul>
            <li>Origination URI matches PBX: {trunk.originationUriMatches ? 'Yes' : 'No'}</li>
            <li>IP ACL contains PBX IP: {trunk.ipAclContainsPbx ? 'Yes' : 'No'}</li>
            <li>Numbers on trunk: {trunk.attachedNumberCount ?? 0}</li>
          </ul>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Owned Twilio numbers</h2>
        <table>
          <thead>
            <tr>
              <th>E.164</th>
              <th>On trunk</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map((n) => (
              <tr key={n.e164}>
                <td>{n.e164}</td>
                <td>{n.trunkSid ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Assign test DID to tenant</h2>
        <p>Use the already-purchased Israeli test landline before cutting over production IVR.</p>
        <label>
          Tenant
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inbound destination extension
          <input value={extension} onChange={(e) => setExtension(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !tenantId || !status.configured}
            onClick={() =>
              void run(
                () =>
                  api.post('twilio/numbers/assign-existing', {
                    tenantId,
                    inboundDestinationExtensionNumber: extension,
                  }),
                'Test DID assigned to tenant',
              )
            }
          >
            Assign test DID
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !tenantId || !status.configured}
            onClick={() =>
              void run(
                () =>
                  api.post('twilio/numbers/purchase-and-assign', {
                    tenantId,
                    inboundDestinationExtensionNumber: extension,
                  }),
                'Number purchased and assigned',
              )
            }
          >
            Purchase IL local number
          </button>
        </div>
      </div>
    </>
  );
}
