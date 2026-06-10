'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function AiToolsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: 'http_webhook',
    displayName: 'Webhook tool',
    url: 'https://example.com/hook',
    allowedDomains: 'example.com',
    timeoutMs: 3000,
  });

  async function load() {
    const rows = await api.get<Array<Record<string, unknown>>>('ai/tools', tenantId);
    setItems(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tools'));
  }, [tenantId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(
        'ai/tools',
        {
          name: form.name,
          displayName: form.displayName,
          config:
            form.name === 'http_webhook'
              ? {
                  url: form.url,
                  allowedDomains: form.allowedDomains.split(',').map((d) => d.trim()),
                  timeoutMs: form.timeoutMs,
                  requireHttps: true,
                }
              : {},
        },
        tenantId,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tool');
    }
  }

  if (error) return <ErrorAlert message={error} />;

  return (
    <>
      <PageHeader title="AI tools" description="Configure allowed agent tools." />
      <div className="alert alert-warning" role="status">
        HTTP webhook tools require HTTPS and an explicit domain allowlist. Test webhooks are not executed from the browser.
      </div>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create tool</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="tool-name">Tool type</label>
            <select id="tool-name" className="select" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>
              <option value="transfer_call">transfer_call</option>
              <option value="end_call">end_call</option>
              <option value="http_webhook">http_webhook</option>
            </select>
          </div>
          {form.name === 'http_webhook' ? (
            <>
              <div className="field">
                <label className="label" htmlFor="url">HTTPS URL</label>
                <input id="url" className="input" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              </div>
              <div className="field">
                <label className="label" htmlFor="domains">Allowed domains (comma-separated)</label>
                <input id="domains" className="input" required value={form.allowedDomains} onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })} />
              </div>
            </>
          ) : null}
          <button type="submit" className="btn btn-primary">Create tool</button>
        </form>
      </section>
      {!items ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Display name</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tool) => (
                <tr key={String(tool.id)}>
                  <td>{String(tool.name)}</td>
                  <td>{String(tool.displayName ?? tool.name)}</td>
                  <td>{tool.isEnabled === false ? 'Disabled' : 'Enabled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
