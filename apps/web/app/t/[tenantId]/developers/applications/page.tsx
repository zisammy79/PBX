'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { OneTimeSecretPanel } from '@/components/ui-panels';

export default function ApiApplicationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [apps, setApps] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  async function load() {
    const rows = await api.get<Array<Record<string, unknown>>>('api-applications', tenantId);
    setApps(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [tenantId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(
        'api-applications',
        {
          name: form.name,
          description: form.description,
          scopes: ['calls.read', 'extensions.read'],
        },
        tenantId,
      );
      setForm({ name: '', description: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application');
    }
  }

  async function onCreateKey(appId: string) {
    try {
      const created = await api.post<{ secret: string }>(
        `api-applications/${appId}/keys`,
        { displayName: 'Default key' },
        tenantId,
      );
      setSecret(created.secret);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    }
  }

  return (
    <>
      <PageHeader title="API Applications" description="Manage programmatic access for your tenant." />
      {error ? <ErrorAlert message={error} /> : null}
      {secret ? (
        <OneTimeSecretPanel
          title="API key (one-time display)"
          fields={[{ label: 'API key', value: secret }]}
          onDismiss={() => setSecret(null)}
        />
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create application</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="app-name">Name</label>
            <input id="app-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Create application</button>
        </form>
      </section>
      {!apps ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Scopes</th><th>Actions</th></tr></thead>
            <tbody>
              {apps.map((app) => (
                <tr key={String(app.id)}>
                  <td>{String(app.name)}</td>
                  <td>{String(app.status)}</td>
                  <td>{Array.isArray(app.scopes) ? app.scopes.join(', ') : '—'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => void onCreateKey(String(app.id))}>
                      Create key
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
