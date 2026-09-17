'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type CampaignRow = {
  id: string;
  name: string;
  technology: string;
  status: string;
  maxConcurrent: number;
  maxAttempts: number;
};

export default function CampaignsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [technology, setTechnology] = useState('voice');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CampaignRow[]>(`tenants/${tenantId}/campaigns`, tenantId);
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
        `tenants/${tenantId}/campaigns`,
        { name: name.trim(), technology, maxConcurrent: 1, maxAttempts: 3 },
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

  async function tickCampaign(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`tenants/${tenantId}/campaigns/${id}/tick`, {}, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tick failed');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: 'start' | 'pause' | 'stop') {
    setBusy(true);
    setError(null);
    try {
      await api.post(`tenants/${tenantId}/campaigns/${id}/${action}`, {}, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`tenants/${tenantId}/campaigns/${id}`, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('callflow.campaignsTitle')} description={t('callflow.campaignsDescription')} />
      {error ? <ErrorAlert message={error} /> : null}
      <form className="card" onSubmit={onCreate} style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('callflow.name')}
          aria-label={t('callflow.name')}
        />
        <select className="input" value={technology} onChange={(e) => setTechnology(e.target.value)} aria-label={t('callflow.campaignTechnology')}>
          <option value="voice">{t('callflow.campaignVoice')}</option>
          <option value="sms">{t('callflow.campaignSms')}</option>
          <option value="fax">{t('callflow.campaignFax')}</option>
        </select>
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
                <th>{t('callflow.campaignTechnology')}</th>
                <th>{t('callflow.campaignStatus')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.technology}</td>
                  <td>{row.status}</td>
                  <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {row.status !== 'running' && row.status !== 'completed' ? (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(row.id, 'start')}>
                        {t('callflow.campaignStart')}
                      </button>
                    ) : null}
                    {row.status === 'running' ? (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(row.id, 'pause')}>
                          {t('callflow.campaignPause')}
                        </button>
                        {row.technology === 'voice' ? (
                          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void tickCampaign(row.id)}>
                            {t('callflow.campaignTick')}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {row.status !== 'completed' ? (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(row.id, 'stop')}>
                        {t('callflow.campaignStop')}
                      </button>
                    ) : null}
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
