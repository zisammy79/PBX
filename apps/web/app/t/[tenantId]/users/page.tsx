'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import type { TenantInvitationSummary, TenantUserSummary } from '@pbx/contracts';

export default function TenantUsersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [users, setUsers] = useState<TenantUserSummary[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', role: 'human_agent', displayName: '' });

  async function load() {
    const [u, inv] = await Promise.all([
      api.get<TenantUserSummary[]>(`tenants/${tenantId}/users`, tenantId),
      api.get<TenantInvitationSummary[]>(`tenants/${tenantId}/invitations`, tenantId),
    ]);
    setUsers(u);
    setInvitations(inv);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
  }, [tenantId]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLink(null);
    try {
      const result = await api.post<{ invitation: TenantInvitationSummary; invitationLink?: string }>(
        `tenants/${tenantId}/invitations`,
        form,
        tenantId,
      );
      if (result.invitationLink) setInviteLink(result.invitationLink);
      setForm({ email: '', role: 'human_agent', displayName: '' });
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    }
  }

  if (error) return <ErrorAlert message={error} />;

  return (
    <>
      <PageHeader title="Users" description="Portal users, roles, and invitations." />
      {inviteError ? <ErrorAlert message={inviteError} /> : null}
      {inviteLink ? (
        <div className="alert alert-info" role="status">
          Invitation link (copy once; not stored): {inviteLink}
        </div>
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Invite user</h2>
        <form onSubmit={onInvite}>
          <div className="field"><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label className="label">Display name</label><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
          <div className="field">
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="tenant_administrator">Administrator</option>
              <option value="supervisor">Supervisor</option>
              <option value="human_agent">Agent</option>
              <option value="tenant_billing_administrator">Billing</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Send invitation</button>
        </form>
      </section>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Members</h2>
        {users.length === 0 ? <p className="muted">No members yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Extensions</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.membershipId}>
                    <td>{u.displayName}</td>
                    <td>{u.email}</td>
                    <td>{u.roles.join(', ')}</td>
                    <td>{u.membershipStatus}</td>
                    <td>{u.assignedExtensions.map((e) => e.extensionNumber).join(', ') || '—'}</td>
                    <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Pending invitations</h2>
        {invitations.filter((i) => i.status === 'pending').length === 0 ? (
          <p className="muted">No pending invitations.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Email</th><th>Role</th><th>Delivery</th><th>Expires</th></tr>
              </thead>
              <tbody>
                {invitations.filter((i) => i.status === 'pending').map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{i.role}</td>
                    <td>{i.deliveryStatus}</td>
                    <td>{formatDate(i.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
