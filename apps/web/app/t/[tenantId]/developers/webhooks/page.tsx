'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { OneTimeSecretPanel } from '@/components/ui-panels';

export default function WebhooksPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [endpoints, setEndpoints] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', description: '' });

  async function load() {
    const rows = await api.get<Array<Record<string, unknown>>>('webhooks', tenantId);
    setEndpoints(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [tenantId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await api.post<{ signingSecret: string }>(
        'webhooks',
        {
          url: form.url,
          description: form.description,
          eventTypes: ['call.completed', 'invoice.finalized'],
        },
        tenantId,
      );
      setSigningSecret(created.signingSecret);
      setForm({ url: '', description: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    }
  }

  return (
    <>
      <PageHeader title="Webhooks" description="Outbound HTTPS event delivery with HMAC signatures." />
      <p className="muted">
        Signing secrets are shown once and never returned on read. Operational events: call.* and
        invoice.* — AI and registration events remain deferred.
      </p>
      {error ? <ErrorAlert message={error} /> : null}
      {signingSecret ? (
        <OneTimeSecretPanel
          title="Webhook signing secret (one-time display)"
          fields={[{ label: 'Signing secret', value: signingSecret }]}
          onDismiss={() => setSigningSecret(null)}
        />
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create endpoint</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="wh-url">HTTPS URL</label>
            <input id="wh-url" className="input" required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Create endpoint</button>
        </form>
      </section>
      {!endpoints ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Failures</th></tr></thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={String(ep.id)}>
                  <td>{String(ep.url)}</td>
                  <td>{Array.isArray(ep.eventTypes) ? ep.eventTypes.join(', ') : '—'}</td>
                  <td>{ep.isActive ? 'Enabled' : 'Disabled'}</td>
                  <td>{String(ep.failureCount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
