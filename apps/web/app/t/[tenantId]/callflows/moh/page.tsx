'use client';

import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type MediaRow = { id: string; name: string };
type MohRow = {
  id: string;
  name: string;
  mediaFileIds: string[];
  randomize: boolean;
  isDefault: boolean;
};

export default function MohPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<MohRow[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mohData, mediaData] = await Promise.all([
        api.get<MohRow[]>(`tenants/${tenantId}/moh-classes`, tenantId),
        api.get<MediaRow[]>(`tenants/${tenantId}/media-files`, tenantId),
      ]);
      setRows(Array.isArray(mohData) ? mohData : []);
      setMediaFiles(Array.isArray(mediaData) ? mediaData : []);
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
        `tenants/${tenantId}/moh-classes`,
        { name: name.trim(), mediaFileIds: [], randomize: false, isDefault: false },
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
      await api.delete(`tenants/${tenantId}/moh-classes/${id}`, tenantId);
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(row: MohRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setSelectedMedia(Array.isArray(row.mediaFileIds) ? row.mediaFileIds : []);
  }

  async function saveMedia(rowId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(
        `tenants/${tenantId}/moh-classes/${rowId}`,
        { mediaFileIds: selectedMedia },
        tenantId,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('callflow.mohTitle')} description={t('callflow.comingSoon')} />
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
                <th>{t('callflow.mohMediaFiles')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const mediaCount = Array.isArray(row.mediaFileIds) ? row.mediaFileIds.length : 0;
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td>{mediaCount > 0 ? mediaCount : t('callflow.mohNoMedia')}</td>
                      <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => toggleExpand(row)}
                        >
                          {t('callflow.mohMediaFiles')}
                        </button>
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
                    {expanded ? (
                      <tr key={`${row.id}-media`}>
                        <td colSpan={3}>
                          <p className="muted">{t('callflow.mohMediaHint')}</p>
                          {mediaFiles.length === 0 ? (
                            <p className="muted">{t('callflow.mediaEmpty')}</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {mediaFiles.map((file) => (
                                <label key={file.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedMedia.includes(file.id)}
                                    onChange={(e) => {
                                      setSelectedMedia((prev) =>
                                        e.target.checked
                                          ? [...prev, file.id]
                                          : prev.filter((id) => id !== file.id),
                                      );
                                    }}
                                  />
                                  <span>{file.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ marginTop: '0.75rem' }}
                            disabled={busy}
                            onClick={() => void saveMedia(row.id)}
                          >
                            {t('callflow.mohSaveMedia')}
                          </button>
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
