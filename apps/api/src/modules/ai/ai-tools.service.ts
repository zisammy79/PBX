import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import { redactObject } from '@pbx/shared';
import { and, desc, eq } from 'drizzle-orm';
import { aiTools, auditEvents, withTenantContext } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { CreateAiTool, UpdateAiTool } from '@pbx/contracts';
import { validateHttpWebhookConfig, validateHttpWebhookTarget } from './http-webhook-guard.js';

@Injectable()
export class AiToolsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async create(actor: AuthenticatedUser, tenantId: string, input: CreateAiTool) {
    await this.assertTenantAccess(actor, tenantId);
    await this.validateToolConfig(input.name, input.config);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .insert(aiTools)
        .values({
          tenantId,
          name: input.name,
          toolType: input.name,
          jsonSchema: input.jsonSchema,
          config: input.config,
          requiresApproval: input.requiresApproval ?? false,
        })
        .returning();

      await this.audit(db, tenantId, actor.id, 'ai.tool.created', row!.id, { name: input.name });
      return this.serialize(row!);
    });
  }

  async list(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(aiTools)
        .where(eq(aiTools.tenantId, tenantId))
        .orderBy(desc(aiTools.createdAt));
      return rows.map((r) => this.serialize(r));
    });
  }

  async get(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiTools)
        .where(and(eq(aiTools.tenantId, tenantId), eq(aiTools.id, id)))
        .limit(1);
      if (!row) throw notFound('AI tool');
      return this.serialize(row);
    });
  }

  async update(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateAiTool) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(aiTools)
        .where(and(eq(aiTools.tenantId, tenantId), eq(aiTools.id, id)))
        .limit(1);
      if (!existing) throw notFound('AI tool');

      const nextName = input.name ?? (existing.name as CreateAiTool['name']);
      const nextConfig = input.config ?? (existing.config as Record<string, unknown>);
      await this.validateToolConfig(nextName, nextConfig);

      const [row] = await db
        .update(aiTools)
        .set({
          name: nextName,
          toolType: nextName,
          jsonSchema: input.jsonSchema ?? existing.jsonSchema,
          config: nextConfig,
          requiresApproval: input.requiresApproval ?? existing.requiresApproval,
          updatedAt: new Date(),
        })
        .where(eq(aiTools.id, id))
        .returning();

      await this.audit(db, tenantId, actor.id, 'ai.tool.updated', id, { name: nextName });
      return this.serialize(row!);
    });
  }

  async remove(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(aiTools)
        .where(and(eq(aiTools.tenantId, tenantId), eq(aiTools.id, id)))
        .limit(1);
      if (!existing) throw notFound('AI tool');

      await db.update(aiTools).set({ isActive: false, updatedAt: new Date() }).where(eq(aiTools.id, id));
      await this.audit(db, tenantId, actor.id, 'ai.tool.disabled', id, {});
      return { id, disabled: true };
    });
  }

  private async validateToolConfig(name: CreateAiTool['name'], config: Record<string, unknown>) {
    if (name === 'http_webhook') {
      const allowedHosts = validateHttpWebhookConfig(config);
      if (typeof config.url === 'string' && config.url.length > 0) {
        await validateHttpWebhookTarget(config.url, allowedHosts);
      }
      return;
    }
    if (name === 'transfer_call' || name === 'end_call') {
      return;
    }
    throw validationError({ name: 'Unsupported tool type' });
  }

  private serialize(row: typeof aiTools.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      toolType: row.toolType,
      jsonSchema: row.jsonSchema,
      config: redactObject(row.config as Record<string, unknown>),
      requiresApproval: row.requiresApproval,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async audit(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    actorId: string,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId,
      actorType: 'user',
      action,
      resourceType: 'ai_tool',
      resourceId,
      metadata: redactObject(metadata) as Record<string, unknown>,
    });
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    if (!isMember && !isPlatform) throw tenantAccessDenied();
  }
}
