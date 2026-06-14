'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import {
  EmptyState,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
} from '@/components/app-shell';
import { OneTimeSecretPanel } from '@/components/ui-panels';

type Extension = {
  id: string;
  extensionNumber: string;
  displayName: string;
  status: string;
  createdAt: string;
  provisioning?: { status: string; reason?: string };
};

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

type SetupInfo = {
  transport: 'UDP';
  port: number;
  authUsernameSameAsUsername: true;
  outboundProxy: 'none';
};

type CreateResponse = {
  extension: Extension;
  sipCredential: { username: string; secret: string; domain: string };
  provisioning: { status: string; reason?: string };
  setup: SetupInfo;
};

function provisioningLabel(status?: string) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Provisioning failed';
    case 'provisioning':
      return 'Provisioning';
    case 'deleting':
      return 'Deleting';
    case 'deleted':
      return 'Deleted';
    default:
      return 'Pending';
  }
}

function registrationLabel(status?: RegistrationItem['registrationStatus']) {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'unknown':
      return 'Unknown';
    default:
      return 'Unknown';
  }
}

function registrationTone(status?: RegistrationItem['registrationStatus']) {
  switch (status) {
    case 'online':
      return 'success';
    case 'offline':
      return 'neutral';
    default:
      return 'warning';
  }
}

export default function ExtensionsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Extension[]>([]);
  const [registrationById, setRegistrationById] = useState<Map<string, RegistrationItem>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretPanel, setSecretPanel] = useState<{
    username: string;
    secret: string;
    domain: string;
    setup: SetupInfo;
    provisioning?: { status: string; reason?: string };
  } | null>(null);
  const [form, setForm] = useState({ extensionNumber: '', displayName: '' });

  async function loadExtensions() {
    const rows = await api.get<Extension[]>(`tenants/${tenantId}/extensions`, tenantId);
    setItems(rows);
  }

  const loadRegistration = useCallback(async () => {
    try {
      const batch = await api.get<RegistrationBatch>('extensions/registration-status', tenantId);
      setRegistrationById(new Map(batch.items.map((item) => [item.extensionId, item])));
    } catch {
      setRegistrationById(new Map());
    }
  }, [tenantId]);

  async function load() {
    setLoading(true);
    try {
      await Promise.all([loadExtensions(), loadRegistration()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRegistration();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadRegistration]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.post<CreateResponse>(
        `tenants/${tenantId}/extensions`,
        form,
        tenantId,
      );
      setSecretPanel({
        username: created.sipCredential.username,
        secret: created.sipCredential.secret,
        domain: created.sipCredential.domain,
        setup: created.setup,
        provisioning: created.provisioning,
      });
      setForm({ extensionNumber: '', displayName: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create extension');
    }
  }

  return (
    <>
      <PageHeader
        title="Extensions"
        description="Manage extensions and SIP credentials. Ready means configuration exists; Online means a phone is currently registered."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {secretPanel ? (
        <OneTimeSecretPanel
          title="SIP phone setup (one-time display)"
          intro="Enter the username, password, and domain into your SIP phone application."
          fields={[
            { label: 'Username', value: secretPanel.username },
            { label: 'Password', value: secretPanel.secret },
            { label: 'Domain', value: secretPanel.domain },
          ]}
          advancedFields={[
            { label: 'Transport', value: secretPanel.setup.transport },
            { label: 'Port', value: String(secretPanel.setup.port) },
            { label: 'Authentication username', value: 'same as username' },
            { label: 'Outbound proxy', value: secretPanel.setup.outboundProxy },
          ]}
          statusLabel={provisioningLabel(secretPanel.provisioning?.status)}
          statusTone={secretPanel.provisioning?.status === 'ready' ? 'success' : 'warning'}
          onDismiss={() => setSecretPanel(null)}
        />
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create extension</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="ext-num">
              Extension number
            </label>
            <input
              id="ext-num"
              className="input"
              required
              value={form.extensionNumber}
              onChange={(e) => setForm({ ...form, extensionNumber: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="ext-name">
              Display name
            </label>
            <input
              id="ext-name"
              className="input"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Create extension
          </button>
        </form>
      </section>
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title="No extensions yet." />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Enabled</th>
                <th>Provisioning</th>
                <th>Registration</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ext) => {
                const reg = registrationById.get(ext.id);
                return (
                  <tr key={ext.id}>
                    <td>
                      <Link href={`/t/${tenantId}/extensions/${ext.id}`}>{ext.extensionNumber}</Link>
                    </td>
                    <td>{ext.displayName}</td>
                    <td>{ext.status}</td>
                    <td>{provisioningLabel(ext.provisioning?.status)}</td>
                    <td>
                      <span className={`badge badge-${registrationTone(reg?.registrationStatus)}`}>
                        {registrationLabel(reg?.registrationStatus)}
                      </span>
                    </td>
                    <td>{formatDate(ext.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
