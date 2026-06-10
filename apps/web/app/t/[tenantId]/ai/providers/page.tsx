'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { externalValidationLabel } from '@/lib/format';
import {
  EmptyState,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBanner,
} from '@/components/app-shell';

type Provider = {
  id: string;
  name: string;
  providerType: string;
  externalValidationStatus: string;
  isActive: boolean;
  credentialKeyVersion?: string;
};

export default function AiProvidersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    providerType: 'deterministic-test',
    apiKey: '',
  });

  async function load() {
    setLoading(true);
    try {
      const rows = await api.get<Provider[]>('ai/provider-connections', tenantId);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
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
      await api.post(
        'ai/provider-connections',
        {
          name: form.name,
          providerType: form.providerType,
          credentials: { apiKey: form.apiKey },
        },
        tenantId,
      );
      setForm({ name: '', providerType: 'deterministic-test', apiKey: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create provider');
    }
  }

  return (
    <>
      <PageHeader title="AI provider connections" description="Configure AI providers for your tenant." />
      <StatusBanner externalAi />
      {error ? <ErrorAlert message={error} /> : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Add provider</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="providerType">
              Provider type
            </label>
            <select id="providerType" className="select" value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
              <option value="deterministic-test">deterministic-test</option>
              <option value="openai">openai</option>
              <option value="gemini">gemini</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="apiKey">
              Credential (stored encrypted; not shown again)
            </label>
            <input id="apiKey" className="input" type="password" required value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">
            Save provider
          </button>
        </form>
      </section>
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title="No provider connections yet." />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Validation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/t/${tenantId}/ai/providers/${item.id}`}>{item.name}</Link>
                  </td>
                  <td>{item.providerType}</td>
                  <td>{externalValidationLabel(item.externalValidationStatus)}</td>
                  <td>{item.isActive ? 'Enabled' : 'Disabled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
