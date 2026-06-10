import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { and, eq } from 'drizzle-orm';
import {
  aiAgents,
  aiSessions,
  callEvents,
  callLegs,
  calls,
  createDatabase,
  extensions,
  plans,
  priceBooks,
  sipCredentials,
  creditLedger,
  invoices,
  subscriptions,
  tenantMemberships,
  tenants,
  usageEvents,
  users,
  withBypassRls,
  withTenantContext,
} from './index.js';
import { decryptSecret, hashPassword } from '@pbx/shared';

const ROOT = join(fileURLToPath(new URL('../../..', import.meta.url)));
const CREDENTIALS_PATH = join(ROOT, '.local/demo-credentials.json');
const PROVISION_ENV = join(ROOT, '.local/demo-provision.env');
const PROVISION_SECRETS = join(ROOT, '.local/demo-provision.secrets.json');

const OWNER_EMAIL = 'owner@demo-company.local';
const OWNER_PASSWORD = 'DemoOwnerPass123!';

type ApiResult = { status: number; body: Record<string, unknown> | unknown[] };

async function loadEnvFile() {
  const envPath = join(ROOT, '.env.demo');
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  const base = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
  const res = await fetch(`${base}/api/v1${path}`, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> | unknown[];
  return { status: res.status, body };
}

function tenantHeaders(token: string, tenantId: string, json = false) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function login(email: string, password: string) {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${email}`);
  }
  return String((res.body as Record<string, unknown>).accessToken);
}

async function resolveAdminToken() {
  const bootstrapPath = join(ROOT, 'packages/database/.local/bootstrap-admin.json');
  let password = process.env.DEV_ADMIN_PASSWORD;
  try {
    const bootstrap = JSON.parse(await readFile(bootstrapPath, 'utf8')) as { password?: string };
    password = bootstrap.password ?? password;
  } catch {
    // use env password
  }
  if (!password) throw new Error('Admin password unavailable — run db:seed');
  return login(process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local', password);
}

async function resetDemoTenant(slug: string) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const { db, close } = createDatabase({ url });
  await withBypassRls(db, async (adminDb) => {
    const [row] = await adminDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!row) return;
    const tenantId = row.id;
    await adminDb.delete(creditLedger).where(eq(creditLedger.tenantId, tenantId));
    await adminDb.delete(invoices).where(eq(invoices.tenantId, tenantId));
    await adminDb.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    await adminDb.delete(tenants).where(eq(tenants.id, tenantId));
  });
  await close();
}

async function ensureTenantUser(
  db: ReturnType<typeof createDatabase>['db'],
  tenantId: string,
  email: string,
  displayName: string,
  roles: string[],
  password: string,
) {
  await withBypassRls(db, async (adminDb) => {
    let [user] = await adminDb.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await adminDb
        .insert(users)
        .values({
          email,
          displayName,
          passwordHash: hashPassword(password),
          status: 'active',
          passwordMustChange: false,
        })
        .returning();
    } else {
      await adminDb
        .update(users)
        .set({ passwordHash: hashPassword(password), status: 'active', passwordMustChange: false })
        .where(eq(users.id, user.id));
    }
    const [membership] = await adminDb
      .select()
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.userId, user!.id), eq(tenantMemberships.tenantId, tenantId)))
      .limit(1);
    if (!membership) {
      await adminDb.insert(tenantMemberships).values({ tenantId, userId: user!.id, roles });
    }
  });
}

async function resolveExtensionSip(
  db: ReturnType<typeof createDatabase>['db'],
  tenantId: string,
  extensionId: string,
) {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY!;
  return withBypassRls(db, async (adminDb) => {
    const [row] = await adminDb
      .select()
      .from(sipCredentials)
      .where(and(eq(sipCredentials.tenantId, tenantId), eq(sipCredentials.extensionId, extensionId)))
      .limit(1);
    if (!row) throw new Error(`Missing SIP credentials for extension ${extensionId}`);
    return {
      username: row.username,
      secret: decryptSecret(row.secretEncrypted, masterKey),
    };
  });
}

async function seedDemo() {
  await loadEnvFile();
  const slug = process.env.DEMO_TENANT_SLUG ?? 'demo-company';
  const tenantName = process.env.DEMO_TENANT_NAME ?? 'Demo Company';
  const aiRoute = process.env.DEMO_AI_ROUTE ?? '8999';
  const behaviorRoute = process.env.DEMO_BEHAVIOR_AI_ROUTE ?? '8997';
  const webhookUrl = process.env.DEMO_WEBHOOK_URL ?? 'https://127.0.0.1:18443/demo-webhook';

  const adminToken = await resolveAdminToken();
  const tenantsList = (await api('/tenants', { headers: { Authorization: `Bearer ${adminToken}` } })).body as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  let tenant = tenantsList.find((t) => t.slug === slug);

  if (!tenant) {
    const created = await api('/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tenantName,
        slug,
        ownerEmail: OWNER_EMAIL,
        ownerDisplayName: 'Demo Owner',
      }),
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`Failed to create demo tenant: ${JSON.stringify(created.body)}`);
    }
    tenant = (created.body as { tenant: { id: string; slug: string; name: string } }).tenant;
    const tempPassword = (created.body as { owner?: { temporaryPassword?: string } }).owner?.temporaryPassword;
    if (tempPassword) {
      const invitedToken = await login(OWNER_EMAIL, tempPassword);
      await api('/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${invitedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: tempPassword, newPassword: OWNER_PASSWORD }),
      });
    }
  }

  const tenantId = tenant!.id;
  const url = process.env.DATABASE_URL!;
  const { db, close } = createDatabase({ url });

  await ensureTenantUser(db, tenantId, OWNER_EMAIL, 'Demo Owner', ['tenant_owner'], OWNER_PASSWORD);
  await ensureTenantUser(db, tenantId, 'admin@demo-company.local', 'Demo Administrator', ['tenant_administrator'], 'DemoAdminPass123!');
  await ensureTenantUser(db, tenantId, 'billing@demo-company.local', 'Demo Billing Admin', ['tenant_billing_administrator'], 'DemoBillingPass123!');
  await ensureTenantUser(db, tenantId, 'agent@demo-company.local', 'Demo Human Agent', ['human_agent'], 'DemoAgentPass123!');

  const ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);

  async function ensureExtension(number: string, displayName: string) {
    const listed = await api(`/tenants/${tenantId}/extensions`, {
      headers: tenantHeaders(adminToken, tenantId),
    });
    const rows = listed.body as Array<{ id: string; extensionNumber: string }>;
    const hit = rows.find((r) => r.extensionNumber === number);
    if (hit) {
      try {
        const sip = await resolveExtensionSip(db, tenantId, hit.id);
        return { id: hit.id, extensionNumber: number, sipCredential: sip };
      } catch {
        await withBypassRls(db, async (adminDb) => {
          await adminDb.delete(sipCredentials).where(eq(sipCredentials.extensionId, hit.id));
          await adminDb.delete(extensions).where(eq(extensions.id, hit.id));
        });
      }
    }
    const created = await api(`/tenants/${tenantId}/extensions`, {
      method: 'POST',
      headers: tenantHeaders(adminToken, tenantId, true),
      body: JSON.stringify({ extensionNumber: number, displayName }),
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`Failed to create extension ${number}`);
    }
    const body = created.body as {
      extension: { id: string; extensionNumber: string };
      sipCredential: { username: string; secret: string };
    };
    return {
      id: body.extension.id,
      extensionNumber: body.extension.extensionNumber,
      sipCredential: body.sipCredential,
    };
  }

  const ext1 = await ensureExtension('1001', 'Demo Extension 1001');
  const ext2 = await ensureExtension('1002', 'Demo Extension 1002');

  await api('/telephony/configuration/activate', {
    method: 'POST',
    headers: tenantHeaders(adminToken, tenantId),
  });

  let connId = '';
  const conns = await api('/ai/provider-connections', { headers: tenantHeaders(ownerToken, tenantId) });
  const connRows = conns.body as Array<{ id: string; providerType: string }>;
  const existingConn = connRows.find((c) => c.providerType === 'deterministic-test');
  if (existingConn) {
    connId = existingConn.id;
  } else {
    const createdConn = await api('/ai/provider-connections', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({
        providerType: 'deterministic-test',
        name: 'Demo Deterministic Provider',
        credentials: {},
      }),
    });
    connId = String((createdConn.body as { id: string }).id);
  }

  const agents = await api('/ai/agents', { headers: tenantHeaders(ownerToken, tenantId) });
  const agentRows = (Array.isArray(agents.body) ? agents.body : []) as Array<{ id: string; routeNumber?: string }>;

  let agentId = agentRows.find((a) => a.routeNumber === aiRoute)?.id ?? '';
  if (!agentId) {
    const createdAgent = await api('/ai/agents', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({
        name: 'Demo Deterministic AI',
        description: 'Local deterministic demo agent',
        routeNumber: aiRoute,
        transferExtensionId: ext2.id,
        transferDestinationAliases: { human_support: '1002' },
        providerConnectionId: connId,
        provider: 'deterministic-test',
        model: 'deterministic-v1',
        voice: 'default',
        language: 'en',
        systemInstructions: 'Demo deterministic agent for local product demo.',
        openingMessage: 'Demo AI ready.',
        allowedTools: ['transfer_call', 'end_call'],
        bargeIn: { enabled: true, thresholdMs: 100 },
      }),
    });
    agentId = String((createdAgent.body as { id: string }).id);
  }

  await withBypassRls(db, async (adminDb) => {
    await adminDb
      .update(aiAgents)
      .set({ transferExtensionId: ext2.id, updatedAt: new Date() })
      .where(eq(aiAgents.tenantId, tenantId));
  });

  await api(`/ai/agents/${agentId}`, {
    method: 'PATCH',
    headers: tenantHeaders(ownerToken, tenantId, true),
    body: JSON.stringify({
      transferDestinationAliases: { human_support: '1002' },
    }),
  });

  await api(`/ai/agents/${agentId}/activate`, {
    method: 'POST',
    headers: tenantHeaders(ownerToken, tenantId),
  });

  let agentVersionId = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [agentRow] = await withBypassRls(db, async (adminDb) =>
      adminDb.select().from(aiAgents).where(eq(aiAgents.id, agentId)).limit(1),
    );
    if (agentRow?.activeVersionId) {
      agentVersionId = agentRow.activeVersionId;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!agentVersionId) throw new Error('Demo AI agent has no active version');

  if (!agentRows.find((a) => a.routeNumber === behaviorRoute)) {
    const behaviorAgent = await api('/ai/agents', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({
        name: 'Demo Behavior AI',
        description: 'Barge-in and transfer demo agent',
        routeNumber: behaviorRoute,
        transferExtensionId: ext2.id,
        transferDestinationAliases: { human_support: '1002' },
        providerConnectionId: connId,
        provider: 'deterministic-test',
        model: 'deterministic-behavior-v1',
        voice: 'default',
        language: 'en',
        systemInstructions: 'Demo behavior agent.',
        openingMessage: 'Behavior demo ready.',
        allowedTools: ['transfer_call', 'end_call'],
        bargeIn: { enabled: true, thresholdMs: 100 },
      }),
    });
    const behaviorId = String((behaviorAgent.body as { id: string }).id);
    await api(`/ai/agents/${behaviorId}/activate`, {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId),
    });
  }

  await api('/telephony/configuration/activate', {
    method: 'POST',
    headers: tenantHeaders(ownerToken, tenantId),
  });

  const demoCallMarker = `demo-internal-${tenantId}`;
  await withTenantContext(db, tenantId, async (tenantDb) => {
    const [existingUsage] = await tenantDb
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.idempotencyKey, demoCallMarker))
      .limit(1);
    if (!existingUsage) {
      const callId = randomUUID();
      const correlationId = randomUUID();
      const startedAt = new Date(Date.now() - 3600000);
      const endedAt = new Date(Date.now() - 3500000);
      await tenantDb.insert(calls).values({
        id: callId,
        tenantId,
        correlationId,
        direction: 'internal',
        status: 'completed',
        callerNumber: '1001',
        calleeNumber: '1002',
        fromExtensionId: ext1.id,
        toExtensionId: ext2.id,
        asteriskBridgeId: `demo-bridge-${callId.slice(0, 8)}`,
        startedAt,
        answeredAt: new Date(startedAt.getTime() + 2000),
        endedAt,
        durationSeconds: 100,
        billableSeconds: 100,
        hangupCause: 'normal_clearing',
      });
      await tenantDb.insert(callLegs).values([
        { tenantId, callId, legType: 'caller', channelId: `demo-ch-caller-${callId.slice(0, 8)}` },
        { tenantId, callId, legType: 'callee', channelId: `demo-ch-callee-${callId.slice(0, 8)}` },
      ]);
      for (const eventType of ['CREATED', 'RINGING', 'ANSWERED', 'BRIDGED', 'COMPLETED']) {
        await tenantDb.insert(callEvents).values({ tenantId, callId, eventType, payload: { demo: true } });
      }
      await tenantDb.insert(usageEvents).values({
        idempotencyKey: demoCallMarker,
        tenantId,
        resourceType: 'call',
        meterName: 'internal_call_minutes',
        quantity: '1.67',
        unit: 'minutes',
        eventTimestamp: endedAt,
        source: 'PLATFORM_MEASURED',
        integrityHash: createHash('sha256').update(demoCallMarker).digest('hex'),
        callId,
        dimensions: { demo: true },
        costMetadata: { providerCostStatus: 'UNAVAILABLE' },
      });

      const aiCallId = randomUUID();
      const aiSessionId = randomUUID();
      await tenantDb.insert(calls).values({
        id: aiCallId,
        tenantId,
        correlationId: randomUUID(),
        direction: 'inbound',
        status: 'completed',
        callerNumber: '1001',
        calleeNumber: aiRoute,
        aiAgentId: agentId,
        startedAt: new Date(Date.now() - 1800000),
        endedAt: new Date(Date.now() - 1700000),
        durationSeconds: 120,
      });
      await tenantDb.insert(aiSessions).values({
        id: aiSessionId,
        tenantId,
        callId: aiCallId,
        agentId,
        agentVersionId,
        providerConnectionId: connId,
        providerType: 'deterministic-test',
        status: 'completed',
        state: 'COMPLETED',
        correlationId: randomUUID(),
        diagnostics: {
          media: { rtpPacketsReceived: 120, rtpPacketsSent: 118, rtpBytesReceived: 19200, rtpBytesSent: 18880 },
          behavior: {
            interruptionDetectedAt: new Date(Date.now() - 1750000).toISOString(),
            queuedFramesDiscarded: 4,
            transferTarget: '1002',
            transferAlias: 'human_support',
          },
        },
        startedAt: new Date(Date.now() - 1800000),
        endedAt: new Date(Date.now() - 1700000),
      });
    }
  });

  const planList = await api('/plans', { headers: { Authorization: `Bearer ${adminToken}` } });
  const plansRows = planList.body as Array<{ id: string; priceBookId: string; slug: string }>;
  let planId = plansRows.find((p) => p.slug === 'demo-starter')?.id ?? '';
  let priceBookId = plansRows[0]?.priceBookId ?? '';

  if (!priceBookId) {
    await withBypassRls(db, async (adminDb) => {
      const [book] = await adminDb
        .insert(priceBooks)
        .values({ name: 'Demo Price Book', currency: 'USD', effectiveFrom: new Date(), isActive: true })
        .returning();
      priceBookId = book!.id;
    });
  }

  if (!planId) {
    const plan = await api('/plans', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Demo Starter',
        slug: 'demo-starter',
        priceBookId,
        monthlyAmount: '29.00',
        currency: 'USD',
        entitlements: [{ meterName: 'internal_call_minutes', includedQuantity: '100', unit: 'minutes' }],
      }),
    });
    planId = String((plan.body as { id: string }).id);
  }

  await withBypassRls(db, async (adminDb) => {
    const [sub] = await adminDb.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
    if (!sub) {
      await adminDb.insert(subscriptions).values({
        tenantId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
      });
    }
  });

  await api('/billing/rate', { method: 'POST', headers: tenantHeaders(ownerToken, tenantId) });

  const preview = await api('/invoices/preview', {
    method: 'POST',
    headers: tenantHeaders(ownerToken, tenantId, true),
    body: JSON.stringify({
      periodStart: new Date(Date.now() - 86400000 * 7).toISOString(),
      periodEnd: new Date().toISOString(),
      currency: 'USD',
    }),
  });
  if (preview.status !== 200 && preview.status !== 201) {
    throw new Error('Invoice preview failed during demo seed');
  }

  const invoiceKey = `demo-invoice-${tenantId}`;
  const generated = await api('/invoices/generate', {
    method: 'POST',
    headers: { ...tenantHeaders(ownerToken, tenantId, true), 'Idempotency-Key': invoiceKey },
    body: JSON.stringify({
      periodStart: new Date(Date.now() - 86400000 * 7).toISOString(),
      periodEnd: new Date().toISOString(),
      currency: 'USD',
      idempotencyKey: invoiceKey,
    }),
  });
  const invoiceId = String((generated.body as { id?: string }).id ?? '');
  if (invoiceId) {
    await api(`/invoices/${invoiceId}/finalize`, {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId),
    });
  }

  await api('/credits/adjustments', {
    method: 'POST',
    headers: { ...tenantHeaders(ownerToken, tenantId, true), 'Idempotency-Key': `demo-credit-${tenantId}` },
    body: JSON.stringify({ amount: '15.00', currency: 'USD', reason: 'demo_credit' }),
  });

  let appId = '';
  const apps = await api('/api-applications', { headers: tenantHeaders(ownerToken, tenantId) });
  const appRows = apps.body as Array<{ id: string; name: string }>;
  const existingApp = appRows.find((a) => a.name === 'Demo API Application');
  if (existingApp) {
    appId = existingApp.id;
  } else {
    const app = await api('/api-applications', {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({
        name: 'Demo API Application',
        description: 'Local demo scoped API application',
        scopes: ['calls.read', 'usage.read'],
      }),
    });
    appId = String((app.body as { id: string }).id);
  }

  let apiKey = '';
  try {
    const existingCreds = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8')) as { apiKey?: string; tenantId?: string };
    if (existingCreds.tenantId === tenantId && existingCreds.apiKey) {
      apiKey = existingCreds.apiKey;
    }
  } catch {
    // create new key below
  }
  if (!apiKey) {
    const key = await api(`/api-applications/${appId}/keys`, {
      method: 'POST',
      headers: tenantHeaders(ownerToken, tenantId, true),
      body: JSON.stringify({ displayName: 'Demo scoped key', scopes: ['calls.read', 'usage.read'] }),
    });
    apiKey = String((key.body as { secret?: string }).secret ?? '');
  }

  execSync(`bash "${join(ROOT, 'scripts/demo/webhook-fixture.sh')}" start`, { stdio: 'ignore' });

  await withBypassRls(db, async (adminDb) => {
    const { webhookDeliveries, webhookEndpoints } = await import('@pbx/database/schema/api');
    const existingEndpoints = await adminDb
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, tenantId));
    for (const endpoint of existingEndpoints) {
      await adminDb.delete(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpoint.id));
      await adminDb.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id));
    }
  });

  let webhookEndpointId = '';
  const hook = await api('/webhooks', {
    method: 'POST',
    headers: { ...tenantHeaders(ownerToken, tenantId, true), 'Idempotency-Key': `demo-webhook-${tenantId}-${Date.now()}` },
    body: JSON.stringify({
      url: webhookUrl,
      description: 'Local demo webhook fixture',
      eventTypes: ['call.completed'],
      isActive: true,
    }),
  });
  if (hook.status !== 200 && hook.status !== 201) {
    throw new Error(`Webhook endpoint creation failed: ${JSON.stringify(hook.body)}`);
  }
  webhookEndpointId = String(
    (hook.body as { endpoint?: { id: string } }).endpoint?.id ?? (hook.body as { id?: string }).id ?? '',
  );
  if (!webhookEndpointId) {
    throw new Error('Failed to create or resolve demo webhook endpoint');
  }

  const demoDeliveryKey = `demo-webhook-delivery-${tenantId}`;
  await withBypassRls(db, async (adminDb) => {
    const { platformEvents, webhookDeliveries, webhookEndpoints } = await import('@pbx/database/schema/api');
    const [endpoint] = await adminDb
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, webhookEndpointId))
      .limit(1);
    if (!endpoint) return;

    const [existingDelivery] = await adminDb
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.tenantId, tenantId), eq(webhookDeliveries.endpointId, webhookEndpointId)))
      .limit(1);

    if (!existingDelivery || existingDelivery.status !== 'delivered') {
      const eventId = randomUUID();
      await adminDb.insert(platformEvents).values({
        id: eventId,
        tenantId,
        eventType: 'call.completed',
        correlationId: randomUUID(),
        payload: { demo: true, marker: demoDeliveryKey },
      });
      await adminDb.insert(webhookDeliveries).values({
        tenantId,
        endpointId: webhookEndpointId,
        eventId,
        eventType: 'call.completed',
        payload: {
          id: eventId,
          type: 'call.completed',
          apiVersion: 'v1',
          tenantId,
          createdAt: new Date().toISOString(),
          data: { demo: true, marker: demoDeliveryKey },
        },
        status: 'pending',
        nextAttemptAt: new Date(),
        correlationId: randomUUID(),
        secretVersion: endpoint.secretVersion,
      });
    }
  });

  for (let i = 0; i < 30; i += 1) {
    const deliveries = await api(`/webhooks/${webhookEndpointId}/deliveries`, {
      headers: tenantHeaders(ownerToken, tenantId),
    });
    const delivered = (deliveries.body as Array<{ status: string }>).some((d) => d.status === 'delivered');
    if (delivered) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  await close();

  await mkdir(join(ROOT, '.local'), { recursive: true });
  const credentials = {
    tenantId,
    tenantName,
    tenantSlug: slug,
    ownerEmail: OWNER_EMAIL,
    ownerPassword: OWNER_PASSWORD,
    ownerToken,
    platformAdminEmail: process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local',
    users: {
      owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD, role: 'tenant_owner' },
      administrator: { email: 'admin@demo-company.local', password: 'DemoAdminPass123!', role: 'tenant_administrator' },
      billing: { email: 'billing@demo-company.local', password: 'DemoBillingPass123!', role: 'tenant_billing_administrator' },
      agent: { email: 'agent@demo-company.local', password: 'DemoAgentPass123!', role: 'human_agent' },
    },
    extensions: { ext1001: ext1.id, ext1002: ext2.id },
    aiAgentId: agentId,
    aiRoute,
    behaviorRoute,
    apiApplicationId: appId,
    apiKey,
    webhookEndpointId,
    generatedAt: new Date().toISOString(),
    note: 'Local demo credentials — do not commit.',
  };
  await writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  await chmod(CREDENTIALS_PATH, 0o600);

  await writeFile(
    PROVISION_ENV,
    [
      `STAGE7_TENANT_ID=${tenantId}`,
      `STAGE7_SLUG=${slug}`,
      `STAGE7_SIP1_USER=${ext1.sipCredential.username}`,
      `STAGE7_SIP2_USER=${ext2.sipCredential.username}`,
      `STAGE8_AI_ROUTE=${aiRoute}`,
      `STAGE8_BEHAVIOR_AI_ROUTE=${behaviorRoute}`,
    ].join('\n') + '\n',
  );
  await writeFile(
    PROVISION_SECRETS,
    JSON.stringify(
      {
        sip1: { u: ext1.sipCredential.username, p: ext1.sipCredential.secret },
        sip2: { u: ext2.sipCredential.username, p: ext2.sipCredential.secret },
      },
      null,
      2,
    ),
  );
  await chmod(PROVISION_SECRETS, 0o600);

  await writeFile(
    join(ROOT, '.stage8-provision.env'),
    `STAGE8_AI_ROUTE=${aiRoute}\nSTAGE8_AI_AGENT_ID=${agentId}\nSTAGE8_AI_PROVIDER_CONN_ID=${connId}\nSTAGE8_TENANT_ID=${tenantId}\nSTAGE8_SLUG=${slug}\n`,
  );
  await writeFile(
    join(ROOT, '.stage8-behavior.env'),
    `STAGE8_BEHAVIOR_AI_ROUTE=${behaviorRoute}\nSTAGE8_BEHAVIOR_AGENT_ID=${agentId}\nSTAGE8_BEHAVIOR_TENANT_ID=${tenantId}\n`,
  );

  console.log(`Demo tenant seeded: ${tenantName} (${tenantId})`);
  console.log(`Credentials: ${CREDENTIALS_PATH}`);
}

async function main() {
  const mode = process.argv.includes('--reset') ? 'reset' : process.argv.includes('--seed') ? 'seed' : '';

  if (mode === 'reset') {
    await loadEnvFile();
    await resetDemoTenant(process.env.DEMO_TENANT_SLUG ?? 'demo-company');
    console.log('Demo tenant reset');
    return;
  }
  if (mode === 'seed') {
    await seedDemo();
    return;
  }
  console.error('Usage: demo-seed-core.ts --seed | --reset');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
