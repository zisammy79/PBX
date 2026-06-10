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

describeIntegration('tenant AI management APIs', () => {
  let ownerToken: string;
  let tenantId: string;
  let transferExtensionId: string;
  let providerConnectionId: string;
  let agentId: string;

  beforeAll(async () => {
    const { readFile } = await import('node:fs/promises');
    const bootstrapPath = join(REPO_ROOT, 'packages/database/.local/bootstrap-admin.json');
    const bootstrap = await readFile(bootstrapPath, 'utf8').catch(() => null);
    let adminPassword = process.env.DEV_ADMIN_PASSWORD;
    if (!adminPassword && bootstrap) {
      adminPassword = JSON.parse(bootstrap).password;
    }
    if (!adminPassword) {
      throw new Error('Set DEV_ADMIN_PASSWORD or run db:seed');
    }
    const adminEmail = process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local';

    const login = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect([200, 201]).toContain(login.status);
    const adminToken = login.body.accessToken;

    const ownerEmail = `ai-owner-${Date.now()}@tenant.test`;
    const tenant = await api('/tenants', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'AI Tenant',
        slug: `ai-${Date.now()}`,
        ownerEmail,
        ownerDisplayName: 'AI Owner',
      }),
    });
    expect([200, 201]).toContain(tenant.status);
    tenantId = tenant.body.tenant.id;
    const tempPassword = tenant.body.owner.temporaryPassword;

    const ownerLogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: tempPassword }),
    });
    ownerToken = ownerLogin.body.accessToken;

    await api('/auth/change-password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: tempPassword,
        newPassword: 'OwnerSecurePass123!',
      }),
    });

    const relogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: 'OwnerSecurePass123!' }),
    });
    ownerToken = relogin.body.accessToken;

    const ext1002 = await api(`/tenants/${tenantId}/extensions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ extensionNumber: '1002', displayName: 'Human' }),
    });
    expect([200, 201]).toContain(ext1002.status);
    transferExtensionId = ext1002.body.extension.id;
  });

  it('creates provider connection without returning credentials', async () => {
    const created = await api('/ai/provider-connections', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerType: 'openai',
        name: 'OpenAI primary',
        credentials: { apiKey: 'sk-test-not-verified-1234567890' },
      }),
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.credentials).toBeUndefined();
    expect(created.body.externalValidationStatus).toBe('NOT_TESTED');
    expect(created.body.configured).toBe(true);
    providerConnectionId = created.body.id;
  });

  it('returns NOT_TESTED for provider test endpoint', async () => {
    const result = await api(`/ai/provider-connections/${providerConnectionId}/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect([200, 201]).toContain(result.status);
    expect(result.body.status).toBe('NOT_TESTED');
    expect(result.body.reason).toMatch(/deferred/i);
    expect(result.body.valid).toBeUndefined();
  });

  it('creates agent with immutable version and activates route', async () => {
    const created = await api('/ai/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Support Agent',
        routeNumber: '8999',
        transferExtensionId,
        transferDestinationAliases: { human_support: '1002' },
        providerConnectionId,
        provider: 'openai',
        model: 'gpt-4o-realtime-preview',
        allowedTools: ['transfer_call', 'end_call'],
        bargeIn: { enabled: true, thresholdMs: 100 },
      }),
    });
    expect([200, 201]).toContain(created.status);
    agentId = created.body.id;
    expect(created.body.versions?.[0]?.version).toBe(1);

    const activated = await api(`/ai/agents/${agentId}/activate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect([200, 201]).toContain(activated.status);
    expect(activated.body.status).toBe('active');
  });

  it('lists versions after update creates version 2', async () => {
    const updated = await api(`/ai/agents/${agentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ openingMessage: 'Hello, how can I help?' }),
    });
    expect([200, 201]).toContain(updated.status);
    expect(updated.body.newVersion?.version).toBe(2);

    const versions = await api(`/ai/agents/${agentId}/versions`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(versions.status).toBe(200);
    expect(versions.body.length).toBeGreaterThanOrEqual(2);
  });

  it('creates http_webhook tool with allowlist validation', async () => {
    const created = await api('/ai/tools', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'http_webhook',
        config: {
          allowedHosts: ['hooks.example.com'],
        },
      }),
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.name).toBe('http_webhook');
  });

  it('lists AI usage with pagination envelope', async () => {
    const usage = await api('/ai/usage?page=1&limit=10', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(usage.status).toBe(200);
    expect(Array.isArray(usage.body.items)).toBe(true);
    expect(usage.body.page).toBe(1);
  });

  it('lists AI sessions with pagination envelope', async () => {
    const sessions = await api('/ai/sessions?page=1&limit=10', {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
      },
    });
    expect(sessions.status).toBe(200);
    expect(Array.isArray(sessions.body.items)).toBe(true);
  });

  it('previews invoice from platform-measured usage without Stripe', async () => {
    const preview = await api('/invoices/preview', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        periodStart: new Date(Date.now() - 86400000).toISOString(),
        periodEnd: new Date().toISOString(),
        currency: 'USD',
      }),
    });
    expect([200, 201]).toContain(preview.status);
    expect(preview.body.metadata.stripeStatus).toBe('DISABLED');
    expect(preview.body.metadata.providerCostStatus).toBe('UNAVAILABLE');
  });
});
