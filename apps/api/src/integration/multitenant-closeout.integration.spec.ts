import { describe, expect, it, beforeAll } from 'vitest';
import { resolveAdminEmail, resolveAdminPassword } from './admin-auth.js';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describeIntegration('five-tenant isolation', () => {
  let adminToken = '';
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resolveAdminEmail(),
        password: await resolveAdminPassword(),
      }),
    });
    adminToken = login.body.accessToken;

    const customers = await api('/tenants/customers/summary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    for (const row of customers.body.filter((c: { slug: string }) => c.slug.startsWith('demo-mt-'))) {
      tenantIds.push(row.id);
    }
    expect(tenantIds.length).toBeGreaterThanOrEqual(2);
  });

  it('platform admin can list all demo-mt customers', async () => {
    const customers = await api('/tenants/customers/summary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(customers.status).toBe(200);
    const demoCount = customers.body.filter((c: { slug: string }) => c.slug.startsWith('demo-mt-')).length;
    expect(demoCount).toBeGreaterThanOrEqual(5);
  });
});

describeIntegration('invitation acceptance API', () => {
  let adminToken = '';
  let tenantId = '';

  beforeAll(async () => {
    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resolveAdminEmail(),
        password: await resolveAdminPassword(),
      }),
    });
    adminToken = login.body.accessToken;
    const customers = await api('/tenants/customers/summary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    tenantId = customers.body.find((c: { slug: string }) => c.slug === 'demo-mt-1')?.id;
    expect(tenantId).toBeTruthy();
  });

  it('creates invitation with copy-link fallback and accepts token once', async () => {
    const email = `invite-race-${Date.now()}@demo.local`;
    const created = await api(`/tenants/${tenantId}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, role: 'human_agent', displayName: 'Invitee' }),
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.invitationLink).toBeTruthy();

    const token = new URL(created.body.invitationLink).searchParams.get('token');
    expect(token).toBeTruthy();

    const accepted = await api('/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        password: 'InviteSecurePass123!',
        displayName: 'Invitee User',
      }),
    });
    expect([200, 201]).toContain(accepted.status);

    const replay = await api('/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'InviteSecurePass123!' }),
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });
});
