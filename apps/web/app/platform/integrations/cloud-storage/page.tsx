'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-api-error';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { CloudStorageConnectionSummary, PlatformCustomerSummary } from '@pbx/contracts';

type OAuthStatus = {
  googleDrive: boolean;
  microsoftOneDrive: boolean;
  redirectUriGoogle: string;
  redirectUriMicrosoft: string;
};

export default function PlatformCloudStoragePage() {
  const [connections, setConnections] = useState<CloudStorageConnectionSummary[] | null>(null);
  const [customers, setCustomers] = useState<PlatformCustomerSummary[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);

  useEffect(() => {
    void api
      .get<OAuthStatus>('platform/cloud-storage/oauth/status')
      .then((status) => setOauthStatus(status ?? null))
      .catch(() => setOauthStatus(null));
  }, []);

  async function loadAssignments(connectionId: string) {
    const tenantIds = await api.get<string[]>(`platform/cloud-storage/connections/${connectionId}/assignments`);
    setAssignments((prev) => ({ ...prev, [connectionId]: tenantIds }));
  }

  useEffect(() => {
    void Promise.all([
      api.get<CloudStorageConnectionSummary[]>('platform/cloud-storage/connections'),
      api.get<PlatformCustomerSummary[]>('tenants/customers/summary'),
    ])
      .then(async ([connRows, customerRows]) => {
        setConnections(connRows);
        setCustomers(customerRows);
        if (connRows[0]) {
          setSelectedConnection(connRows[0].id);
          await loadAssignments(connRows[0].id);
        }
      })
      .catch((err) => setError(formatApiError(err)));
  }, []);

  async function connect(provider: 'google_drive' | 'microsoft_onedrive') {
    setConnecting(provider);
    setError(null);
    try {
      const label = provider === 'google_drive' ? 'Google Drive' : 'OneDrive';
      const { authorizationUrl } = await api.get<{ authorizationUrl: string }>(
        `platform/cloud-storage/oauth/${provider}/start?displayName=${encodeURIComponent(`Platform ${label}`)}`,
      );
      window.location.href = authorizationUrl;
    } catch (err) {
      setError(formatApiError(err));
      setConnecting(null);
    }
  }

  async function assignTenant(connectionId: string, tenantId: string) {
    setError(null);
    try {
      await api.post(`platform/cloud-storage/connections/${connectionId}/assign/${tenantId}`, {});
      await loadAssignments(connectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    }
  }

  async function unassignTenant(connectionId: string, tenantId: string) {
    setError(null);
    try {
      await api.delete(`platform/cloud-storage/connections/${connectionId}/assign/${tenantId}`);
      await loadAssignments(connectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unassign failed');
    }
  }

  if (!connections) return <LoadingBlock />;

  const assignedSet = new Set(assignments[selectedConnection] ?? []);

  return (
    <>
      <PageHeader
        title="Google Drive & OneDrive"
        description="One-time OAuth app setup. Tenants connect their own accounts under Settings → Cloud backup."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {oauthStatus && !oauthStatus.googleDrive && !oauthStatus.microsoftOneDrive ? (
        <div className="alert alert-warning" role="note">
          <strong>OAuth not configured on the server.</strong> Add{' '}
          <code>GOOGLE_DRIVE_CLIENT_ID</code>, <code>GOOGLE_DRIVE_CLIENT_SECRET</code>,{' '}
          <code>MICROSOFT_ONEDRIVE_CLIENT_ID</code>, and <code>MICROSOFT_ONEDRIVE_CLIENT_SECRET</code> to{' '}
          <code>/opt/pbx/.env</code>, then restart <code>pbx-api</code>.
          <br />
          Google redirect URI: <code>{oauthStatus.redirectUriGoogle}</code>
          <br />
          Microsoft redirect URI: <code>{oauthStatus.redirectUriMicrosoft}</code>
        </div>
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Connect platform account</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={connecting !== null}
            onClick={() => void connect('google_drive')}
          >
            {connecting === 'google_drive' ? 'Redirecting…' : 'Connect Google Drive'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={connecting !== null}
            onClick={() => void connect('microsoft_onedrive')}
          >
            {connecting === 'microsoft_onedrive' ? 'Redirecting…' : 'Connect OneDrive'}
          </button>
        </div>
      </section>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Connected accounts</h2>
        {connections.length === 0 ? (
          <p className="muted">No platform cloud accounts connected yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Account</th>
                <th>Assigned tenants</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-link"
                      onClick={() => {
                        setSelectedConnection(row.id);
                        void loadAssignments(row.id);
                      }}
                    >
                      {row.displayName}
                    </button>
                  </td>
                  <td>{row.provider}</td>
                  <td>{row.accountEmail ?? row.accountName ?? '—'}</td>
                  <td>{(assignments[row.id] ?? []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {selectedConnection ? (
        <section className="card">
          <h2>Assign tenants</h2>
          <p className="muted">Only assigned tenants can use this connection. Their recordings remain isolated by tenant folder.</p>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Slug</th>
                <th>Assigned</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const isAssigned = assignedSet.has(customer.id);
                return (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.slug}</td>
                    <td>{isAssigned ? 'Yes' : 'No'}</td>
                    <td>
                      {isAssigned ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void unassignTenant(selectedConnection, customer.id)}
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void assignTenant(selectedConnection, customer.id)}
                        >
                          Assign
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
