'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type NamedRow = { id: string; name?: string; code?: string; shortCode?: string; numberPattern?: string; displayName?: string };

export function CallflowResourcePage({
  titleKey,
  apiPath,
  createBody,
  nameFields = ['name'],
}: {
  titleKey: string;
  apiPath: string;
  createBody: (name: string) => Record<string, unknown>;
  nameFields?: string[];
}) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<NamedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<NamedRow[]>(`tenants/${tenantId}/${apiPath}`, tenantId);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiPath, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`tenants/${tenantId}/${apiPath}`, createBody(name.trim()), tenantId);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`tenants/${tenantId}/${apiPath}/${id}`, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function labelOf(row: NamedRow) {
    for (const field of nameFields) {
      const value = (row as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) return value;
    }
    return row.id.slice(0, 8);
  }

  return (
    <div>
      <PageHeader title={t(titleKey)} description={t('callflow.comingSoon')} />
      {error ? <ErrorAlert message={error} /> : null}
      <form className="card" onSubmit={onCreate} style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('callflow.name')}
          aria-label={t('callflow.name')}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {t('callflow.create')}
        </button>
      </form>
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={t('callflow.empty')} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('callflow.name')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{labelOf(row)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void onDelete(row.id)}>
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
