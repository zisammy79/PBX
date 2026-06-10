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

describeIntegration('tenant owner workflow', () => {
  let adminToken: string;
  let ownerToken: string;
  let tenantAId: string;
  let tenantBId: string;
  let ownerTempPassword: string;
  const ownerEmail = `owner-${Date.now()}@tenant.test`;
  const ownerNewPassword = 'OwnerSecurePass123!';

  beforeAll(async () => {
    const { readFile } = await import('node:fs/promises');
    const bootstrapPath = join(REPO_ROOT, 'packages/database/.local/bootstrap-admin.json');
    const bootstrap = await readFile(bootstrapPath, 'utf8').catch(() => null);
    let adminPassword = process.env.DEV_ADMIN_PASSWORD;
    if (!adminPassword && bootstrap) {
      adminPassword = JSON.parse(bootstrap).password;
    }
    if (!adminPassword) {
      throw new Error('Set DEV_ADMIN_PASSWORD or run db:seed to create bootstrap credentials');
    }

    const adminEmail = process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local';

    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect([200, 201]).toContain(login.status);
    adminToken = login.body.accessToken;

    const tenantA = await api('/tenants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tenant Alpha',
        slug: `alpha-${Date.now()}`,
        ownerEmail,
        ownerDisplayName: 'Alpha Owner',
      }),
    });
    expect([200, 201]).toContain(tenantA.status);
    tenantAId = tenantA.body.tenant.id;
    ownerTempPassword = tenantA.body.owner.temporaryPassword;
    expect(ownerTempPassword).toBeTruthy();

    const tenantB = await api('/tenants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tenant Beta',
        slug: `beta-${Date.now()}`,
        ownerEmail: `beta-owner-${Date.now()}@tenant.test`,
        ownerDisplayName: 'Beta Owner',
      }),
    });
    tenantBId = tenantB.body.tenant.id;

    const ownerLogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerTempPassword }),
    });
    expect([200, 201]).toContain(ownerLogin.status);
    expect(ownerLogin.body.mustChangePassword).toBe(true);
    ownerToken = ownerLogin.body.accessToken;

    const changePw = await api('/auth/change-password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: ownerTempPassword,
        newPassword: ownerNewPassword,
      }),
    });
    expect([200, 201]).toContain(changePw.status);

    const ownerRelogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: ownerNewPassword }),
    });
    ownerToken = ownerRelogin.body.accessToken;
    expect(ownerRelogin.body.mustChangePassword).toBe(false);
  });

  it('tenant owner creates extension in own tenant', async () => {
    const created = await api(`/tenants/${tenantAId}/extensions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantAId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ extensionNumber: '1001', displayName: 'Owner Desk' }),
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.sipCredential.secret).toBeTruthy();
  });

  it('rejects duplicate extension numbers within tenant', async () => {
    const duplicate = await api(`/tenants/${tenantAId}/extensions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantAId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ extensionNumber: '1001', displayName: 'Duplicate Desk' }),
    });
    expect(duplicate.status).toBe(400);
  });

  it('read extension does not return SIP secret', async () => {
    const list = await api(`/tenants/${tenantAId}/extensions`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantAId,
      },
    });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    for (const ext of list.body) {
      expect(ext.sipCredential?.secret).toBeUndefined();
    }
  });

  it('tenant owner cannot access another tenant', async () => {
    const denied = await api(`/tenants/${tenantBId}/extensions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantBId,
      },
    });
    expect(denied.status).toBe(403);
  });

  it('platform admin retains platform access', async () => {
    const tenants = await api('/tenants', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(tenants.status).toBe(200);
    expect(Array.isArray(tenants.body)).toBe(true);
  });

  it('arbitrary tenant id in header does not grant access to owner', async () => {
    const fakeTenant = '22222222-2222-2222-2222-222222222222';
    const denied = await api(`/tenants/${fakeTenant}/extensions`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': fakeTenant,
      },
    });
    expect(denied.status).toBe(403);
  });
});

describeIntegration('health dependencies', () => {
  it('reports healthy required dependencies when infrastructure is up', async () => {
    const ready = await api('/health/ready');
    expect(ready.body.ready).toBe(true);
    const required = ['postgresql', 'redis', 'nats'];
    for (const name of required) {
      const dep = ready.body.dependencies.find((d: { name: string }) => d.name === name);
      expect(dep?.status).toBe('healthy');
    }
  });

  it('live endpoint stays healthy independently', async () => {
    const live = await api('/health/live');
    expect(live.body.status).toBe('healthy');
  });
});
