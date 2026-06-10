import { Inject, Injectable } from '@nestjs/common';
import {
  CreateTenantRequest,
  tenantAccessDenied,
  validationError,
} from '@pbx/contracts';
import {
  generateSecureToken,
  hashPassword,
  tenantAsteriskContext,
} from '@pbx/shared';
import { desc, eq } from 'drizzle-orm';
import {
  auditEvents,
  tenantMemberships,
  tenants,
  users,
  withBypassRls,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

@Injectable()
export class TenantsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
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
          status: 'active',
          asteriskContext: tenantAsteriskContext(input.slug),
          planId: input.planId ?? null,
        })
        .returning();

      await db.insert(tenantMemberships).values({
        tenantId: tenant!.id,
        userId: ownerId!,
        roles: ['tenant_owner'],
      });

      await db.insert(auditEvents).values({
        tenantId: tenant!.id,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenant!.id,
        metadata: { slug: input.slug, ownerEmail: input.ownerEmail },
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
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }
}
