'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type FaxRow = {
  id: string;
  direction: string;
  remoteNumber: string;
  localNumber: string;
  status: string;
  pages: number;
  createdAt: string;
};

export default function FaxesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<FaxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteNumber, setRemoteNumber] = useState('');
  const [localNumber, setLocalNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<FaxRow[]>(`tenants/${tenantId}/faxes`, tenantId);
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!remoteNumber.trim() || !localNumber.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `tenants/${tenantId}/faxes`,
        { remoteNumber: remoteNumber.trim(), localNumber: localNumber.trim(), pages: 0 },
        tenantId,
      );
      setRemoteNumber('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`tenants/${tenantId}/faxes/${id}/read`, { isRead: true }, tenantId);
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
      await api.delete(`tenants/${tenantId}/faxes/${id}`, tenantId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('callflow.faxesTitle')} description={t('callflow.faxesDescription')} />
      {error ? <ErrorAlert message={error} /> : null}
      <form
        className="card"
        onSubmit={onCreate}
        style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}
      >
        <input
          className="input"
          value={remoteNumber}
          onChange={(e) => setRemoteNumber(e.target.value)}
          placeholder={t('callflow.faxesRemoteNumber')}
          aria-label={t('callflow.faxesRemoteNumber')}
        />
        <input
          className="input"
          value={localNumber}
          onChange={(e) => setLocalNumber(e.target.value)}
          placeholder={t('callflow.faxesLocalNumber')}
          aria-label={t('callflow.faxesLocalNumber')}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {t('callflow.faxesQueueOutbound')}
        </button>
      </form>
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={t('callflow.faxesEmpty')} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('callflow.faxesDirection')}</th>
                <th>{t('callflow.faxesRemoteNumber')}</th>
                <th>{t('callflow.faxesLocalNumber')}</th>
                <th>{t('callflow.faxesStatus')}</th>
                <th>{t('callflow.faxesPages')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.direction}</td>
                  <td>{row.remoteNumber}</td>
                  <td>{row.localNumber}</td>
                  <td>{row.status}</td>
                  <td>{row.pages}</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    {row.status !== 'read' ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => void markRead(row.id)}
                      >
                        {t('callflow.faxesMarkRead')}
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
