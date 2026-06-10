import { describe, expect, it, beforeAll } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describeIntegration('dashboard summaries', () => {
  let adminToken: string;
  let ownerToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const { readFile } = await import('node:fs/promises');
    const bootstrapPath = join(REPO_ROOT, 'packages/database/.local/bootstrap-admin.json');
    const bootstrap = JSON.parse(await readFile(bootstrapPath, 'utf8'));
    const adminEmail = process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local';

    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: bootstrap.password }),
    });
    adminToken = login.body.accessToken;

    const ownerEmail = `dash-owner-${Date.now()}@tenant.test`;
    const tenant = await api('/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dashboard Tenant',
        slug: `dash-${Date.now()}`,
        ownerEmail,
        ownerDisplayName: 'Dash Owner',
      }),
    });
    tenantId = tenant.body.tenant.id;

    const ownerLogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: tenant.body.owner.temporaryPassword }),
    });
    ownerToken = ownerLogin.body.accessToken;
  });

  it('GET /auth/me returns current user', async () => {
    const res = await api('/auth/me', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBeTruthy();
    expect(res.body.tenantMemberships?.length).toBeGreaterThan(0);
  });

  it('GET /tenants/:id/dashboard returns tenant summary', async () => {
    const res = await api(`/tenants/${tenantId}/dashboard`, {
      headers: { Authorization: `Bearer ${ownerToken}`, 'X-Tenant-Id': tenantId },
    });
    expect(res.status).toBe(200);
    expect(res.body.calls).toBeDefined();
    expect(res.body.extensions).toBeDefined();
    expect(res.body.usage?.providerCostStatus).toBe('UNAVAILABLE');
  });

  it('GET /platform/dashboard returns platform summary', async () => {
    const res = await api('/platform/dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.tenants?.total).toBeGreaterThan(0);
    expect(res.body.billing?.stripeStatus).toBe('DISABLED');
  });

  it('GET /billing/subscription returns plan context', async () => {
    const res = await api('/billing/subscription', {
      headers: { Authorization: `Bearer ${ownerToken}`, 'X-Tenant-Id': tenantId },
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currency');
  });
});
