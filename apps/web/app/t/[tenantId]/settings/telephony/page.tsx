'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function TelephonySettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [recordCallsByDefault, setRecordCallsByDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ recordCallsByDefault: boolean }>(`tenants/${tenantId}/settings/telephony`, tenantId)
      .then((data) => setRecordCallsByDefault(data.recordCallsByDefault))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.patch<{ recordCallsByDefault: boolean }>(
        `tenants/${tenantId}/settings/telephony`,
        { recordCallsByDefault },
        tenantId,
      );
      setRecordCallsByDefault(updated.recordCallsByDefault);
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Telephony settings"
        description="Organization-wide telephony defaults for call recording."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <p className="muted">{message}</p> : null}
      <section className="card">
        <h2>Call recording</h2>
        <p className="muted">
          When enabled, calls are recorded unless an individual extension overrides this setting.
        </p>
        <label className="field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={recordCallsByDefault}
            onChange={(e) => setRecordCallsByDefault(e.target.checked)}
          />
          <span>Record calls by default</span>
        </label>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Ensure your recording practices comply with applicable notification, consent, and retention
          requirements.
        </p>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          Save settings
        </button>
      </section>
    </>
  );
}
