'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { recordingBrowserContentPath } from '@/lib/recording-playback';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { ConfirmDialog, OneTimeSecretPanel } from '@/components/ui-panels';

type RecordingItem = {
  id: string;
  callId: string;
  status: string;
  direction: string;
  remoteParty: string | null;
  callStatus: string;
  startedAt: string;
  callDurationSeconds: number | null;
  recordingDurationSeconds: number | null;
  format: string | null;
  playbackAvailable: boolean;
};

type RecordingsPage = {
  data: RecordingItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

function provisioningLabel(status?: string) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Provisioning failed';
    case 'provisioning':
      return 'Provisioning';
    case 'deleting':
      return 'Deleting';
    case 'deleted':
      return 'Deleted';
    default:
      return 'Pending';
  }
}

function recordingStatusLabel(status: string) {
  switch (status) {
    case 'available':
      return 'Available';
    case 'processing':
      return 'Processing';
    case 'pending':
    case 'recording':
      return 'Processing';
    case 'failed':
      return 'Failed';
    case 'deleted':
      return 'Unavailable';
    default:
      return status;
  }
}

function registrationLabel(status?: 'online' | 'offline' | 'unknown') {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'unknown':
      return 'Unknown';
    default:
      return 'Unknown';
  }
}

export default function ExtensionDetailPage() {
  const router = useRouter();
  const { tenantId, extensionId } = useParams<{ tenantId: string; extensionId: string }>();
  const [data, setData] = useState<{
    extension: {
      extensionNumber: string;
      displayName: string;
      status: string;
      createdAt: string;
    };
    sipCredential: { username: string; secretVersion: number; createdAt: string } | null;
    sipDomain: string | null;
    provisioning: { status: string; reason?: string };
    setup: {
      transport: 'UDP';
      port: number;
      authUsernameSameAsUsername: true;
      outboundProxy: 'none';
    };
    recordingPolicyMode?: 'inherit' | 'on' | 'off';
    recordingEffective?: {
      orgRecordCallsByDefault: boolean;
      effectiveRecordingEnabled: boolean;
    };
  } | null>(null);
  const [recordings, setRecordings] = useState<RecordingsPage | null>(null);
  const [registration, setRegistration] = useState<{
    registrationStatus: 'online' | 'offline' | 'unknown';
    endpointState: string | null;
    contactCount: number;
    lastObservedAt: string;
    asteriskReachable: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secretPanel, setSecretPanel] = useState<{
    username: string;
    secret: string;
    domain: string;
    setup: typeof data extends null ? never : NonNullable<typeof data>['setup'];
    provisioning: { status: string; reason?: string };
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [devices, setDevices] = useState<Array<{
    id: string;
    name: string;
    deviceType: string;
    status: string;
    provisioningStatus: string;
    sipUsername: string | null;
    registrationStatus: string | null;
  }> | null>(null);
  const [devicesWarning, setDevicesWarning] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function loadRecordings(page = 1) {
    const rows = await api.get<RecordingsPage>(
      `tenants/${tenantId}/extensions/${extensionId}/recordings?page=${page}&pageSize=10`,
      tenantId,
    );
    setRecordings(rows);
  }

  async function loadRegistration() {
    const reg = await api.get<NonNullable<typeof registration>>(
      `extensions/${extensionId}/registration`,
      tenantId,
    );
    setRegistration(reg);
  }

  async function loadDevices() {
    try {
      const rows = await api.get<NonNullable<typeof devices>>(
        `tenants/${tenantId}/extensions/${extensionId}/devices`,
        tenantId,
      );
      setDevices(rows);
      setDevicesWarning(null);
    } catch (err) {
      setDevices([]);
      setDevicesWarning(
        err instanceof Error ? err.message : 'Device list could not be loaded.',
      );
    }
  }

  async function load() {
    const detail = await api.get(`tenants/${tenantId}/extensions/${extensionId}`, tenantId);
    setData(detail as typeof data);
    await Promise.all([loadRegistration(), loadRecordings(1), loadDevices()]);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load extension'),
    );
  }, [tenantId, extensionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRegistration().catch(() => undefined);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [tenantId, extensionId]);

  async function reconcile(rotateCredential = false) {
    setBusy(true);
    setActionMessage(null);
    setError(null);
    try {
      const result = await api.post<{
        sipCredential?: { username: string; secret: string; domain: string };
        setup?: NonNullable<typeof data>['setup'];
        provisioning: { status: string; reason?: string };
      }>(
        `tenants/${tenantId}/extensions/${extensionId}/reconcile`,
        rotateCredential ? { rotateCredential: true } : {},
        tenantId,
      );
      if (result.sipCredential && result.setup) {
        setSecretPanel({
          username: result.sipCredential.username,
          secret: result.sipCredential.secret,
          domain: result.sipCredential.domain,
          setup: result.setup,
          provisioning: result.provisioning,
        });
      } else {
        setActionMessage(
          rotateCredential
            ? 'Credential rotated and provisioning reconciled.'
            : 'Provisioning reconciled.',
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setBusy(false);
    }
  }

  async function rotateCredential() {
    setBusy(true);
    setActionMessage(null);
    setError(null);
    try {
      const result = await api.post<{
        sipCredential: { username: string; secret: string; domain: string };
        setup: NonNullable<typeof data>['setup'];
        provisioning: { status: string; reason?: string };
      }>(`tenants/${tenantId}/extensions/${extensionId}/rotate-credential`, {}, tenantId);
      setSecretPanel({
        username: result.sipCredential.username,
        secret: result.sipCredential.secret,
        domain: result.sipCredential.domain,
        setup: result.setup,
        provisioning: result.provisioning,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credential rotation failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteExtension() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.delete<{
        provisioning: { status: string; reason?: string };
      }>(`tenants/${tenantId}/extensions/${extensionId}`, tenantId);
      setDeleteOpen(false);
      if (result.provisioning.status === 'deleted') {
        router.push(`/t/${tenantId}/extensions`);
        return;
      }
      setError(
        result.provisioning.reason
          ? `Deletion incomplete: ${result.provisioning.reason}`
          : 'Deletion failed. Retry after resolving provisioning.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function playRecording(recordingId: string) {
    setPlaybackError(null);
    if (playingId === recordingId && playbackUrl) {
      audioRef.current?.pause();
      setPlayingId(null);
      setPlaybackUrl(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(recordingId);
    setPlaybackUrl(recordingBrowserContentPath(tenantId, recordingId));
  }

  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const isDeleted = data.extension.status === 'disabled' || data.provisioning.status === 'deleted';

  return (
    <>
      <PageHeader
        title={`Extension ${data.extension.extensionNumber}`}
        description={data.extension.displayName}
      />
      {error ? <ErrorAlert message={error} /> : null}
      {actionMessage ? <div className="alert alert-success">{actionMessage}</div> : null}
      {secretPanel ? (
        <OneTimeSecretPanel
          title="New SIP password"
          intro="This password is shown only once. Save it before closing this window."
          fields={[
            { label: 'Username', value: secretPanel.username },
            { label: 'Password', value: secretPanel.secret },
            { label: 'Domain', value: secretPanel.domain },
          ]}
          advancedFields={[
            { label: 'Transport', value: secretPanel.setup.transport },
            { label: 'Port', value: String(secretPanel.setup.port) },
            { label: 'Authentication username', value: 'same as username' },
            { label: 'Outbound proxy', value: secretPanel.setup.outboundProxy },
          ]}
          statusLabel={provisioningLabel(secretPanel.provisioning.status)}
          statusTone={secretPanel.provisioning.status === 'ready' ? 'success' : 'warning'}
          onDismiss={() => setSecretPanel(null)}
        />
      ) : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Status: {isDeleted ? 'Deleted' : data.extension.status}</p>
        <p>Provisioning: {provisioningLabel(data.provisioning.status)}</p>
        <p>
          Registration: {registrationLabel(registration?.registrationStatus)}
          {registration?.endpointState ? ` (${registration.endpointState})` : ''}
        </p>
        {registration?.registrationStatus === 'online' && registration.contactCount > 0 ? (
          <p className="muted">Registered device connected</p>
        ) : null}
        {registration?.lastObservedAt ? (
          <p className="muted">Last checked: {formatDate(registration.lastObservedAt)}</p>
        ) : null}
        {data.provisioning.reason ? (
          <p className="muted">Reason: {data.provisioning.reason}</p>
        ) : null}
        <p>Created: {formatDate(data.extension.createdAt)}</p>
        {!registration?.asteriskReachable ? (
          <p className="muted">
            Runtime registration state is temporarily unavailable. This does not mean the extension
            is offline.
          </p>
        ) : null}
        {!isDeleted && data.provisioning.status !== 'ready' ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void reconcile(false)}
            >
              Retry provisioning
            </button>
            {data.provisioning.reason === 'credential_unavailable' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void reconcile(true)}
              >
                Rotate credential and reconcile
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isDeleted ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>Call recording</h2>
          <p className="muted">Recording policy is separate from live registration status.</p>
          <div className="field">
            <label className="label" htmlFor="recording-policy">
              Extension override
            </label>
            <select
              id="recording-policy"
              className="input"
              value={data.recordingPolicyMode ?? 'inherit'}
              disabled={busy}
              onChange={(e) =>
                void (async () => {
                  setBusy(true);
                  try {
                    await api.patch(
                      `tenants/${tenantId}/extensions/${extensionId}/recording-policy`,
                      { recordingPolicyMode: e.target.value },
                      tenantId,
                    );
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to update recording policy');
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <option value="inherit">Inherit organization setting</option>
              <option value="on">Always record</option>
              <option value="off">Do not record</option>
            </select>
          </div>
          <p>
            Effective setting:{' '}
            {data.recordingEffective?.effectiveRecordingEnabled
              ? 'Recording enabled'
              : 'Recording disabled'}
          </p>
          {(data.recordingPolicyMode ?? 'inherit') === 'inherit' ? (
            <p className="muted">
              Organization default:{' '}
              {data.recordingEffective?.orgRecordCallsByDefault ? 'On' : 'Off'}
            </p>
          ) : null}
        </section>
      ) : null}

      {!isDeleted ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>Devices</h2>
          {devicesWarning ? (
            <p className="muted">Extensions loaded, but devices could not be loaded: {devicesWarning}</p>
          ) : null}
          {!devices ? (
            <LoadingBlock />
          ) : devices.length === 0 ? (
            <p className="muted">No devices yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Registration</th>
                    <th>Username</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{d.deviceType}</td>
                      <td>{d.status}</td>
                      <td>{d.registrationStatus ?? 'unknown'}</td>
                      <td>{d.sipUsername ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!isDeleted ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2>SIP credentials</h2>
          <p>Enter the username, password, and domain into your SIP phone application.</p>
          {data.sipCredential ? (
            <>
              <p>
                <strong>Username</strong>
                <br />
                {data.sipCredential.username}
              </p>
              <p>
                <strong>Domain</strong>
                <br />
                {data.sipDomain ?? '—'}
              </p>
              <p className="muted">Password: Hidden after initial creation</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void rotateCredential()}
                style={{ marginTop: '0.5rem' }}
              >
                Rotate credential
              </button>
              {data.provisioning.status === 'failed' ? (
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  The password was rotated but provisioning is not ready. Use Retry provisioning
                  above.
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">No SIP credential on file.</p>
          )}
        </section>
      ) : null}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Recorded calls</h2>
        {playbackError ? <p className="field-error">{playbackError}</p> : null}
        {playingId && playbackUrl ? (
          <audio
            ref={audioRef}
            controls
            preload="none"
            src={playbackUrl}
            style={{ width: '100%', marginBottom: '0.75rem' }}
          />
        ) : null}
        {!recordings ? (
          <LoadingBlock />
        ) : recordings.data.length === 0 ? (
          <p className="muted">No recorded calls for this extension yet.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Direction</th>
                    <th>Remote party</th>
                    <th>Duration</th>
                    <th>Recording</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recordings.data.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.startedAt)}</td>
                      <td>{row.direction}</td>
                      <td>{row.remoteParty ?? '—'}</td>
                      <td>
                        {row.recordingDurationSeconds ?? row.callDurationSeconds ?? '—'}s
                      </td>
                      <td>{recordingStatusLabel(row.status)}</td>
                      <td>
                        {row.playbackAvailable ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void playRecording(row.id)}
                          >
                            {playingId === row.id ? 'Play' : 'Play'}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recordings.pagination.totalPages > 1 ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordings.pagination.page <= 1}
                  onClick={() => void loadRecordings(recordings.pagination.page - 1)}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {recordings.pagination.page} of {recordings.pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordings.pagination.page >= recordings.pagination.totalPages}
                  onClick={() => void loadRecordings(recordings.pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {!isDeleted ? (
        <section className="card" style={{ borderColor: 'var(--danger, #b42318)' }}>
          <h2>Danger zone</h2>
          <p>Permanently remove this extension from active telephony configuration.</p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            Delete extension
          </button>
        </section>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete extension ${data.extension.extensionNumber}?`}
        message={
          'This will:\n• revoke its SIP credential,\n• remove it from the active PBX configuration,\n• prevent future registration and calling.\n\nHistorical calls, recordings, and audit history will be preserved.'
        }
        confirmLabel="Delete extension"
        confirmTextRequired={data.extension.extensionNumber}
        confirmTextLabel={`Type ${data.extension.extensionNumber} to confirm`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteExtension()}
      />
    </>
  );
}
