'use client';

import { FormEvent, useEffect, useState } from 'react';
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
};

type CreateResponse = {
  extension: Extension;
  sipCredential: { username: string; secret: string; domain: string };
};

export default function ExtensionsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretPanel, setSecretPanel] = useState<CreateResponse['sipCredential'] | null>(null);
  const [form, setForm] = useState({ extensionNumber: '', displayName: '' });

  async function load() {
    setLoading(true);
    try {
      const rows = await api.get<Extension[]>(`tenants/${tenantId}/extensions`, tenantId);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.post<CreateResponse>(
        `tenants/${tenantId}/extensions`,
        form,
        tenantId,
      );
      setSecretPanel(created.sipCredential);
      setForm({ extensionNumber: '', displayName: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create extension');
    }
  }

  return (
    <>
      <PageHeader title="Extensions" description="Manage extensions and SIP credentials." />
      {error ? <ErrorAlert message={error} /> : null}
      {secretPanel ? (
        <OneTimeSecretPanel
          title="SIP credentials (one-time display)"
          fields={[
            { label: 'Username', value: secretPanel.username },
            { label: 'Secret', value: secretPanel.secret },
            { label: 'Domain', value: secretPanel.domain },
          ]}
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
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ext) => (
                <tr key={ext.id}>
                  <td>
                    <Link href={`/t/${tenantId}/extensions/${ext.id}`}>{ext.extensionNumber}</Link>
                  </td>
                  <td>{ext.displayName}</td>
                  <td>{ext.status}</td>
                  <td>{formatDate(ext.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
