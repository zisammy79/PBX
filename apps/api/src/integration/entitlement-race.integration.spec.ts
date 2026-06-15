import { describe, expect, it, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { resolveAdminEmail, resolveAdminPassword } from './admin-auth.js';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describeIntegration('entitlement race safety', () => {
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

    const slug = `race-${Date.now()}`;
    const created = await api('/tenants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Race Tenant',
        slug,
        ownerEmail: `race-owner-${Date.now()}@tenant.test`,
        ownerDisplayName: 'Race Owner',
      }),
    });
    tenantId = created.body.tenant.id;

    execSync(
      `docker exec pbx-postgres psql -U pbx -d pbx -q -c "INSERT INTO tenant_limit_overrides (tenant_id, dimension, limit_value) VALUES ('${tenantId}', 'max_active_extensions', 1) ON CONFLICT (tenant_id, dimension) DO UPDATE SET limit_value = 1, updated_at = NOW()"`,
    );
  });

  it('allows only one extension create when max_active_extensions=1 under concurrent load', async () => {
    const attempts = await Promise.all(
      ['2001', '2002'].map((extensionNumber) =>
        api(`/tenants/${tenantId}/extensions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'X-Tenant-Id': tenantId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extensionNumber, displayName: extensionNumber }),
        }),
      ),
    );

    const successes = attempts.filter((a) => a.status === 200 || a.status === 201);
    const blocked = attempts.filter((a) => a.status !== 200 && a.status !== 201);

    const list = await api(`/tenants/${tenantId}/extensions`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'X-Tenant-Id': tenantId },
    });
    const activeCount = (list.body as Array<{ status: string }>).filter((e) => e.status === 'active').length;

    expect(successes.length).toBe(1);
    expect(blocked.length).toBe(1);
    expect(blocked[0]?.body?.code ?? blocked[0]?.body?.details?.code).toBe('ENTITLEMENT_LIMIT_REACHED');
    expect(activeCount).toBe(1);
  });
});
