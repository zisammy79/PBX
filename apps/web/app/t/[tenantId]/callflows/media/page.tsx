'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type MediaRow = {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
};

export default function Page() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MediaRow[]>(`tenants/${tenantId}/media-files`, tenantId);
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

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (name.trim()) form.append('name', name.trim());
      const res = await fetch(`/api/backend/tenants/${tenantId}/media-files/upload`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Upload failed (${res.status})`);
      }
      setName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`tenants/${tenantId}/media-files/${id}`, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <Link href={`/t/${tenantId}/callflows/moh`} className="btn btn-secondary">
          {t('callflow.mohLink')}
        </Link>
      </div>
      <PageHeader title={t('callflow.mediaTitle')} description={t('callflow.mediaDescription')} />
      {error ? <ErrorAlert message={error} /> : null}

      <form className="card" onSubmit={(e) => void onUpload(e)} style={{ marginBottom: '1rem' }}>
        <h2>{t('callflow.mediaUploadTitle')}</h2>
        <p className="muted">{t('callflow.mediaUploadHint')}</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.ulaw,.ul,audio/wav,audio/mpeg,audio/basic"
            aria-label={t('callflow.mediaUploadFile')}
          />
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('callflow.mediaUploadName')}
            aria-label={t('callflow.mediaUploadName')}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t('callflow.mediaUploadSubmit')}
          </button>
        </div>
      </form>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={t('callflow.mediaEmpty')} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('callflow.name')}</th>
                <th>{t('callflow.mediaFormat')}</th>
                <th>{t('callflow.mediaSize')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.format}</td>
                  <td>{row.sizeBytes}</td>
                  <td>
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
