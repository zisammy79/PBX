import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import {
  encryptSecret,
  generateSipSecret,
  tenantEndpointId,
} from '@pbx/shared';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  sipCredentials,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

export interface CreateExtensionInput {
  extensionNumber: string;
  displayName: string;
}

@Injectable()
export class ExtensionsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async createExtension(
    actor: AuthenticatedUser,
    tenantId: string,
    input: CreateExtensionInput,
  ) {
    await this.assertTenantAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');
      if (tenant.status === 'suspended') {
        throw validationError({ tenant: 'Tenant is suspended' });
      }

      const [existing] = await db
        .select()
        .from(extensions)
        .where(
          and(
            eq(extensions.tenantId, tenantId),
            eq(extensions.extensionNumber, input.extensionNumber),
          ),
        )
        .limit(1);

      if (existing) {
        throw validationError({ extensionNumber: 'Extension already exists' });
      }

      const asteriskEndpointId = tenantEndpointId(tenant.slug, input.extensionNumber);
      const sipUsername = `${tenant.slug}_${input.extensionNumber}`;
      const sipSecret = generateSipSecret();

      const [extension] = await db
        .insert(extensions)
        .values({
          tenantId,
          extensionNumber: input.extensionNumber,
          displayName: input.displayName,
          asteriskEndpointId,
          status: 'active',
        })
        .returning();

      await db.insert(sipCredentials).values({
        tenantId,
        extensionId: extension!.id,
        username: sipUsername,
        secretEncrypted: encryptSecret(sipSecret, this.config.encryptionMasterKey),
      });

      await withBypassRls(this.database.db, async (adminDb) => {
        await adminDb.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'extension.created',
          resourceType: 'extension',
          resourceId: extension!.id,
          metadata: { extensionNumber: input.extensionNumber },
        });
      });

      return {
        extension: {
          id: extension!.id,
          tenantId,
          extensionNumber: extension!.extensionNumber,
          displayName: extension!.displayName,
          asteriskEndpointId: extension!.asteriskEndpointId,
          status: extension!.status,
          createdAt: extension!.createdAt.toISOString(),
        },
        sipCredential: {
          username: sipUsername,
          secret: sipSecret,
          domain: `${tenant.slug}.pbx.local`,
        },
      };
    });
  }

  async listExtensions(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({
          id: extensions.id,
          tenantId: extensions.tenantId,
          extensionNumber: extensions.extensionNumber,
          displayName: extensions.displayName,
          asteriskEndpointId: extensions.asteriskEndpointId,
          status: extensions.status,
          createdAt: extensions.createdAt,
        })
        .from(extensions)
        .where(eq(extensions.tenantId, tenantId));

      return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  async getExtension(actor: AuthenticatedUser, tenantId: string, extensionId: string) {
    await this.assertTenantAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);

      if (!row) throw notFound('Extension');

      const [cred] = await db
        .select({
          username: sipCredentials.username,
          secretVersion: sipCredentials.secretVersion,
          createdAt: sipCredentials.createdAt,
        })
        .from(sipCredentials)
        .where(eq(sipCredentials.extensionId, extensionId))
        .limit(1);

      return {
        extension: {
          id: row.id,
          tenantId: row.tenantId,
          extensionNumber: row.extensionNumber,
          displayName: row.displayName,
          asteriskEndpointId: row.asteriskEndpointId,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        },
        sipCredential: cred
          ? {
              username: cred.username,
              secretVersion: cred.secretVersion,
              createdAt: cred.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
  }
}
