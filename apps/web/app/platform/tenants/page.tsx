'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { normalizeTenantSlug } from '@pbx/contracts';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { PlatformCustomerSummary } from '@pbx/contracts';

export default function PlatformCustomersPage() {
  const [customers, setCustomers] = useState<PlatformCustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    ownerDisplayName: '',
  });

  async function load() {
    const rows = await api.get<PlatformCustomerSummary[]>('tenants/customers/summary');
    setCustomers(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
  }, []);

  function suggestSlugFromName(name: string): string {
    return normalizeTenantSlug(name);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPanelError(null);
    const payload = {
      name: form.name.trim(),
      slug: normalizeTenantSlug(form.slug || form.name),
      ownerEmail: form.ownerEmail.trim(),
      ownerDisplayName: form.ownerDisplayName.trim(),
    };
    try {
      await api.post('tenants', payload);
      setForm({ name: '', slug: '', ownerEmail: '', ownerDisplayName: '' });
      setSlugEdited(false);
      await load();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to create customer');
    }
  }

  async function transition(tenantId: string, status: string) {
    setPanelError(null);
    try {
      await api.patch(`tenants/${tenantId}/lifecycle`, { status });
      await load();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Lifecycle update failed');
    }
  }

  if (error) return <ErrorAlert message={error} />;

  const slugPreview = normalizeTenantSlug(form.slug || form.name);

  return (
    <>
      <PageHeader title="Customers" description="Platform-wide customer lifecycle and health." />
      {panelError ? <ErrorAlert message={panelError} /> : null}
      <section className="card card-elevated" style={{ marginBottom: '1rem' }}>
        <h2>Create customer</h2>
        <p className="muted">New customers start in draft until provisioned and activated.</p>
        <form onSubmit={onCreate}>
          <div className="field">
            <label className="label" htmlFor="tenant-name">Name</label>
            <input
              id="tenant-name"
              className="input"
              required
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  slug: slugEdited ? prev.slug : suggestSlugFromName(name),
                }));
              }}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="tenant-slug">Slug</label>
            <input
              id="tenant-slug"
              className="input"
              required
              value={form.slug}
              placeholder="wedo-solutions"
              onChange={(e) => {
                setSlugEdited(true);
                setForm({ ...form, slug: e.target.value });
              }}
            />
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
              URL-safe identifier: lowercase letters, numbers, hyphens. Will use:{' '}
              <strong>{slugPreview || '—'}</strong>
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="owner-email">Owner email</label>
            <input
              id="owner-email"
              className="input"
              type="email"
              required
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="owner-name">Owner name</label>
            <input
              id="owner-name"
              className="input"
              required
              value={form.ownerDisplayName}
              onChange={(e) => setForm({ ...form, ownerDisplayName: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-primary">Create customer</button>
        </form>
      </section>
      {!customers ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card card-elevated">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Users</th>
                <th>Extensions</th>
                <th>Online</th>
                <th>Calls</th>
                <th>SIP domain</th>
                <th>Recording</th>
                <th>Health</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/platform/tenants/${customer.id}`}>{customer.name}</Link>
                    <div className="muted">{customer.slug}</div>
                    {customer.status === 'draft' || customer.status === 'provisioning' || customer.status === 'failed' ? (
                      <div>
                        <Link href={`/platform/tenants/${customer.id}/provision`}>Provision</Link>
                      </div>
                    ) : null}
                  </td>
                  <td>{customer.status}</td>
                  <td className="muted">{customer.primaryOwnerEmail ?? '—'}</td>
                  <td>{customer.activeUsers}</td>
                  <td>{customer.activeExtensions}</td>
                  <td>{customer.onlineRegistrations}</td>
                  <td>{customer.concurrentCalls}</td>
                  <td>{customer.sipDomain ?? `shared (${customer.sipDomainMode})`}</td>
                  <td>{customer.recordCallsByDefault ? 'On' : 'Off'}</td>
                  <td>{customer.health}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {customer.status === 'draft' ? (
                      <button type="button" className="btn btn-secondary" onClick={() => void transition(customer.id, 'provisioning')}>
                        Provision
                      </button>
                    ) : null}
                    {customer.status === 'provisioning' || customer.status === 'failed' ? (
                      <Link href={`/platform/tenants/${customer.id}/provision`} className="btn btn-primary" style={{ marginLeft: '0.25rem' }}>
                        Continue provisioning
                      </Link>
                    ) : null}
                    {customer.status === 'active' ? (
                      <button type="button" className="btn btn-secondary" onClick={() => void transition(customer.id, 'suspended')}>
                        Suspend
                      </button>
                    ) : null}
                    {customer.status === 'suspended' ? (
                      <button type="button" className="btn btn-primary" onClick={() => void transition(customer.id, 'active')}>
                        Reactivate
                      </button>
                    ) : null}
                    {customer.status !== 'archived' ? (
                      <button type="button" className="btn btn-danger" style={{ marginLeft: '0.25rem' }} onClick={() => void transition(customer.id, 'archived')}>
                        Archive
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
