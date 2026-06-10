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
  StatusBanner,
} from '@/components/app-shell';

export default function AiAgentsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [agents, setAgents] = useState<Array<Record<string, unknown>>>([]);
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [extensions, setExtensions] = useState<Array<{ id: string; extensionNumber: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    routeNumber: '8000',
    providerConnectionId: '',
    transferExtensionId: '',
    provider: 'deterministic-test',
    model: 'deterministic-v1',
    language: 'en',
    systemInstructions: 'You are a helpful assistant.',
    openingMessage: 'Hello, how can I help?',
  });

  async function load() {
    setLoading(true);
    try {
      const [agentRows, providerRows, extRows] = await Promise.all([
        api.get<Array<Record<string, unknown>>>('ai/agents', tenantId),
        api.get<Array<{ id: string; name: string }>>('ai/provider-connections', tenantId),
        api.get<Array<{ id: string; extensionNumber: string }>>(`tenants/${tenantId}/extensions`, tenantId),
      ]);
      setAgents(agentRows);
      setProviders(providerRows);
      setExtensions(extRows);
      if (providerRows[0]) setForm((f) => ({ ...f, providerConnectionId: providerRows[0]!.id }));
      if (extRows[0]) setForm((f) => ({ ...f, transferExtensionId: extRows[0]!.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('ai/agents', form, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    }
  }

  return (
    <>
      <PageHeader title="AI agents" description="Configure voice agents and routing." />
      <StatusBanner externalAi />
      {error ? <ErrorAlert message={error} /> : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create agent</h2>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="agent-name">Name</label>
            <input id="agent-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="route">Route number</label>
            <input id="route" className="input" required value={form.routeNumber} onChange={(e) => setForm({ ...form, routeNumber: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="provider">Provider connection</label>
            <select id="provider" className="select" value={form.providerConnectionId} onChange={(e) => setForm({ ...form, providerConnectionId: e.target.value })}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="transfer">Transfer extension</label>
            <select id="transfer" className="select" value={form.transferExtensionId} onChange={(e) => setForm({ ...form, transferExtensionId: e.target.value })}>
              {extensions.map((ext) => (
                <option key={ext.id} value={ext.id}>{ext.extensionNumber}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Create agent</button>
        </form>
      </section>
      {loading ? (
        <LoadingBlock />
      ) : agents.length === 0 ? (
        <EmptyState title="No AI agents yet." />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Route</th>
                <th>Status</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={String(agent.id)}>
                  <td><Link href={`/t/${tenantId}/ai/agents/${String(agent.id)}`}>{String(agent.name)}</Link></td>
                  <td>{String(agent.routeNumber)}</td>
                  <td>{agent.isActive ? 'Active' : 'Disabled'}</td>
                  <td>{String(agent.activeVersionNumber ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
