import { describe, expect, it, beforeAll } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function tenantHeaders(token: string, tenantId: string, withJsonBody = false) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
  };
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

describeIntegration('billing rating and invoices', () => {
  let adminToken: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let tenantId: string;
  let otherTenantId: string;
  let priceBookId: string;
  let planId: string;

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

    const ownerEmail = `billing-owner-${Date.now()}@tenant.test`;
    const tenant = await api('/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Billing Tenant',
        slug: `billing-${Date.now()}`,
        ownerEmail,
        ownerDisplayName: 'Billing Owner',
      }),
    });
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
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
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

    const otherEmail = `billing-other-${Date.now()}@tenant.test`;
    const otherTenant = await api('/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Other Billing Tenant',
        slug: `billing-other-${Date.now()}`,
        ownerEmail: otherEmail,
        ownerDisplayName: 'Other Owner',
      }),
    });
    otherTenantId = otherTenant.body.tenant.id;
    const otherTemp = otherTenant.body.owner.temporaryPassword;
    const otherLogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: otherTemp }),
    });
    otherOwnerToken = otherLogin.body.accessToken;
    await api('/auth/change-password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${otherLogin.body.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: otherTemp,
        newPassword: 'OtherSecurePass123!',
      }),
    });
    const otherRelogin = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'OtherSecurePass123!' }),
    });
    otherOwnerToken = otherRelogin.body.accessToken;

    const books = await api('/prices', { headers: { Authorization: `Bearer ${adminToken}` } });
    if (books.body.length > 0) {
      priceBookId = books.body[0].priceBookId;
    } else {
      const planList = await api('/plans', { headers: { Authorization: `Bearer ${adminToken}` } });
      priceBookId = planList.body[0]?.priceBookId;
    }

    await api('/prices', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceBookId,
        meterName: 'ai_tool_calls',
        unitAmount: '0.50',
        unit: 'count',
        pricingModel: 'PER_UNIT',
      }),
    });

    const plan = await api('/plans', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Billing Test Plan',
        slug: `billing-plan-${Date.now()}`,
        priceBookId,
        monthlyAmount: '29.00',
        currency: 'USD',
        entitlements: [{ meterName: 'ai_tool_calls', includedQuantity: '5', unit: 'count' }],
      }),
    });
    planId = plan.body.id;

    const { createDatabase, subscriptions, withBypassRls } = await import('@pbx/database');
    const url = process.env.DATABASE_URL!;
    const { db, close } = createDatabase({ url });
    await withBypassRls(db, async (adminDb) => {
      await adminDb.insert(subscriptions).values({
        tenantId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
      });
    });
    await close();
  });

  it('rates usage idempotently from normalized usage events', async () => {
    const { createDatabase, usageEvents, withTenantContext } = await import('@pbx/database');
    const url = process.env.DATABASE_URL!;
    const { db, close } = createDatabase({ url });
    const key = `billing-test-${randomUUID()}`;
    await withTenantContext(db, tenantId, async (tenantDb) => {
      await tenantDb.insert(usageEvents).values({
        idempotencyKey: key,
        tenantId,
        resourceType: 'ai',
        meterName: 'ai_tool_calls',
        quantity: '10',
        unit: 'count',
        eventTimestamp: new Date(),
        source: 'PLATFORM_MEASURED',
        integrityHash: createHash('sha256').update(key).digest('hex'),
        dimensions: { origin: 'test' },
        costMetadata: { providerCostStatus: 'UNAVAILABLE' },
      });
    });
    await close();

    const rate1 = await api('/billing/rate', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId),
    });
    expect([200, 201]).toContain(rate1.status);
    expect(rate1.body.rated).toBeGreaterThanOrEqual(1);

    const rate2 = await api('/billing/rate', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId),
    });
    expect(rate2.body.skipped).toBeGreaterThanOrEqual(1);
  });

  it('marks missing price as unrated not silent zero', async () => {
    const { createDatabase, usageEvents, withTenantContext } = await import('@pbx/database');
    const url = process.env.DATABASE_URL!;
    const { db, close } = createDatabase({ url });
    const key = `unrated-${randomUUID()}`;
    await withTenantContext(db, tenantId, async (tenantDb) => {
      await tenantDb.insert(usageEvents).values({
        idempotencyKey: key,
        tenantId,
        resourceType: 'ai',
        meterName: 'unsupported_meter_xyz',
        quantity: '1',
        unit: 'count',
        eventTimestamp: new Date(),
        source: 'PLATFORM_MEASURED',
        integrityHash: createHash('sha256').update(key).digest('hex'),
        dimensions: {},
        costMetadata: { providerCostStatus: 'UNAVAILABLE' },
      });
    });
    await close();

    await api('/billing/rate', { method: 'POST', headers: tenantHeaders(ownerToken, tenantId) });
    const rated = await api('/rated-usage', { headers: tenantHeaders(ownerToken, tenantId) });
    const unratedRow = rated.body.find(
      (r: { ratingStatus?: string; meterName?: string }) =>
        r.meterName === 'unsupported_meter_xyz' && r.ratingStatus === 'unrated',
    );
    expect(unratedRow).toBeTruthy();
    expect(unratedRow.reconciliationStatus).toBe('missing_price');
  });

  it('previews invoice with tax, allowance, stripe disabled, and provider cost unavailable', async () => {
    const preview = await api('/invoices/preview', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({
        periodStart: new Date(Date.now() - 86400000).toISOString(),
        periodEnd: new Date(Date.now() + 86400000).toISOString(),
        currency: 'USD',
      }),
    });
    expect([200, 201]).toContain(preview.status);
    expect(preview.body.metadata.stripeStatus).toBe('DISABLED');
    expect(preview.body.metadata.providerCostStatus).toBe('UNAVAILABLE');
    expect(Number(preview.body.subtotal)).toBeGreaterThanOrEqual(0);
    const subscriptionLine = preview.body.lines.find(
      (l: { lineType: string }) => l.lineType === 'subscription',
    );
    expect(subscriptionLine).toBeTruthy();
  });

  it('generates, finalizes, and prevents duplicate invoice generation', async () => {
    const periodStart = new Date(Date.now() - 86400000).toISOString();
    const periodEnd = new Date(Date.now() + 86400000).toISOString();
    const idempotencyKey = `invoice-test-${randomUUID()}`;

    const generated = await api('/invoices/generate', {
      method: 'POST',
      headers: { ...tenantHeaders(ownerToken, tenantId, true), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ periodStart, periodEnd, currency: 'USD', idempotencyKey }),
    });
    expect([200, 201]).toContain(generated.status);
    expect(generated.body.duplicate).toBe(false);
    const invoiceId = generated.body.invoice.id;

    const dup = await api('/invoices/generate', {
      method: 'POST',
      headers: { ...tenantHeaders(ownerToken, tenantId, true), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ periodStart, periodEnd, currency: 'USD', idempotencyKey }),
    });
    expect(dup.body.duplicate).toBe(true);

    const finalized = await api(`/invoices/${invoiceId}/finalize`, {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId),
    });
    expect([200, 201]).toContain(finalized.status);
    expect(finalized.body.invoice.status).toBe('finalized');

    const detail = await api(`/invoices/${invoiceId}`, {
      headers: tenantHeaders(ownerToken, tenantId),
    });
    expect(detail.body.invoice.status).toBe('finalized');
    expect(detail.body.lines.length).toBeGreaterThan(0);
    for (const line of detail.body.lines) {
      expect(line.snapshot).toBeTruthy();
    }
  });

  it('applies manual credit adjustment append-only', async () => {
    const credit = await api('/credits/adjustments', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({ amount: '10.00', currency: 'USD', reason: 'manual_credit_test' }),
    });
    expect([200, 201]).toContain(credit.status);
    expect(Number(credit.body.balanceAfter)).toBeGreaterThan(0);

    const credits = await api('/credits', { headers: tenantHeaders(ownerToken, tenantId) });
    expect(credits.body.length).toBeGreaterThan(0);
  });

  it('credit adjustment is idempotent with Idempotency-Key', async () => {
    const key = `credit-idem-${Date.now()}`;
    const headers = {
      ...tenantHeaders(ownerToken, tenantId, true),
      'Idempotency-Key': key,
    };
    const body = JSON.stringify({ amount: '3.00', currency: 'USD', reason: 'idempotent_credit' });
    const first = await api('/credits/adjustments', { method: 'POST', headers, body });
    const second = await api('/credits/adjustments', { method: 'POST', headers, body });
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    expect(first.body.id).toBe(second.body.id);
  });

  it('rejects currency mismatch on credit adjustment', async () => {
    const bad = await api('/credits/adjustments', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({ amount: '5.00', currency: 'EUR', reason: 'currency_mismatch_test' }),
    });
    expect(bad.status).toBe(400);
  });

  it('denies cross-tenant invoice access', async () => {
    const invoices = await api('/invoices', { headers: tenantHeaders(otherOwnerToken, otherTenantId) });
    expect(invoices.status).toBe(200);

    const cross = await api('/invoices', {
      headers: tenantHeaders(otherOwnerToken, tenantId),
    });
    expect(cross.status).toBe(403);
  });

  it('lists plans and prices for billing admin', async () => {
    const plansRes = await api('/plans', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(plansRes.status).toBe(200);
    expect(Array.isArray(plansRes.body)).toBe(true);

    const pricesRes = await api('/prices', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(pricesRes.status).toBe(200);
    expect(Array.isArray(pricesRes.body)).toBe(true);
  });
});
