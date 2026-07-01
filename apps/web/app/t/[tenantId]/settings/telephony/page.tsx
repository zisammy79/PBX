'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { TenantSipDomainSummary } from '@pbx/contracts';

export default function TelephonySettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [recordCallsByDefault, setRecordCallsByDefault] = useState(false);
  const [domain, setDomain] = useState<TenantSipDomainSummary | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<{ recordCallsByDefault: boolean }>(`tenants/${tenantId}/settings/telephony`, tenantId),
      api.get<TenantSipDomainSummary | null>(`tenants/${tenantId}/sip-domain`, tenantId).catch(() => null),
    ])
      .then(([telephony, sipDomain]) => {
        setRecordCallsByDefault(telephony.recordCallsByDefault);
        setDomain(sipDomain);
        if (sipDomain) setDomainInput(sipDomain.domain);
      })
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

  async function requestDomain(e: FormEvent) {
    e.preventDefault();
    setDomainError(null);
    try {
      const row = await api.post<TenantSipDomainSummary>(
        `tenants/${tenantId}/sip-domain/request`,
        { domain: domainInput, mode: 'tenant_domain' },
        tenantId,
      );
      setDomain(row);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Domain request failed');
    }
  }

  async function validateDomain() {
    setDomainError(null);
    try {
      const row = await api.post<TenantSipDomainSummary>(`tenants/${tenantId}/sip-domain/validate`, {}, tenantId);
      setDomain(row);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Validation failed');
    }
  }

  async function activateDomain() {
    setDomainError(null);
    try {
      const row = await api.post<TenantSipDomainSummary>(`tenants/${tenantId}/sip-domain/activate`, {}, tenantId);
      setDomain(row);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Activation failed');
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Telephony settings" description="Organization-wide telephony defaults and SIP domain." />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <p className="muted">{message}</p> : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Call recording</h2>
        <p className="muted">When enabled, calls are recorded unless an individual extension overrides this setting.</p>
        <label className="field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={recordCallsByDefault} onChange={(e) => setRecordCallsByDefault(e.target.checked)} />
          <span>Record calls by default</span>
        </label>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          Save settings
        </button>
      </section>
      <section className="card">
        <h2>SIP domain</h2>
        <p className="muted">Shared-domain mode remains available using tenant-slug usernames. Custom domains require DNS validation.</p>
        {domainError ? <ErrorAlert message={domainError} /> : null}
        <form onSubmit={requestDomain}>
          <div className="field">
            <label className="label">Custom domain</label>
            <input className="input" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="customer.pbx.example.com" />
          </div>
          <button type="submit" className="btn btn-secondary">Request domain</button>
        </form>
        {domain ? (
          <div style={{ marginTop: '1rem' }}>
            <p>Status: {domain.validationStatus} / {domain.activationStatus}</p>
            {domain.dnsInstructions ? (
              <p className="muted">Add TXT {domain.dnsInstructions.host} = {domain.dnsInstructions.value}</p>
            ) : null}
            {domain.failureReason ? <p className="field-error">{domain.failureReason}</p> : null}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => void validateDomain()}>Validate DNS</button>
              {domain.validationStatus === 'verified' ? (
                <button type="button" className="btn btn-primary" onClick={() => void activateDomain()}>Activate</button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '0.75rem' }}>Using shared-domain mode.</p>
        )}
      </section>
    </>
  );
}
