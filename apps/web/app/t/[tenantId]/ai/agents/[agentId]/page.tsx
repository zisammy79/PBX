'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui-panels';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function AiAgentDetailPage() {
  const { tenantId, agentId } = useParams<{ tenantId: string; agentId: string }>();
  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([]);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [detail, vers] = await Promise.all([
      api.get<Record<string, unknown>>(`ai/agents/${agentId}`, tenantId),
      api.get<Array<Record<string, unknown>>>(`ai/agents/${agentId}/versions`, tenantId),
    ]);
    setAgent(detail);
    setVersions(vers);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load agent'));
  }, [tenantId, agentId]);

  if (error) return <ErrorAlert message={error} />;
  if (!agent) return <LoadingBlock />;

  return (
    <>
      <PageHeader title={String(agent.name)} description={`Route ${String(agent.routeNumber)}`} />
      <StatusBanner externalAi />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Status: {agent.isActive ? 'Active' : 'Disabled'}</p>
        <p>Model: {String(agent.model ?? '—')}</p>
        <p>Language: {String(agent.language ?? '—')}</p>
        <p>Active version: {String(agent.activeVersionNumber ?? '—')}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => void api.post(`ai/agents/${agentId}/activate`, {}, tenantId).then(load)}>
            Activate
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmDisable(true)}>
            Disable
          </button>
        </div>
      </div>
      <section className="card">
        <h2>Version history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={String(v.id)}>
                  <td>{String(v.versionNumber)}</td>
                  <td>{formatDate(String(v.createdAt))}</td>
                  <td>{String(v.model)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog
        open={confirmDisable}
        title="Disable agent"
        message="This agent will stop accepting new AI calls until reactivated."
        confirmLabel="Disable"
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => {
          setConfirmDisable(false);
          void api.post(`ai/agents/${agentId}/disable`, {}, tenantId).then(load);
        }}
      />
    </>
  );
}
