import { describe, expect, it, beforeAll } from 'vitest';
import { resolveAdminEmail, resolveAdminPassword } from './admin-auth.js';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function tenantHeaders(token: string, tenantId: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    ...extra,
  };
}

describeIntegration('five-tenant callflow isolation', () => {
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

  async function assertCrossTenantHidden(
    label: string,
    collection: string,
    createBody: Record<string, unknown>,
  ) {
    const created = await api(`/tenants/${tenantA}/${collection}`, {
      method: 'POST',
      headers: tenantHeaders(adminToken, tenantA, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(createBody),
    });
    expect([200, 201], `${label} create`).toContain(created.status);
    const resourceId = created.body.id as string;
    expect(resourceId).toBeTruthy();

    const tenantBList = await api(`/tenants/${tenantB}/${collection}`, {
      headers: tenantHeaders(adminToken, tenantB),
    });
    expect(tenantBList.status, `${label} list status`).toBe(200);
    const ids = (tenantBList.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids, `${label} list isolation`).not.toContain(resourceId);

    const crossGet = await api(`/tenants/${tenantB}/${collection}/${resourceId}`, {
      headers: tenantHeaders(adminToken, tenantB),
    });
    expect([403, 404], `${label} cross-get`).toContain(crossGet.status);

    await api(`/tenants/${tenantA}/${collection}/${resourceId}`, {
      method: 'DELETE',
      headers: tenantHeaders(adminToken, tenantA),
    });
  }

  it('isolates media files between demo-mt-1 and demo-mt-2', async () => {
    const stamp = Date.now();
    await assertCrossTenantHidden('media-files', 'media-files', {
      name: `iso-media-${stamp}`,
      format: 'wav',
      sizeBytes: 16,
      md5: 'd41d8cd98f00b204e9800998ecf8427e',
      storageKey: `${tenantA}/iso-media-${stamp}.wav`,
    });
  });

  it('isolates queues between demo-mt-1 and demo-mt-2', async () => {
    await assertCrossTenantHidden('queues', 'queues', {
      name: `iso-queue-${Date.now()}`,
      strategy: 'ringall',
      maxWaitSeconds: 60,
    });
  });

  it('isolates campaigns between demo-mt-1 and demo-mt-2', async () => {
    await assertCrossTenantHidden('campaigns', 'campaigns', {
      name: `iso-campaign-${Date.now()}`,
      technology: 'voice',
      maxConcurrent: 1,
      maxAttempts: 1,
    });
  });

  it('isolates faxes between demo-mt-1 and demo-mt-2', async () => {
    await assertCrossTenantHidden('faxes', 'faxes', {
      remoteNumber: '+15551234567',
      localNumber: '+15557654321',
      pages: 1,
    });
  });

  it('isolates button layouts between demo-mt-1 and demo-mt-2', async () => {
    await assertCrossTenantHidden('button-layouts', 'button-layouts', {
      name: `iso-layout-${Date.now()}`,
      vendorTemplate: 'generic',
      lineStart: 1,
      lineEnd: 4,
      buttons: [],
    });
  });

  it('returns tenant-scoped voicemail lists without cross-tenant leakage', async () => {
    const tenantAList = await api(`/tenants/${tenantA}/voicemails`, {
      headers: tenantHeaders(adminToken, tenantA),
    });
    const tenantBList = await api(`/tenants/${tenantB}/voicemails`, {
      headers: tenantHeaders(adminToken, tenantB),
    });
    expect(tenantAList.status).toBe(200);
    expect(tenantBList.status).toBe(200);

    const idsA = (tenantAList.body as Array<{ id: string }>).map((row) => row.id);
    const idsB = (tenantBList.body as Array<{ id: string }>).map((row) => row.id);
    for (const id of idsA) {
      expect(idsB).not.toContain(id);
    }

    if (idsA[0]) {
      const crossGet = await api(`/tenants/${tenantB}/voicemails/${idsA[0]}`, {
        headers: tenantHeaders(adminToken, tenantB),
      });
      expect([403, 404]).toContain(crossGet.status);
    }
  });
});
