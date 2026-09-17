'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type CronJobRow = {
  id: string;
  name: string;
  jobType: string;
  enabled: boolean;
  timezone: string;
};

export default function CronJobsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<CronJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [jobType, setJobType] = useState('night_mode');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CronJobRow[]>(`tenants/${tenantId}/telephony-cron-jobs`, tenantId);
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
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `tenants/${tenantId}/telephony-cron-jobs`,
        {
          name: name.trim(),
          jobType,
          enabled: true,
          schedule: { cron: '0 22 * * *' },
          timezone: 'UTC',
        },
        tenantId,
      );
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
      await api.delete(`tenants/${tenantId}/telephony-cron-jobs/${id}`, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('callflow.cronTitle')} description={t('callflow.cronDescription')} />
      {error ? <ErrorAlert message={error} /> : null}
      <form className="card" onSubmit={onCreate} style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('callflow.name')}
          aria-label={t('callflow.name')}
        />
        <input
          className="input"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          placeholder={t('callflow.cronJobType')}
          aria-label={t('callflow.cronJobType')}
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
                <th>{t('callflow.cronJobType')}</th>
                <th>{t('callflow.cronEnabled')}</th>
                <th>{t('callflow.cronTimezone')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.jobType}</td>
                  <td>{row.enabled ? t('callflow.cronYes') : t('callflow.cronNo')}</td>
                  <td>{row.timezone}</td>
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
