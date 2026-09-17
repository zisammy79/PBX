import { describe, expect, it, beforeAll } from 'vitest';
import { resolveAdminEmail, resolveAdminPassword } from './admin-auth.js';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describeIntegration('phase 7 tenant isolation', () => {
  let adminToken = '';
  let tenantA = '';
  let tenantB = '';

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
    tenantA = customers.body.find((c: { slug: string }) => c.slug === 'demo-mt-1')?.id;
    tenantB = customers.body.find((c: { slug: string }) => c.slug === 'demo-mt-2')?.id;
    expect(tenantA).toBeTruthy();
    expect(tenantB).toBeTruthy();
  });

  it('tenant A button layout is not visible to tenant B context', async () => {
    const layoutName = `iso-layout-${Date.now()}`;
    const created = await api(`/tenants/${tenantA}/button-layouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: layoutName,
        vendorTemplate: 'generic',
        lineStart: 1,
        lineEnd: 6,
        buttons: [],
      }),
    });
    expect([200, 201]).toContain(created.status);
    const layoutId = created.body.id as string;
    expect(layoutId).toBeTruthy();

    const tenantBList = await api(`/tenants/${tenantB}/button-layouts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantB,
      },
    });
    expect(tenantBList.status).toBe(200);
    const ids = (tenantBList.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(layoutId);

    const crossGet = await api(`/tenants/${tenantB}/button-layouts/${layoutId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantB,
      },
    });
    expect([403, 404]).toContain(crossGet.status);

    await api(`/tenants/${tenantA}/button-layouts/${layoutId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantA,
      },
    });
  });

  it('tenant A schedule is not listed under tenant B', async () => {
    const scheduleName = `iso-schedule-${Date.now()}`;
    const created = await api(`/tenants/${tenantA}/schedules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: scheduleName,
        timezone: 'UTC',
        scheduleType: 'weektime',
        rules: [],
      }),
    });
    expect([200, 201]).toContain(created.status);
    const scheduleId = created.body.id as string;

    const tenantBList = await api(`/tenants/${tenantB}/schedules`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantB,
      },
    });
    expect(tenantBList.status).toBe(200);
    const ids = (tenantBList.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(scheduleId);

    await api(`/tenants/${tenantA}/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantA,
      },
    });
  });
});
