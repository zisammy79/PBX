'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate, formatDuration } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type RecordingItem = {
  id: string;
  callId: string;
  status: string;
  mimeType: string | null;
  format: string | null;
  durationMs: number | null;
  fileSizeBytes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  playbackAvailable: boolean;
  failureCode: string | null;
  playbackUrl?: string;
};

function statusLabel(status: string) {
  switch (status) {
    case 'available':
      return 'Ready';
    case 'starting':
    case 'pending':
      return 'Starting';
    case 'recording':
      return 'Recording in progress';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    case 'deleted':
      return 'Deleted';
    default:
      return status;
  }
}

function statusMessage(row: RecordingItem) {
  switch (row.status) {
    case 'starting':
    case 'pending':
      return 'Recording is starting';
    case 'recording':
      return 'Recording in progress';
    case 'processing':
      return 'Recording is processing';
    case 'failed':
      return row.failureCode ? `Recording failed (${row.failureCode})` : 'Recording failed';
    case 'available':
      return 'Recording available';
    default:
      return statusLabel(row.status);
  }
}

export default function CallDetailPage() {
  const { tenantId, callId } = useParams<{ tenantId: string; callId: string }>();
  const [call, setCall] = useState<Record<string, unknown> | null>(null);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadRecordings = useCallback(async () => {
    const rows = await api.get<RecordingItem[]>(
      `tenants/${tenantId}/calls/${callId}/recordings`,
      tenantId,
    );
    setRecordings(rows);
  }, [tenantId, callId]);

  useEffect(() => {
    void Promise.all([
      api.get<Record<string, unknown>>(`calls/${callId}`, tenantId).then(setCall),
      loadRecordings(),
    ]).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load call'));
  }, [tenantId, callId, loadRecordings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRecordings().catch(() => undefined);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadRecordings]);

  async function playRecording(recording: RecordingItem) {
    setPlaybackError(null);
    if (activeRecordingId === recording.id) {
      audioRef.current?.pause();
      if (playbackUrl?.startsWith('blob:')) URL.revokeObjectURL(playbackUrl);
      setActiveRecordingId(null);
      setPlaybackUrl(null);
      return;
    }
    try {
      const blobUrl = await api.fetchBlob(
        `tenants/${tenantId}/recordings/${recording.id}/content`,
        tenantId,
      );
      if (playbackUrl?.startsWith('blob:')) URL.revokeObjectURL(playbackUrl);
      setPlaybackUrl(blobUrl);
      setActiveRecordingId(recording.id);
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Playback unavailable');
    }
  }

  if (error) return <ErrorAlert message={error} />;
  if (!call) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Call details" description={`Status: ${String(call.status)}`} />
      <div className="card" style={{ marginBottom: '1rem' }}>
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
      </div>

      <section className="card">
        <h2>Recordings</h2>
        {playbackError ? <ErrorAlert message={playbackError} /> : null}
        {recordings.length === 0 ? (
          <p className="muted">No recordings for this call.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Size</th>
                  <th>Playback</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div>{statusLabel(row.status)}</div>
                      <div className="muted">{statusMessage(row)}</div>
                    </td>
                    <td>{row.startedAt ? formatDate(row.startedAt) : '—'}</td>
                    <td>
                      {row.durationMs != null
                        ? formatDuration(Math.round(row.durationMs / 1000))
                        : '—'}
                    </td>
                    <td>{row.fileSizeBytes != null ? `${row.fileSizeBytes} B` : '—'}</td>
                    <td>
                      {row.playbackAvailable ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void playRecording(row)}
                        >
                          {activeRecordingId === row.id ? 'Stop' : 'Play'}
                        </button>
                      ) : (
                        <span className="muted">
                          {row.status === 'failed'
                            ? row.failureCode ?? 'Unavailable'
                            : 'Unavailable'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {playbackUrl ? (
          <audio
            ref={audioRef}
            controls
            preload="none"
            src={playbackUrl}
            style={{ width: '100%', marginTop: '1rem' }}
          />
        ) : null}
      </section>
    </>
  );
}
