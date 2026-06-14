'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { PlatformCustomerSummary } from '@pbx/contracts';

export default function PlatformCustomersPage() {
  const [customers, setCustomers] = useState<PlatformCustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPanelError(null);
    try {
      await api.post('tenants', form);
      setForm({ name: '', slug: '', ownerEmail: '', ownerDisplayName: '' });
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

  return (
    <>
      <PageHeader title="Customers" description="Platform-wide customer lifecycle and health." />
      {panelError ? <ErrorAlert message={panelError} /> : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create customer</h2>
        <p className="muted">New customers start in draft until provisioned and activated.</p>
        <form onSubmit={onCreate}>
          <div className="field"><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label className="label">Slug</label><input className="input" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
          <div className="field"><label className="label">Owner email</label><input className="input" type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></div>
          <div className="field"><label className="label">Owner name</label><input className="input" required value={form.ownerDisplayName} onChange={(e) => setForm({ ...form, ownerDisplayName: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary">Create customer</button>
        </form>
      </section>
      {!customers ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
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
                    {customer.status === 'provisioning' ? (
                      <button type="button" className="btn btn-primary" style={{ marginLeft: '0.25rem' }} onClick={() => void transition(customer.id, 'active')}>
                        Activate
                      </button>
                    ) : null}
                    {customer.status === 'failed' ? (
                      <button type="button" className="btn btn-secondary" onClick={() => void transition(customer.id, 'provisioning')}>
                        Retry
                      </button>
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
