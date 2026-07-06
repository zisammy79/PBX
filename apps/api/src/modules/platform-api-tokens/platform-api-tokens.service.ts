import { Inject, Injectable } from '@nestjs/common';
import {
  CreatePlatformApiTokenSchema,
  notFound,
  Permission,
  RotatePlatformApiTokenSchema,
  tenantAccessDenied,
  validationError,
} from '@pbx/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { auditEvents, platformApiTokens, withBypassRls } from '@pbx/database';
import { resolveAuditActor } from '../../common/audit-actor.js';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { PlatformApiTokenAuthService } from './platform-api-token-auth.service.js';

@Injectable()
export class PlatformApiTokensService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async list(actor: AuthenticatedUser) {
    this.assertPlatformSuperAdmin(actor);
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select()
        .from(platformApiTokens)
        .orderBy(desc(platformApiTokens.createdAt));
      return rows.map((row) => this.serialize(row));
    });
  }

  async create(actor: AuthenticatedUser, body: unknown) {
    this.assertPlatformSuperAdmin(actor);
    const input = CreatePlatformApiTokenSchema.parse(body);
    const material = PlatformApiTokenAuthService.createTokenMaterial();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw validationError({ expiresAt: 'Invalid expiry timestamp' });
    }

    const [row] = await withBypassRls(this.database.db, async (db) => {
      const [created] = await db
        .insert(platformApiTokens)
        .values({
          name: input.name,
          tokenPrefix: material.prefix,
          tokenHash: material.hash,
          status: 'active',
          role: 'platform_super_admin',
          scopes: ['*'],
          createdByUserId: actor.authMethod === 'jwt' ? actor.id : null,
          expiresAt,
          metadata: input.metadata ?? {},
        })
        .returning();
      const auditActor = resolveAuditActor(actor);
      await db.insert(auditEvents).values({
        actorUserId: auditActor.actorUserId,
        actorType: auditActor.actorType,
        action: 'platform.api_token.created',
        resourceType: 'platform_api_token',
        resourceId: created!.id,
        metadata: {
          ...auditActor.actorMetadata,
          name: input.name,
          tokenPrefix: material.prefix,
        },
      });
      return [created!];
    });

    return {
      ...this.serialize(row),
      token: material.token,
    };
  }

  async rotate(actor: AuthenticatedUser, tokenId: string, body: unknown) {
    this.assertPlatformSuperAdmin(actor);
    const input = RotatePlatformApiTokenSchema.parse(body ?? {});
    const material = PlatformApiTokenAuthService.createTokenMaterial();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    return withBypassRls(this.database.db, async (db) => {
      const [existing] = await db
        .select()
        .from(platformApiTokens)
        .where(and(eq(platformApiTokens.id, tokenId), isNull(platformApiTokens.revokedAt)))
        .limit(1);
      if (!existing || existing.status !== 'active') {
        throw notFound('Platform API token');
      }

      const now = new Date();
      await db
        .update(platformApiTokens)
        .set({ status: 'revoked', revokedAt: now })
        .where(eq(platformApiTokens.id, tokenId));

      const [created] = await db
        .insert(platformApiTokens)
        .values({
          name: input.name ?? existing.name,
          tokenPrefix: material.prefix,
          tokenHash: material.hash,
          status: 'active',
          role: existing.role,
          scopes: existing.scopes,
          createdByUserId: actor.authMethod === 'jwt' ? actor.id : null,
          expiresAt: expiresAt ?? existing.expiresAt,
          metadata: existing.metadata,
          rotatedFromTokenId: existing.id,
        })
        .returning();

      const auditActor = resolveAuditActor(actor);
      await db.insert(auditEvents).values({
        actorUserId: auditActor.actorUserId,
        actorType: auditActor.actorType,
        action: 'platform.api_token.rotated',
        resourceType: 'platform_api_token',
        resourceId: created!.id,
        metadata: {
          ...auditActor.actorMetadata,
          previousTokenId: existing.id,
          tokenPrefix: material.prefix,
        },
      });

      return {
        ...this.serialize(created!),
        token: material.token,
      };
    });
  }

  async revoke(actor: AuthenticatedUser, tokenId: string) {
    this.assertPlatformSuperAdmin(actor);
    return withBypassRls(this.database.db, async (db) => {
      const [existing] = await db
        .select()
        .from(platformApiTokens)
        .where(eq(platformApiTokens.id, tokenId))
        .limit(1);
      if (!existing || existing.revokedAt) {
        throw notFound('Platform API token');
      }

      const now = new Date();
      await db
        .update(platformApiTokens)
        .set({ status: 'revoked', revokedAt: now })
        .where(eq(platformApiTokens.id, tokenId));

      const auditActor = resolveAuditActor(actor);
      await db.insert(auditEvents).values({
        actorUserId: auditActor.actorUserId,
        actorType: auditActor.actorType,
        action: 'platform.api_token.revoked',
        resourceType: 'platform_api_token',
        resourceId: tokenId,
        metadata: {
          ...auditActor.actorMetadata,
          tokenPrefix: existing.tokenPrefix,
        },
      });

      return { revoked: true, id: tokenId };
    });
  }

  private assertPlatformSuperAdmin(actor: AuthenticatedUser) {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }
    if (actor.authMethod === 'api_key') {
      throw tenantAccessDenied();
    }
  }

  private serialize(row: typeof platformApiTokens.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      status: row.status,
      role: row.role,
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : ['*'],
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }
}
