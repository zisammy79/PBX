'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type ButtonLayoutRow = {
  id: string;
  name: string;
  vendorTemplate: string;
  lineStart: number;
  lineEnd: number;
};

const VENDOR_OPTIONS = [
  { id: 'generic', labelKey: 'callflow.provisioningVendorGeneric' },
  { id: 'yealink', labelKey: 'callflow.provisioningVendorYealink' },
  { id: 'fanvil', labelKey: 'callflow.provisioningVendorFanvil' },
] as const;

export default function ProvisioningPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<ButtonLayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [vendorTemplate, setVendorTemplate] = useState('generic');
  const [lineStart, setLineStart] = useState(1);
  const [lineEnd, setLineEnd] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ButtonLayoutRow[]>(`tenants/${tenantId}/button-layouts`, tenantId);
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
    if (lineEnd < lineStart) {
      setError(t('callflow.provisioningLineRangeError'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `tenants/${tenantId}/button-layouts`,
        { name: name.trim(), vendorTemplate, lineStart, lineEnd, buttons: [] },
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

  async function onDownload(row: ButtonLayoutRow) {
    setBusy(true);
    setError(null);
    try {
      const vendor = encodeURIComponent(row.vendorTemplate || 'generic');
      const res = await fetch(
        `/api/backend/tenants/${tenantId}/button-layouts/${row.id}/provisioning-file?vendor=${vendor}`,
        {
          credentials: 'same-origin',
          headers: { 'X-Tenant-Id': tenantId },
        },
      );
      if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${row.name}.${row.vendorTemplate === 'generic' ? 'json' : 'xml'}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`tenants/${tenantId}/button-layouts/${id}`, tenantId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('callflow.provisioningTitle')}
        description={t('callflow.provisioningDescription')}
      />
      {error ? <ErrorAlert message={error} /> : null}
      <form
        className="card"
        onSubmit={onCreate}
        style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('callflow.name')}
          aria-label={t('callflow.name')}
        />
        <select
          className="input"
          value={vendorTemplate}
          onChange={(e) => setVendorTemplate(e.target.value)}
          aria-label={t('callflow.provisioningVendorTemplate')}
        >
          {VENDOR_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <span className="muted">{t('callflow.provisioningLineStart')}</span>
          <input
            className="input"
            type="number"
            min={1}
            max={999}
            value={lineStart}
            onChange={(e) => setLineStart(Number(e.target.value))}
            aria-label={t('callflow.provisioningLineStart')}
            style={{ width: '5rem' }}
          />
        </label>
        <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <span className="muted">{t('callflow.provisioningLineEnd')}</span>
          <input
            className="input"
            type="number"
            min={1}
            max={999}
            value={lineEnd}
            onChange={(e) => setLineEnd(Number(e.target.value))}
            aria-label={t('callflow.provisioningLineEnd')}
            style={{ width: '5rem' }}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {t('callflow.create')}
        </button>
      </form>
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={t('callflow.provisioningEmpty')} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('callflow.name')}</th>
                <th>{t('callflow.provisioningVendorTemplate')}</th>
                <th>{t('callflow.provisioningLineRange')}</th>
                <th>{t('callflow.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.vendorTemplate}</td>
                  <td>
                    {row.lineStart}–{row.lineEnd}
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void onDownload(row)}
                    >
                      {t('callflow.provisioningDownload')}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
