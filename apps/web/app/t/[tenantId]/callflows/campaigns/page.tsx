'use client';

import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
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

type CampaignNumberRow = {
  id: string;
  number: string;
  attempts: number;
  lastStatus: string | null;
};

type PaginatedNumbers = {
  data: CampaignNumberRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

type ImportResult = {
  imported: number;
  skipped: { invalid: number; dnc: number; duplicate: number };
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [numbersText, setNumbersText] = useState('');
  const [skipDnc, setSkipDnc] = useState(false);
  const [numbersPage, setNumbersPage] = useState<PaginatedNumbers | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);

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

  const loadNumbers = useCallback(
    async (campaignId: string) => {
      try {
        const data = await api.get<PaginatedNumbers>(
          `tenants/${tenantId}/campaigns/${campaignId}/numbers?page=1&pageSize=50`,
          tenantId,
        );
        setNumbersPage(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load numbers');
      }
    },
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (expandedId) {
      void loadNumbers(expandedId);
    } else {
      setNumbersPage(null);
      setImportSummary(null);
    }
  }, [expandedId, loadNumbers]);

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
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function importNumbers(campaignId: string) {
    const numbers = numbersText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (numbers.length === 0) return;

    setBusy(true);
    setError(null);
    setImportSummary(null);
    try {
      const query = skipDnc ? '?skipDnc=true' : '';
      const result = await api.post<ImportResult>(
        `tenants/${tenantId}/campaigns/${campaignId}/numbers${query}`,
        { numbers },
        tenantId,
      );
      setNumbersText('');
      setImportSummary(
        `${t('callflow.campaignNumbersImported')}: ${result.imported}; ${t('callflow.campaignNumbersSkipped')}: invalid ${result.skipped.invalid}, DNC ${result.skipped.dnc}, duplicate ${result.skipped.duplicate}`,
      );
      await loadNumbers(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
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
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td>{row.technology}</td>
                      <td>{row.status}</td>
                      <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                        >
                          {t('callflow.campaignNumbersExpand')}
                        </button>
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
                    {expanded ? (
                      <tr>
                        <td colSpan={4}>
                          <h3>{t('callflow.campaignNumbersTitle')}</h3>
                          <p className="muted">{t('callflow.campaignNumbersHint')}</p>
                          <textarea
                            className="input"
                            rows={5}
                            value={numbersText}
                            onChange={(e) => setNumbersText(e.target.value)}
                            placeholder="+972501234567"
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                          />
                          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <input
                              type="checkbox"
                              checked={skipDnc}
                              onChange={(e) => setSkipDnc(e.target.checked)}
                            />
                            <span>{t('callflow.campaignNumbersSkipDnc')}</span>
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => void importNumbers(row.id)}
                          >
                            {t('callflow.campaignNumbersImport')}
                          </button>
                          {importSummary ? <p className="muted" style={{ marginTop: '0.75rem' }}>{importSummary}</p> : null}
                          {numbersPage ? (
                            <div style={{ marginTop: '1rem' }}>
                              <p className="muted">
                                {t('callflow.campaignNumbersCount')}: {numbersPage.pagination.totalItems}
                              </p>
                              {numbersPage.data.length > 0 ? (
                                <ul>
                                  {numbersPage.data.map((num) => (
                                    <li key={num.id}>
                                      {num.number}
                                      {num.lastStatus ? ` (${num.lastStatus})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
