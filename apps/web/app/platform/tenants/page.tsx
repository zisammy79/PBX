'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    ownerDisplayName: '',
  });

  async function load() {
    const rows = await api.get<Array<Record<string, unknown>>>('tenants');
    setTenants(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tenants'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('tenants', form);
      setForm({ name: '', slug: '', ownerEmail: '', ownerDisplayName: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant');
    }
  }

  if (error) return <ErrorAlert message={error} />;

  return (
    <>
      <PageHeader title="Tenants" description="Create and manage tenant organizations." />
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Create tenant</h2>
        <form onSubmit={onCreate}>
          <div className="field"><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label className="label">Slug</label><input className="input" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
          <div className="field"><label className="label">Owner email</label><input className="input" type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></div>
          <div className="field"><label className="label">Owner name</label><input className="input" required value={form.ownerDisplayName} onChange={(e) => setForm({ ...form, ownerDisplayName: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary">Create tenant</button>
        </form>
      </section>
      {!tenants ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th>Name</th><th>Slug</th><th>Status</th></tr></thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={String(tenant.id)}>
                  <td><Link href={`/platform/tenants/${String(tenant.id)}`}>{String(tenant.name)}</Link></td>
                  <td>{String(tenant.slug)}</td>
                  <td>{String(tenant.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
