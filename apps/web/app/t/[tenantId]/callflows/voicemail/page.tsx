'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { InlineAudioPlayer } from '@/components/telephony/inline-audio';

type VoicemailRow = {
  id: string;
  extensionId: string;
  callerNumber?: string | null;
  durationSeconds: number;
  isRead: boolean;
  createdAt: string;
};

export default function VoicemailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<VoicemailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<VoicemailRow[]>(`tenants/${tenantId}/voicemails`, tenantId);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`tenants/${tenantId}/voicemails/${id}/read`, { isRead: true }, tenantId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`tenants/${tenantId}/voicemails/${id}`, tenantId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('callflow.voicemailTitle')} description={t('callflow.voicemailDescription')} />
      {error ? <ErrorAlert message={error} /> : null}
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={t('callflow.voicemailEmpty')} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('callflow.voicemailCaller')}</th>
                <th>{t('callflow.voicemailDuration')}</th>
                <th>{t('callflow.voicemailReceived')}</th>
                <th>{t('callflow.voicemailStatus')}</th>
                <th>{t('callflow.voicemailPlay')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.callerNumber || '—'}</td>
                  <td>{row.durationSeconds}s</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.isRead ? t('callflow.voicemailRead') : t('callflow.voicemailUnread')}</td>
                  <td>
                    <InlineAudioPlayer
                      tenantId={tenantId}
                      contentPath={`tenants/${tenantId}/voicemails/${row.id}/content`}
                      label={t('callflow.voicemailPlay')}
                    />
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    {!row.isRead ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => void markRead(row.id)}
                      >
                        {t('callflow.voicemailMarkRead')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void onDelete(row.id)}
                    >
                      {t('callflow.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
