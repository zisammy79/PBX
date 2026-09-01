'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-api-error';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { CloudStorageConnectionSummary, RecordingCloudExportSettings } from '@pbx/contracts';

type OAuthStatus = {
  googleDrive: boolean;
  microsoftOneDrive: boolean;
  redirectUriGoogle: string;
  redirectUriMicrosoft: string;
};

export default function TenantCloudStoragePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();
  const [cloudExport, setCloudExport] = useState<RecordingCloudExportSettings>({
    enabled: false,
    provider: null,
    connectionId: null,
    folderPath: null,
    isolationFolder: null,
  });
  const [cloudConnections, setCloudConnections] = useState<CloudStorageConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);

  const ownedConnections = cloudConnections.filter((c) => c.connectionSource === 'tenant_owned');

  async function loadData() {
    const [exportSettings, connections] = await Promise.all([
      api.get<RecordingCloudExportSettings>(`tenants/${tenantId}/cloud-storage/export-settings`, tenantId),
      api.get<CloudStorageConnectionSummary[]>(`tenants/${tenantId}/cloud-storage/connections`, tenantId),
    ]);
    setCloudExport(exportSettings);
    setCloudConnections(connections);
  }

  useEffect(() => {
    void api
      .get<OAuthStatus>(`tenants/${tenantId}/cloud-storage/oauth/status`, tenantId)
      .then((status) => setOauthStatus(status ?? null))
      .catch(() => setOauthStatus(null));
  }, [tenantId]);

  useEffect(() => {
    void loadData()
      .catch((err) => setError(formatApiError(err)))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      setMessage('Your Google or Microsoft account is connected. Call recordings will be saved to your cloud drive.');
    }
  }, [searchParams]);

  async function saveCloudExport() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.patch<RecordingCloudExportSettings>(
        `tenants/${tenantId}/cloud-storage/export-settings`,
        {
          enabled: cloudExport.enabled,
          provider: cloudExport.provider,
          connectionId: cloudExport.connectionId,
          folderPath: cloudExport.folderPath,
        },
        tenantId,
      );
      setCloudExport(updated);
      setMessage('Cloud backup settings saved.');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function connectCloud(provider: 'google_drive' | 'microsoft_onedrive') {
    setError(null);
    try {
      const label = provider === 'google_drive' ? 'Google Drive' : 'OneDrive';
      const { authorizationUrl } = await api.get<{ authorizationUrl: string }>(
        `tenants/${tenantId}/cloud-storage/oauth/${provider}/start?displayName=${encodeURIComponent(`My ${label}`)}`,
        tenantId,
      );
      window.location.href = authorizationUrl;
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Cloud backup"
        description="Save call recordings to your organization's Google Drive or OneDrive."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}
      {oauthStatus && !oauthStatus.googleDrive && !oauthStatus.microsoftOneDrive ? (
        <div className="alert alert-warning" role="note">
          <strong>Sign-in is not enabled yet.</strong> Your platform operator must register this PBX app with Google
          and Microsoft (one-time server setup). Then each tenant can connect their own account here.
        </div>
      ) : null}
      <section className="card section-card">
        <h2>Connect account</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Sign in with the account where recordings should be stored. Only your organization uses these credentials.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => void connectCloud('google_drive')}>
            Connect your Google Drive
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void connectCloud('microsoft_onedrive')}>
            Connect your OneDrive
          </button>
        </div>
        {ownedConnections.length > 0 ? (
          <ul className="muted" style={{ margin: 0 }}>
            {ownedConnections.map((c) => (
              <li key={c.id}>
                {c.provider === 'google_drive' ? 'Google Drive' : 'OneDrive'} —{' '}
                {c.accountEmail ?? c.accountName ?? 'connected'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No personal cloud account connected yet.</p>
        )}
      </section>
      <section className="card section-card">
        <h2>Automatic backup</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Upload each completed recording to your drive (default folder: <code>Call Recordings</code>).
        </p>
        <label className="field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={cloudExport.enabled}
            onChange={(e) => setCloudExport((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          <span>Save every call recording to my cloud account</span>
        </label>
        {cloudExport.enabled ? (
          <>
            <div className="field">
              <label className="label">Provider</label>
              <select
                className="input"
                value={cloudExport.provider ?? ''}
                onChange={(e) =>
                  setCloudExport((prev) => ({
                    ...prev,
                    provider: e.target.value as 'google_drive' | 'microsoft_onedrive',
                    connectionId: null,
                  }))
                }
              >
                <option value="">Select provider</option>
                <option value="google_drive">Google Drive</option>
                <option value="microsoft_onedrive">Microsoft OneDrive</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Your connected account</label>
              <select
                className="input"
                value={cloudExport.connectionId ?? ''}
                onChange={(e) => setCloudExport((prev) => ({ ...prev, connectionId: e.target.value || null }))}
              >
                <option value="">Select account</option>
                {ownedConnections
                  .filter((c) => c.provider === cloudExport.provider)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.accountEmail ?? c.accountName ?? c.displayName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Folder in your drive (optional)</label>
              <input
                className="input"
                value={cloudExport.folderPath ?? ''}
                onChange={(e) => setCloudExport((prev) => ({ ...prev, folderPath: e.target.value || null }))}
                placeholder="Call Recordings"
              />
              <p className="muted" style={{ marginTop: '0.35rem' }}>
                Recordings upload to: <code>{cloudExport.folderPath ?? 'Call Recordings'}</code> in your cloud account
              </p>
            </div>
          </>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveCloudExport()}>
          Save settings
        </button>
      </section>
    </>
  );
}
