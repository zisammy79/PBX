'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function AiSessionDetailPage() {
  const { tenantId, sessionId } = useParams<{ tenantId: string; sessionId: string }>();
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [tools, setTools] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get(`ai/sessions/${sessionId}`, tenantId),
      api.get(`ai/sessions/${sessionId}/diagnostics`, tenantId),
      api.get(`ai/sessions/${sessionId}/tools`, tenantId),
    ])
      .then(([s, d, t]) => {
        setSession(s as Record<string, unknown>);
        setDiagnostics(d as Record<string, unknown>);
        setTools((t as { items?: Array<Record<string, unknown>> }).items ?? (t as Array<Record<string, unknown>>));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load session'));
  }, [tenantId, sessionId]);

  if (error) return <ErrorAlert message={error} />;
  if (!session) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="AI session" description={`Status: ${String(session.status)}`} />
      <StatusBanner externalAi providerCost />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Started: {formatDate(String(session.startedAt))}</p>
        <p>Ended: {formatDate(session.endedAt ? String(session.endedAt) : null)}</p>
        <p>Measurement origin: Platform measured</p>
      </div>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Diagnostics</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      </section>
      <section className="card">
        <h2>Tool invocations</h2>
        {tools.length === 0 ? (
          <p className="muted">No tool invocations recorded.</p>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(tools, null, 2)}</pre>
        )}
      </section>
    </>
  );
}
