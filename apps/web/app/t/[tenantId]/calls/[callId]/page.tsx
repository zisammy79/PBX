'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate, formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function CallDetailPage() {
  const { tenantId, callId } = useParams<{ tenantId: string; callId: string }>();
  const [call, setCall] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Record<string, unknown>>(`calls/${callId}`, tenantId)
      .then(setCall)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load call'));
  }, [tenantId, callId]);

  if (error) return <ErrorAlert message={error} />;
  if (!call) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Call details" description={`Status: ${String(call.status)}`} />
      <div className="card">
        <dl>
          <dt>Direction</dt>
          <dd>{String(call.direction)}</dd>
          <dt>From</dt>
          <dd>{String(call.callerNumber ?? '—')}</dd>
          <dt>To</dt>
          <dd>{String(call.calleeNumber ?? '—')}</dd>
          <dt>Started</dt>
          <dd>{formatDate(String(call.startedAt))}</dd>
          <dt>Answered</dt>
          <dd>{formatDate(call.answeredAt ? String(call.answeredAt) : null)}</dd>
          <dt>Ended</dt>
          <dd>{formatDate(call.endedAt ? String(call.endedAt) : null)}</dd>
          <dt>Duration</dt>
          <dd>{formatDuration(call.durationSeconds as number | null)}</dd>
          <dt>Hangup cause</dt>
          <dd>{String(call.hangupCause ?? '—')}</dd>
        </dl>
        <details style={{ marginTop: '1rem' }}>
          <summary>Advanced identifiers</summary>
          <p className="muted">Correlation ID: {String(call.correlationId)}</p>
          <p className="muted">Call ID: {String(call.id)}</p>
        </details>
      </div>
    </>
  );
}
