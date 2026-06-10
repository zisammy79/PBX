import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import { redactObject } from '@pbx/shared';
import { and, desc, eq, max, ne } from 'drizzle-orm';
import {
  aiAgentVersions,
  aiAgents,
  aiProviderConnections,
  auditEvents,
  extensions,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { CreateAiAgent, UpdateAiAgent } from '@pbx/contracts';

@Injectable()
export class AiAgentsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async create(actor: AuthenticatedUser, tenantId: string, input: CreateAiAgent) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      await this.validateReferences(db, tenantId, input.providerConnectionId, input.transferExtensionId);
      await this.validateTransferAliases(db, tenantId, input.transferExtensionId, {
        transferDestinationAliases: input.transferDestinationAliases ?? {},
      });

      const [agent] = await db
        .insert(aiAgents)
        .values({
          tenantId,
          name: input.name,
          description: input.description,
          routeNumber: input.routeNumber,
          transferExtensionId: input.transferExtensionId,
          status: 'draft',
          createdBy: actor.id,
        })
        .returning();

      const version = await this.insertVersion(db, tenantId, agent!.id, 1, actor.id, input);

      await this.audit(db, tenantId, actor.id, 'ai.agent.created', agent!.id, { routeNumber: input.routeNumber });

      return { ...this.serializeAgent(agent!, version), versions: [this.serializeVersion(version)] };
    });
  }

  async list(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db.select().from(aiAgents).where(eq(aiAgents.tenantId, tenantId));
      return rows.map((a) => this.serializeAgent(a));
    });
  }

  async get(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.id, id)))
        .limit(1);
      if (!agent) throw notFound('AI agent');
      return this.serializeAgent(agent);
    });
  }

  async update(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateAiAgent) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.id, id)))
        .limit(1);
      if (!agent) throw notFound('AI agent');

      if (input.name !== undefined || input.description !== undefined) {
        await db
          .update(aiAgents)
          .set({
            name: input.name ?? agent.name,
            description: input.description ?? agent.description,
            updatedAt: new Date(),
          })
          .where(eq(aiAgents.id, id));
      }

      const hasVersionFields = [
        'providerConnectionId',
        'provider',
        'model',
        'voice',
        'language',
        'systemInstructions',
        'openingMessage',
        'silenceTimeoutSeconds',
        'maxDurationSeconds',
        'allowedTools',
        'recordingPolicy',
        'transcriptionPolicy',
        'bargeIn',
        'transferDestinationAliases',
      ].some((k) => (input as Record<string, unknown>)[k] !== undefined);

      let version = null;
      if (hasVersionFields) {
        const agg = await db
          .select({ value: max(aiAgentVersions.version) })
          .from(aiAgentVersions)
          .where(eq(aiAgentVersions.agentId, id));
        const nextVersion = Number(agg[0]?.value ?? 0) + 1;
        const merged = await this.loadActiveConfig(db, agent, input);
        version = await this.insertVersion(db, tenantId, id, nextVersion, actor.id, merged);
      }

      await this.audit(db, tenantId, actor.id, 'ai.agent.updated', id, { newVersion: version?.version ?? null });
      const [updated] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
      return { ...this.serializeAgent(updated!, version ?? undefined), newVersion: version ? this.serializeVersion(version) : null };
    });
  }

  async activate(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.id, id)))
        .limit(1);
      if (!agent) throw notFound('AI agent');
      if (!agent.activeVersionId) {
        throw validationError({ agent: 'No version to activate — update agent configuration first' });
      }

      const [version] = await db
        .select()
        .from(aiAgentVersions)
        .where(eq(aiAgentVersions.id, agent.activeVersionId))
        .limit(1);
      if (!version?.providerConnectionId) {
        throw validationError({ providerConnectionId: 'Active version missing provider connection' });
      }
      await this.validateReferences(db, tenantId, version.providerConnectionId, agent.transferExtensionId!);
      await this.validateTransferAliases(db, tenantId, agent.transferExtensionId!, version.config);

      const [routeConflict] = await db
        .select({ id: aiAgents.id })
        .from(aiAgents)
        .where(
          and(
            eq(aiAgents.tenantId, tenantId),
            eq(aiAgents.routeNumber, agent.routeNumber!),
            eq(aiAgents.isActive, true),
            ne(aiAgents.id, id),
          ),
        )
        .limit(1);
      if (routeConflict) {
        throw validationError({ routeNumber: 'Route number already active on another agent' });
      }

      await db
        .update(aiAgents)
        .set({ isActive: true, status: 'active', updatedAt: new Date() })
        .where(eq(aiAgents.id, id));
      await db
        .update(aiAgentVersions)
        .set({ status: 'active', activatedAt: new Date() })
        .where(eq(aiAgentVersions.id, version.id));

      await this.audit(db, tenantId, actor.id, 'ai.agent.activated', id, {});
      const [updated] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
      return this.serializeAgent(updated!);
    });
  }

  async disable(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [agent] = await db
        .select()
        .from(aiAgents)
        .where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.id, id)))
        .limit(1);
      if (!agent) throw notFound('AI agent');

      await db
        .update(aiAgents)
        .set({ isActive: false, status: 'disabled', updatedAt: new Date() })
        .where(eq(aiAgents.id, id));
      await this.audit(db, tenantId, actor.id, 'ai.agent.disabled', id, {});
      return { id, disabled: true };
    });
  }

  async listVersions(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(aiAgentVersions)
        .where(and(eq(aiAgentVersions.tenantId, tenantId), eq(aiAgentVersions.agentId, id)))
        .orderBy(desc(aiAgentVersions.version));
      return rows.map((v) => this.serializeVersion(v));
    });
  }

  private async insertVersion(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    agentId: string,
    versionNum: number,
    actorId: string,
    input: CreateAiAgent | UpdateAiAgent,
  ) {
    const [version] = await db
      .insert(aiAgentVersions)
      .values({
        tenantId,
        agentId,
        version: versionNum,
        pipelineType: 'realtime',
        providerConnectionId: input.providerConnectionId!,
        provider: input.provider!,
        model: input.model!,
        voice: input.voice,
        language: input.language ?? 'en',
        systemInstructions: input.systemInstructions,
        openingMessage: input.openingMessage,
        silenceTimeoutSeconds: input.silenceTimeoutSeconds,
        maxDurationSeconds: input.maxDurationSeconds,
        interruptionConfig: input.bargeIn ?? { enabled: true },
        allowedTools: input.allowedTools ?? [],
        recordingPolicy: input.recordingPolicy,
        transcriptionPolicy: input.transcriptionPolicy,
        config: {
          transferDestinationAliases: input.transferDestinationAliases ?? {},
        },
        status: 'draft',
        createdBy: actorId,
      })
      .returning();

    await db
      .update(aiAgents)
      .set({ activeVersionId: version!.id, updatedAt: new Date() })
      .where(eq(aiAgents.id, agentId));

    return version!;
  }

  private async loadActiveConfig(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    agent: typeof aiAgents.$inferSelect,
    patch: UpdateAiAgent,
  ): Promise<CreateAiAgent> {
    if (!agent.activeVersionId) {
      throw validationError({ agent: 'No active version to merge from' });
    }
    const [current] = await db
      .select()
      .from(aiAgentVersions)
      .where(eq(aiAgentVersions.id, agent.activeVersionId))
      .limit(1);
    if (!current) throw notFound('AI agent version');

    return {
      name: patch.name ?? agent.name,
      description: patch.description ?? agent.description ?? undefined,
      routeNumber: agent.routeNumber!,
      transferExtensionId: agent.transferExtensionId!,
      transferDestinationAliases:
        patch.transferDestinationAliases ??
        ((current.config as Record<string, unknown>)?.transferDestinationAliases as Record<string, string>) ??
        {},
      providerConnectionId: patch.providerConnectionId ?? current.providerConnectionId!,
      provider: (patch.provider ?? current.provider) as CreateAiAgent['provider'],
      model: patch.model ?? current.model!,
      voice: patch.voice ?? current.voice ?? undefined,
      language: patch.language ?? current.language ?? 'en',
      systemInstructions: patch.systemInstructions ?? current.systemInstructions ?? undefined,
      openingMessage: patch.openingMessage ?? current.openingMessage ?? undefined,
      silenceTimeoutSeconds: patch.silenceTimeoutSeconds ?? current.silenceTimeoutSeconds ?? undefined,
      maxDurationSeconds: patch.maxDurationSeconds ?? current.maxDurationSeconds ?? undefined,
      bargeIn:
        patch.bargeIn ??
        (current.interruptionConfig as CreateAiAgent['bargeIn']) ??
        { enabled: true },
      allowedTools: (patch.allowedTools ?? current.allowedTools ?? []) as CreateAiAgent['allowedTools'],
      recordingPolicy: (patch.recordingPolicy ?? current.recordingPolicy ?? 'none') as CreateAiAgent['recordingPolicy'],
      transcriptionPolicy: (patch.transcriptionPolicy ?? current.transcriptionPolicy ?? 'metadata') as CreateAiAgent['transcriptionPolicy'],
    };
  }

  private async validateTransferAliases(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    defaultExtensionId: string,
    versionConfig: unknown,
  ) {
    const aliases =
      (versionConfig as Record<string, unknown> | null)?.transferDestinationAliases ??
      {};
    if (typeof aliases !== 'object' || aliases === null) {
      throw validationError({ transferDestinationAliases: 'Must be an object' });
    }
    for (const [alias, target] of Object.entries(aliases as Record<string, string>)) {
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(alias)) {
        throw validationError({ transferDestinationAliases: `Invalid alias ${alias}` });
      }
      const [ext] = await db
        .select()
        .from(extensions)
        .where(
          and(
            eq(extensions.tenantId, tenantId),
            eq(extensions.extensionNumber, target),
            eq(extensions.status, 'active'),
          ),
        )
        .limit(1);
      if (!ext) {
        throw validationError({
          transferDestinationAliases: `Alias ${alias} references unknown extension ${target}`,
        });
      }
    }
    const [defaultExt] = await db
      .select()
      .from(extensions)
      .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, defaultExtensionId)))
      .limit(1);
    if (!defaultExt || defaultExt.status !== 'active') {
      throw validationError({ transferExtensionId: 'Transfer extension not found or inactive' });
    }
  }

  private async validateReferences(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    providerConnectionId: string,
    transferExtensionId: string,
  ) {
    const [conn] = await db
      .select()
      .from(aiProviderConnections)
      .where(
        and(
          eq(aiProviderConnections.tenantId, tenantId),
          eq(aiProviderConnections.id, providerConnectionId),
          eq(aiProviderConnections.isActive, true),
        ),
      )
      .limit(1);
    if (!conn) throw validationError({ providerConnectionId: 'Provider connection not found or inactive' });

    const [ext] = await db
      .select()
      .from(extensions)
      .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, transferExtensionId)))
      .limit(1);
    if (!ext || ext.status !== 'active') {
      throw validationError({ transferExtensionId: 'Transfer extension not found or inactive' });
    }
  }

  private serializeAgent(agent: typeof aiAgents.$inferSelect, version?: typeof aiAgentVersions.$inferSelect) {
    return {
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      routeNumber: agent.routeNumber,
      transferExtensionId: agent.transferExtensionId,
      activeVersionId: agent.activeVersionId,
      isActive: agent.isActive,
      activeVersion: version ? this.serializeVersion(version) : undefined,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  private serializeVersion(v: typeof aiAgentVersions.$inferSelect) {
    const config = (v.config ?? {}) as Record<string, unknown>;
    return {
      id: v.id,
      agentId: v.agentId,
      version: v.version,
      providerConnectionId: v.providerConnectionId,
      provider: v.provider,
      model: v.model,
      voice: v.voice,
      language: v.language,
      systemInstructions: v.systemInstructions,
      openingMessage: v.openingMessage,
      silenceTimeoutSeconds: v.silenceTimeoutSeconds,
      maxDurationSeconds: v.maxDurationSeconds,
      bargeIn: v.interruptionConfig,
      transferDestinationAliases: config.transferDestinationAliases ?? {},
      allowedTools: v.allowedTools,
      recordingPolicy: v.recordingPolicy,
      transcriptionPolicy: v.transcriptionPolicy,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
      activatedAt: v.activatedAt?.toISOString() ?? null,
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
      resourceType: 'ai_agent',
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
