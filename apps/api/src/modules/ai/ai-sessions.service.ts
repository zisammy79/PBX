import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied } from '@pbx/contracts';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { aiSessions, withTenantContext } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { AiSessionListQuerySchema } from '@pbx/contracts';
import type { z } from 'zod';

type SessionQuery = z.infer<typeof AiSessionListQuerySchema>;

@Injectable()
export class AiSessionsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async list(actor: AuthenticatedUser, tenantId: string, query: SessionQuery) {
    await this.assertTenantAccess(actor, tenantId);
    const offset = (query.page - 1) * query.limit;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const filters = [eq(aiSessions.tenantId, tenantId)];
      if (query.callId) filters.push(eq(aiSessions.callId, query.callId));
      if (query.agentId) filters.push(eq(aiSessions.agentId, query.agentId));
      if (query.state) filters.push(eq(aiSessions.state, query.state));
      if (query.from) filters.push(gte(aiSessions.startedAt, new Date(query.from)));
      if (query.to) filters.push(lte(aiSessions.startedAt, new Date(query.to)));

      const whereClause = filters.length === 1 ? filters[0] : and(...filters);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiSessions)
        .where(whereClause);

      const rows = await db
        .select()
        .from(aiSessions)
        .where(whereClause)
        .orderBy(desc(aiSessions.startedAt))
        .limit(query.limit)
        .offset(offset);

      return {
        items: rows.map((s) => this.serialize(s, false)),
        page: query.page,
        limit: query.limit,
        total: countRow?.count ?? 0,
      };
    });
  }

  async get(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiSessions)
        .where(and(eq(aiSessions.tenantId, tenantId), eq(aiSessions.id, id)))
        .limit(1);
      if (!row) throw notFound('AI session');
      return this.serialize(row, false);
    });
  }

  async diagnostics(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiSessions)
        .where(and(eq(aiSessions.tenantId, tenantId), eq(aiSessions.id, id)))
        .limit(1);
      if (!row) throw notFound('AI session');
      return this.serialize(row, true);
    });
  }

  async tools(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiSessions)
        .where(and(eq(aiSessions.tenantId, tenantId), eq(aiSessions.id, id)))
        .limit(1);
      if (!row) throw notFound('AI session');

      const diagnostics = (row.diagnostics ?? {}) as Record<string, unknown>;
      const behavior = (diagnostics.behavior ?? {}) as Record<string, unknown>;
      const tool = (diagnostics.tool ?? {}) as Record<string, unknown>;
      const toolResult = (diagnostics.toolResult ?? {}) as Record<string, unknown>;
      const transfer = (diagnostics.transfer ?? row.transferResult ?? {}) as Record<string, unknown>;

      return {
        sessionId: row.id,
        callId: row.callId,
        invocations: [
          {
            toolName: tool.toolName ?? toolResult.toolName ?? null,
            invocationId: tool.invocationId ?? toolResult.invocationId ?? null,
            idempotencyKey: tool.idempotencyKey ?? null,
            status: toolResult.status ?? row.state,
            pendingToolName: behavior.pendingToolName ?? null,
            transferDestination: transfer.resolvedExtension ?? transfer.destinationAlias ?? null,
            humanChannelId: transfer.humanChannelId ?? null,
          },
        ].filter((item) => item.toolName || item.invocationId),
        bargeIn: {
          interruptionDetectedAt: behavior.interruptionDetectedAt ?? null,
          queuedFramesDiscarded: behavior.queuedFramesDiscarded ?? null,
        },
        media: (diagnostics.media ?? {}) as Record<string, unknown>,
        measurementOrigin: 'PLATFORM_MEASURED',
      };
    });
  }

  private serialize(row: typeof aiSessions.$inferSelect, includeDiagnostics: boolean) {
    const diagnostics = includeDiagnostics
      ? this.sanitizeDiagnostics(row.diagnostics as Record<string, unknown>)
      : undefined;

    return {
      id: row.id,
      tenantId: row.tenantId,
      callId: row.callId,
      agentId: row.agentId,
      agentVersionId: row.agentVersionId,
      providerConnectionId: row.providerConnectionId,
      providerType: row.providerType,
      providerSessionId: row.providerSessionId,
      status: row.status,
      state: row.state,
      correlationId: row.correlationId,
      transferResult: row.transferResult,
      failureCategory: row.failureCategory,
      timing: row.timing,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      diagnostics,
    };
  }

  private sanitizeDiagnostics(raw: Record<string, unknown> | null | undefined) {
    if (!raw) return {};
    const copy = { ...raw };
    delete copy.credentials;
    delete copy.authorization;
    delete copy.apiKey;
    if (copy.media && typeof copy.media === 'object') {
      copy.media = { ...(copy.media as Record<string, unknown>) };
    }
    return copy;
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform =
      actor.platformRoles.includes('platform_super_admin') ||
      actor.platformRoles.includes('platform_support_operator');
    if (!isMember && !isPlatform) throw tenantAccessDenied();
  }
}
