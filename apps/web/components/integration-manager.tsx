'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui-panels';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type IntegrationRow = {
  id: string;
  displayName: string;
  provider: string;
  integrationType: string;
  environment: string;
  enabled: boolean;
  isDefault: boolean;
  credentialConfigured: boolean;
  validationStatus: string;
  lastValidatedAt: string | null;
  sanitizedValidationError: string | null;
  tenantAssignmentCount: number;
};

type TenantOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type AssignmentRow = {
  id: string;
  tenantId: string;
  enabled: boolean;
};

export function IntegrationTypePage({
  title,
  description,
  integrationType,
  providerDefault,
  fields,
  warnings,
}: {
  title: string;
  description: string;
  integrationType: string;
  providerDefault: string;
  fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>;
  warnings?: string[];
}) {
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ provider: providerDefault, environment: integrationType === 'stripe' ? 'test' : 'default' });
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceForm, setReplaceForm] = useState<Record<string, string>>({});
  const [assignId, setAssignId] = useState<string | null>(null);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [removeAssignmentId, setRemoveAssignmentId] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  async function load() {
    const data = await api.get<IntegrationRow[]>(`platform/integrations?integrationType=${integrationType}`);
    setRows(data);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load integrations'));
  }, [integrationType]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const credentials: Record<string, string> = {};
      const config: Record<string, string> = {};
      for (const field of fields) {
        const value = form[field.key]?.trim();
        if (!value) continue;
        if (field.secret) credentials[field.key] = value;
        else config[field.key] = value;
      }
      await api.post('platform/integrations', {
        integrationType,
        provider: form.provider || providerDefault,
        displayName: form.displayName || `${title} connection`,
        environment: form.environment || 'default',
        enabled: true,
        isDefault: form.isDefault === 'true',
        credentials,
        config,
      });
      setSavedOnce(true);
      setForm({ provider: providerDefault, environment: integrationType === 'stripe' ? 'test' : 'default' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create integration');
    }
  }

  async function validate(id: string) {
    await api.post(`platform/integrations/${id}/validate`, {});
    await load();
  }

  async function validateConfiguration(id: string) {
    await api.post(`platform/integrations/${id}/validate-configuration`, {});
    await load();
  }

  async function validateNetwork(id: string) {
    await api.post(`platform/integrations/${id}/validate-network`, {});
    await load();
  }

  async function openAssignDialog(id: string) {
    setAssignId(id);
    setTenantSearch('');
    const [tenantRows, assignmentRows] = await Promise.all([
      api.get<TenantOption[]>('tenants'),
      api.get<AssignmentRow[]>(`platform/integrations/${id}/assignments`),
    ]);
    setTenants(tenantRows);
    setAssignments(assignmentRows);
  }

  async function assignTenant(tenantId: string) {
    if (!assignId) return;
    try {
      await api.post(`platform/integrations/${assignId}/assignments`, { tenantId });
      await openAssignDialog(assignId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign tenant');
    }
  }

  async function confirmRemoveAssignment() {
    if (!assignId || !removeAssignmentId) return;
    try {
      await api.delete(`platform/integrations/${assignId}/assignments/${removeAssignmentId}`);
      setRemoveAssignmentId(null);
      await openAssignDialog(assignId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove assignment');
    }
  }

  const assignedTenantIds = new Set(assignments.map((a) => a.tenantId));
  const filteredTenants = tenants.filter((t) => {
    const q = tenantSearch.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
  });

  async function submitReplace() {
    if (!replaceId) return;
    const credentials: Record<string, string> = {};
    for (const field of fields.filter((f) => f.secret)) {
      const value = replaceForm[field.key]?.trim();
      if (value) credentials[field.key] = value;
    }
    if (Object.keys(credentials).length === 0) {
      setError('Enter at least one secret field to replace the credential');
      return;
    }
    try {
      await api.post(`platform/integrations/${replaceId}/replace-credential`, {
        credentials,
        confirmReplace: true,
      });
      setReplaceId(null);
      setReplaceForm({});
      setSavedOnce(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace credential');
    }
  }

  if (error) return <ErrorAlert message={error} />;
  if (!rows) return <LoadingBlock />;

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="alert alert-info" role="note">
        Integration credentials are encrypted and cannot be viewed after saving. Replacing a credential may interrupt active sessions or calls.
      </div>
      {warnings?.map((w) => (
        <div key={w} className="alert alert-warning" role="note">{w}</div>
      ))}
      {savedOnce ? (
        <div className="alert alert-success" role="status">
          Credential saved successfully. It cannot be retrieved again — store any required external references now.
          <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.75rem' }} onClick={() => setSavedOnce(false)}>
            I have saved the credentials
          </button>
        </div>
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Add connection</h2>
        <form onSubmit={onCreate} autoComplete="off">
          <div className="field"><label className="label">Display name</label><input className="input" required value={form.displayName ?? ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
          <div className="field"><label className="label">Provider</label><input className="input" value={form.provider ?? providerDefault} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
          {integrationType === 'stripe' ? (
            <div className="field"><label className="label">Environment</label>
              <select className="input" value={form.environment ?? 'test'} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                <option value="test">TEST</option>
                <option value="live">LIVE</option>
              </select>
            </div>
          ) : null}
          {fields.map((field) => (
            <div className="field" key={field.key}>
              <label className="label">{field.label}</label>
              <input
                className="input"
                type={field.secret ? 'password' : 'text'}
                autoComplete={field.secret ? 'new-password' : 'off'}
                placeholder={field.secret ? 'Enter secret (shown once)' : field.placeholder}
                value={form[field.key] ?? ''}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              />
            </div>
          ))}
          <label><input type="checkbox" checked={form.isDefault === 'true'} onChange={(e) => setForm({ ...form, isDefault: e.target.checked ? 'true' : 'false' })} /> Platform default</label>
          <div style={{ marginTop: '0.75rem' }}><button type="submit" className="btn btn-primary">Save encrypted credential</button></div>
        </form>
      </section>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Provider</th><th>Env</th><th>Status</th><th>Credential</th><th>Tenants</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.displayName}{row.isDefault ? ' (default)' : ''}</td>
                <td>{row.provider}</td>
                <td>{row.environment}</td>
                <td>{row.validationStatus}</td>
                <td>{row.credentialConfigured ? 'Configured' : 'Not configured'}</td>
                <td>{row.tenantAssignmentCount}</td>
                <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {integrationType === 'sip_carrier' ? (
                    <>
                      <button type="button" className="btn btn-secondary" onClick={() => void validateConfiguration(row.id)}>Validate configuration</button>
                      <button type="button" className="btn btn-secondary" onClick={() => void validateNetwork(row.id)}>Test registration / connectivity</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => void validate(row.id)}>Test connection</button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => { setReplaceId(row.id); setReplaceForm({}); }}>Replace credential</button>
                  <button type="button" className="btn btn-secondary" onClick={() => void openAssignDialog(row.id)}>Assign tenants</button>
                  <button type="button" className="btn btn-secondary" onClick={() => api.post(`platform/integrations/${row.id}/${row.enabled ? 'disable' : 'enable'}`, {}).then(load)}>{row.enabled ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.some((r) => r.sanitizedValidationError) ? (
          <p className="field-error">{rows.find((r) => r.sanitizedValidationError)?.sanitizedValidationError}</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={!!replaceId}
        title="Replace credential"
        message="Replacing a credential may interrupt active sessions or calls. Enter new secrets below — existing values cannot be retrieved."
        confirmLabel="Replace credential"
        onCancel={() => { setReplaceId(null); setReplaceForm({}); }}
        onConfirm={() => void submitReplace()}
      />
      {replaceId ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3>New credential values</h3>
          {fields.filter((f) => f.secret).map((field) => (
            <div className="field" key={field.key}>
              <label className="label">{field.label}</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="Configured — leave blank to keep, or enter replacement"
                value={replaceForm[field.key] ?? ''}
                onChange={(e) => setReplaceForm({ ...replaceForm, [field.key]: e.target.value })}
              />
            </div>
          ))}
        </section>
      ) : null}
      {assignId ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3>Assign tenants</h3>
          <div className="field">
            <label className="label">Search tenants</label>
            <input className="input" value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} placeholder="Search by name or slug" />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Assignment</th><th>Action</th></tr></thead>
              <tbody>
                {filteredTenants.map((tenant) => {
                  const assigned = assignedTenantIds.has(tenant.id);
                  const disabled = tenant.status === 'suspended' || tenant.status === 'disabled';
                  return (
                    <tr key={tenant.id}>
                      <td>{tenant.name}</td>
                      <td>{tenant.slug}</td>
                      <td>{tenant.status}{disabled ? ' (restricted)' : ''}</td>
                      <td>{assigned ? 'Assigned' : '—'}</td>
                      <td>
                        {assigned ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setRemoveAssignmentId(assignments.find((a) => a.tenantId === tenant.id)?.id ?? null)}
                          >
                            Remove
                          </button>
                        ) : (
                          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => void assignTenant(tenant.id)}>
                            Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setAssignId(null)}>Close</button>
        </section>
      ) : null}
      <ConfirmDialog
        open={!!removeAssignmentId}
        title="Remove tenant assignment"
        message="Removing an assignment may affect tenant integration resolution. Continue?"
        confirmLabel="Remove assignment"
        onCancel={() => setRemoveAssignmentId(null)}
        onConfirm={() => void confirmRemoveAssignment()}
      />
    </>
  );
}
