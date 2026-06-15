import { Inject, Injectable } from '@nestjs/common';
import {
  CreateTenantRequest,
  tenantAccessDenied,
  validationError,
  type PlatformCustomerSummary,
  type TenantLifecycleStatus,
  type UpdateTenantLifecycleRequest,
} from '@pbx/contracts';
import {
  generateSecureToken,
  hashPassword,
  tenantAsteriskContext,
} from '@pbx/shared';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  auditEvents,
  calls,
  extensions,
  sipRegistrations,
  tenantMemberships,
  tenantSettings,
  tenantSipDomains,
  tenants,
  users,
  withBypassRls,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';
import { TenantLifecycleTelephonyService } from './tenant-lifecycle-telephony.service.js';

@Injectable()
export class TenantsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TenantLifecycleService) private readonly lifecycleService: TenantLifecycleService,
    @Inject(TenantLifecycleTelephonyService)
    private readonly lifecycleTelephonyService: TenantLifecycleTelephonyService,
  ) {}

  async createTenant(actor: AuthenticatedUser, input: CreateTenantRequest) {
    return withBypassRls(this.database.db, async (db) => {
      const [existing] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      if (existing) {
        throw validationError({ slug: 'Slug already in use' });
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.ownerEmail))
        .limit(1);

      let ownerId = existingUser?.id;
      let temporaryPassword: string | undefined;

      if (!ownerId) {
        temporaryPassword = generateSecureToken(16);
        const [owner] = await db
          .insert(users)
          .values({
            email: input.ownerEmail,
            displayName: input.ownerDisplayName,
            passwordHash: hashPassword(temporaryPassword),
            status: 'invited',
            passwordMustChange: true,
          })
          .returning();
        ownerId = owner!.id;
      }

      const [tenant] = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          status: 'draft',
          asteriskContext: tenantAsteriskContext(input.slug),
          planId: input.planId ?? null,
        })
        .returning();

      await db.insert(tenantMemberships).values({
        tenantId: tenant!.id,
        userId: ownerId!,
        roles: ['tenant_owner'],
        status: 'active',
        acceptedAt: new Date(),
        createdBy: actor.id,
      });

      await db.insert(auditEvents).values({
        tenantId: tenant!.id,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenant!.id,
        metadata: { slug: input.slug, ownerEmail: input.ownerEmail, status: 'draft' },
      });

      return {
        tenant: {
          id: tenant!.id,
          name: tenant!.name,
          slug: tenant!.slug,
          status: tenant!.status,
          asteriskContext: tenant!.asteriskContext,
          createdAt: tenant!.createdAt.toISOString(),
          updatedAt: tenant!.updatedAt.toISOString(),
        },
        owner: {
          email: input.ownerEmail,
          ...(temporaryPassword ? { temporaryPassword, passwordMustChange: true } : {}),
        },
      };
    });
  }

  async listTenants(actor: AuthenticatedUser) {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }

    return withBypassRls(this.database.db, async (db) => {
      const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
      return rows.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        asteriskContext: t.asteriskContext,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    });
  }

  async getTenant(actor: AuthenticatedUser, tenantId: string) {
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    if (!isPlatform && !isMember) {
      throw tenantAccessDenied();
    }

    const [tenant] = await this.database.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      throw tenantAccessDenied();
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      asteriskContext: tenant.asteriskContext,
      planId: tenant.planId,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  async listPlatformCustomers(actor: AuthenticatedUser): Promise<PlatformCustomerSummary[]> {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }

    return withBypassRls(this.database.db, async (db) => {
      const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
      const summaries: PlatformCustomerSummary[] = [];

      for (const tenant of rows) {
        const [userCount] = await db
          .select({ total: count() })
          .from(tenantMemberships)
          .innerJoin(users, eq(tenantMemberships.userId, users.id))
          .where(
            and(
              eq(tenantMemberships.tenantId, tenant.id),
              inArray(tenantMemberships.status, ['active', 'invited']),
            ),
          );

        const [ownerRow] = await db
          .select({ email: users.email })
          .from(tenantMemberships)
          .innerJoin(users, eq(tenantMemberships.userId, users.id))
          .where(
            and(eq(tenantMemberships.tenantId, tenant.id), eq(tenantMemberships.status, 'active')),
          )
          .limit(1);

        const [extCount] = await db
          .select({ total: count() })
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenant.id), eq(extensions.status, 'active')));

        const [regCount] = await db
          .select({ total: count() })
          .from(sipRegistrations)
          .where(and(eq(sipRegistrations.tenantId, tenant.id), eq(sipRegistrations.isRegistered, true)));

        const [activeCallCount] = await db
          .select({ total: count() })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenant.id),
              isNull(calls.endedAt),
              inArray(calls.status, ['initiating', 'ringing', 'answered', 'held']),
            ),
          );

        const [lastCall] = await db
          .select({ startedAt: calls.startedAt })
          .from(calls)
          .where(eq(calls.tenantId, tenant.id))
          .orderBy(desc(calls.startedAt))
          .limit(1);

        const [recordingSetting] = await db
          .select()
          .from(tenantSettings)
          .where(
            and(eq(tenantSettings.tenantId, tenant.id), eq(tenantSettings.key, 'telephony.recording')),
          )
          .limit(1);

        const [domainRow] = await db
          .select({ domain: tenantSipDomains.domain, mode: tenantSipDomains.mode, activationStatus: tenantSipDomains.activationStatus })
          .from(tenantSipDomains)
          .where(eq(tenantSipDomains.tenantId, tenant.id))
          .limit(1);

        const recordingValue = (recordingSetting?.value ?? {}) as { recordCallsByDefault?: boolean };
        const online = Number(regCount?.total ?? 0);
        const activeExt = Number(extCount?.total ?? 0);

        summaries.push({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status as PlatformCustomerSummary['status'],
          planId: tenant.planId,
          primaryOwnerEmail: ownerRow?.email ?? null,
          sipDomain: domainRow?.activationStatus === 'active' ? domainRow.domain : null,
          sipDomainMode:
            domainRow?.activationStatus === 'active'
              ? (domainRow.mode as 'shared' | 'tenant_domain')
              : 'shared',
          recordCallsByDefault: recordingValue.recordCallsByDefault ?? false,
          activeUsers: Number(userCount?.total ?? 0),
          activeExtensions: activeExt,
          onlineRegistrations: online,
          concurrentCalls: Number(activeCallCount?.total ?? 0),
          lastActivityAt: lastCall?.startedAt?.toISOString() ?? null,
          health:
            tenant.status === 'suspended' || tenant.status === 'failed'
              ? 'degraded'
              : activeExt > 0 && online === 0
                ? 'unknown'
                : 'healthy',
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt.toISOString(),
        });
      }

      return summaries;
    });
  }

  async updateTenantLifecycle(
    actor: AuthenticatedUser,
    tenantId: string,
    input: UpdateTenantLifecycleRequest,
  ) {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }

    return withBypassRls(this.database.db, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) {
        throw validationError({ tenantId: 'Tenant not found' });
      }

      this.lifecycleService.assertTransition(
        tenant.status as TenantLifecycleStatus,
        input.status,
      );

      const previousStatus = tenant.status as TenantLifecycleStatus;

      const [updated] = await db
        .update(tenants)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'tenant.lifecycle_updated',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: {
          from: previousStatus,
          to: input.status,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      });

      return { updated: updated!, previousStatus };
    }).then(async ({ updated, previousStatus }) => {
      try {
        const telephonyResult = await this.lifecycleTelephonyService.applyLifecycleTelephony(
          actor,
          tenantId,
          previousStatus,
          input.status,
        );

        return {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          status: updated.status,
          updatedAt: updated.updatedAt.toISOString(),
          telephony: telephonyResult,
        };
      } catch (err) {
        await withBypassRls(this.database.db, async (db) => {
          await db
            .update(tenants)
            .set({ status: previousStatus, updatedAt: new Date() })
            .where(eq(tenants.id, tenantId));
          await db.insert(auditEvents).values({
            tenantId,
            actorUserId: actor.id,
            actorType: 'user',
            action: 'tenant.lifecycle_rollback',
            resourceType: 'tenant',
            resourceId: tenantId,
            metadata: { from: input.status, to: previousStatus },
          });
        });
        throw err;
      }
    });
  }
}
