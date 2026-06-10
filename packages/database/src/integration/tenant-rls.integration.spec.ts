import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  aiAgents,
  apiApplications,
  apiKeys,
  callEvents,
  callRecordings,
  calls,
  createDatabase,
  extensions,
  sipCredentials,
  sipTrunks,
  tenantMemberships,
  tenants,
  usageEvents,
  users,
  withBypassRls,
  withTenantContext,
} from '../index.js';
import { encryptSecret, hashPassword, hashUsageEvent, tenantEndpointId } from '@pbx/shared';

const appUrl =
  process.env.DATABASE_APP_URL ??
  'postgresql://pbx_app:pbx_app_password@localhost:5433/pbx?sslmode=disable';

const migrationUrl =
  process.env.DATABASE_URL ??
  'postgresql://pbx:pbx_dev_password@localhost:5433/pbx?sslmode=disable';

const describeIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

describeIntegration('tenant RLS integration', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const runId = randomUUID().slice(0, 8);
  let extensionAId: string;
  let callAId: string;
  let slugA: string;
  let slugB: string;

  const appDb = createDatabase({ url: appUrl });
  const adminDb = createDatabase({ url: migrationUrl });

  beforeAll(async () => {
    slugA = `rls-a-${tenantA.slice(0, 8)}`;
    slugB = `rls-b-${tenantB.slice(0, 8)}`;
    await withBypassRls(adminDb.db, async (db) => {
      await db.insert(tenants).values([
        {
          id: tenantA,
          name: 'Tenant A',
          slug: slugA,
          status: 'active',
          asteriskContext: `t_${slugA}`,
        },
        {
          id: tenantB,
          name: 'Tenant B',
          slug: slugB,
          status: 'active',
          asteriskContext: `t_${slugB}`,
        },
      ]);
    });
  });

  afterAll(async () => {
    await withBypassRls(adminDb.db, async (db) => {
      for (const tenantId of [tenantA, tenantB]) {
        await db.delete(apiKeys).where(eq(apiKeys.tenantId, tenantId));
        await db.delete(callRecordings).where(eq(callRecordings.tenantId, tenantId));
        await db.delete(callEvents).where(eq(callEvents.tenantId, tenantId));
        await db.delete(usageEvents).where(eq(usageEvents.tenantId, tenantId));
        await db.delete(calls).where(eq(calls.tenantId, tenantId));
        await db.delete(sipCredentials).where(eq(sipCredentials.tenantId, tenantId));
        await db.delete(extensions).where(eq(extensions.tenantId, tenantId));
        await db.delete(sipTrunks).where(eq(sipTrunks.tenantId, tenantId));
        await db.delete(aiAgents).where(eq(aiAgents.tenantId, tenantId));
        await db.delete(tenantMemberships).where(eq(tenantMemberships.tenantId, tenantId));
        await db.delete(apiApplications).where(eq(apiApplications.tenantId, tenantId));
      }
      await db.delete(tenants).where(eq(tenants.id, tenantA));
      await db.delete(tenants).where(eq(tenants.id, tenantB));
    });
    await appDb.close();
    await adminDb.close();
  });

  it('denies cross-tenant extension reads without context', async () => {
    await withTenantContext(appDb.db, tenantA, async (db) => {
      const [ext] = await db
        .insert(extensions)
        .values({
          tenantId: tenantA,
          extensionNumber: '7001',
          displayName: 'A Desk',
          asteriskEndpointId: tenantEndpointId(slugA, '7001'),
          status: 'active',
        })
        .returning();
      extensionAId = ext!.id;

      await db.insert(sipCredentials).values({
        tenantId: tenantA,
        extensionId: extensionAId,
        username: `rls_a_7001_${runId}`,
        secretEncrypted: encryptSecret('secret-a', 'f'.repeat(64)),
      });
    });

    await withTenantContext(appDb.db, tenantB, async (db) => {
      const rows = await db.select().from(extensions).where(eq(extensions.id, extensionAId));
      expect(rows).toHaveLength(0);
    });
  });

  it('denies cross-tenant extension updates', async () => {
    await withTenantContext(appDb.db, tenantB, async (db) => {
      const updated = await db
        .update(extensions)
        .set({ displayName: 'Hacked' })
        .where(eq(extensions.id, extensionAId))
        .returning();
      expect(updated).toHaveLength(0);
    });
  });

  it('denies insert with mismatched tenant context', async () => {
    await expect(
      withTenantContext(appDb.db, tenantA, async (db) => {
        await db.insert(extensions).values({
          tenantId: tenantB,
          extensionNumber: '7002',
          displayName: 'Wrong Tenant',
          asteriskEndpointId: tenantEndpointId(slugB, '7002'),
          status: 'active',
        });
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('isolates calls, events, recordings, usage, trunks, ai agents, api keys', async () => {
    await withTenantContext(appDb.db, tenantA, async (db) => {
      const correlationId = randomUUID();
      const [call] = await db
        .insert(calls)
        .values({
          tenantId: tenantA,
          correlationId,
          direction: 'internal',
          status: 'completed',
        })
        .returning();
      callAId = call!.id;

      await db.insert(callEvents).values({
        tenantId: tenantA,
        callId: callAId,
        eventType: 'completed',
      });

      await db.insert(callRecordings).values({
        tenantId: tenantA,
        callId: callAId,
        status: 'available',
        storageKey: 'tenants/a/rec.wav',
      });

      await db.insert(usageEvents).values({
        idempotencyKey: `test-${randomUUID()}`,
        tenantId: tenantA,
        resourceType: 'internal_call',
        meterName: 'internal_call_seconds',
        quantity: '30',
        unit: 'seconds',
        eventTimestamp: new Date(),
        source: 'test',
        integrityHash: hashUsageEvent({ tenantId: tenantA }),
      });

      await db.insert(sipTrunks).values({
        tenantId: tenantA,
        name: 'Trunk A',
        slug: 'trunk-a',
        asteriskTrunkId: `a_trunk_${tenantA.slice(0, 8)}`,
      });

      await db.insert(aiAgents).values({
        tenantId: tenantA,
        name: 'Agent A',
      });

      const [app] = await db
        .insert(apiApplications)
        .values({ tenantId: tenantA, name: 'App A' })
        .returning();

      await db.insert(apiKeys).values({
        tenantId: tenantA,
        applicationId: app!.id,
        name: 'Key A',
        keyPrefix: `rls_${runId}`,
        keyHash: hashPassword('dummy-key'),
      });
    });

    await withTenantContext(appDb.db, tenantB, async (db) => {
      expect(await db.select().from(calls).where(eq(calls.id, callAId))).toHaveLength(0);
      expect(await db.select().from(callEvents)).toHaveLength(0);
      expect(await db.select().from(callRecordings)).toHaveLength(0);
      expect(await db.select().from(usageEvents)).toHaveLength(0);
      expect(await db.select().from(sipTrunks)).toHaveLength(0);
      expect(await db.select().from(aiAgents)).toHaveLength(0);
      expect(await db.select().from(apiKeys)).toHaveLength(0);
    });
  });

  it('denies tenant membership reads across tenants', async () => {
    const userId = randomUUID();
    await withBypassRls(adminDb.db, async (db) => {
      await db.insert(users).values({
        id: userId,
        email: `rls-user-${userId.slice(0, 8)}@test.local`,
        displayName: 'RLS User',
        passwordHash: hashPassword('test-password-12345'),
        status: 'active',
      });
      await db.insert(tenantMemberships).values({
        tenantId: tenantA,
        userId,
        roles: ['tenant_owner'],
      });
    });

    await withTenantContext(appDb.db, tenantB, async (db) => {
      const rows = await db
        .select()
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, userId));
      expect(rows).toHaveLength(0);
    });

    await withBypassRls(adminDb.db, async (db) => {
      await db.delete(tenantMemberships).where(eq(tenantMemberships.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    });
  });
});
