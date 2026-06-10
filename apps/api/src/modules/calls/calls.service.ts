import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied } from '@pbx/contracts';
import { PaginationQuery, paginate } from '@pbx/contracts';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { calls, extensions, sipRegistrations, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const ACTIVE_STATUSES = ['initiating', 'ringing', 'answered', 'held'] as const;

@Injectable()
export class CallsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async listCalls(actor: AuthenticatedUser, tenantId: string, query: PaginationQuery) {
    await this.assertTenantAccess(actor, tenantId);
    const offset = (query.page - 1) * query.pageSize;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const countRow = await db
        .select({ total: count() })
        .from(calls)
        .where(eq(calls.tenantId, tenantId));
      const total = Number(countRow[0]?.total ?? 0);

      const rows = await db
        .select()
        .from(calls)
        .where(eq(calls.tenantId, tenantId))
        .orderBy(desc(calls.startedAt))
        .limit(query.pageSize)
        .offset(offset);

      return paginate(
        rows.map((r) => this.serializeCall(r)),
        query.page,
        query.pageSize,
        total,
      );
    });
  }

  async getCall(actor: AuthenticatedUser, tenantId: string, callId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(calls)
        .where(and(eq(calls.tenantId, tenantId), eq(calls.id, callId)))
        .limit(1);
      if (!row) throw notFound('Call');
      return this.serializeCall(row);
    });
  }

  async listActiveCalls(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            inArray(calls.status, [...ACTIVE_STATUSES]),
            isNull(calls.endedAt),
          ),
        )
        .orderBy(desc(calls.startedAt));
      return rows.map((r) => this.serializeCall(r));
    });
  }

  async getExtensionRegistration(actor: AuthenticatedUser, tenantId: string, extensionId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [ext] = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);
      if (!ext) throw notFound('Extension');

      const [reg] = await db
        .select()
        .from(sipRegistrations)
        .where(eq(sipRegistrations.extensionId, extensionId))
        .limit(1);

      let ariState: string | undefined;
      if (this.config.telephonyEnabled && this.config.asteriskAriUrl && this.config.asteriskAriPassword) {
        ariState = await this.fetchAriEndpointState(ext.asteriskEndpointId);
      }

      return {
        extensionId: ext.id,
        tenantId: ext.tenantId,
        extensionNumber: ext.extensionNumber,
        asteriskEndpointId: ext.asteriskEndpointId,
        registered: reg?.isRegistered ?? false,
        contact: reg?.contact ?? null,
        sourceIp: reg?.sourceIp ?? null,
        userAgent: reg?.userAgent ?? null,
        registeredAt: reg?.registeredAt?.toISOString() ?? null,
        expiresAt: reg?.expiresAt?.toISOString() ?? null,
        asteriskState: ariState ?? null,
      };
    });
  }

  private async fetchAriEndpointState(endpointId: string): Promise<string | undefined> {
    try {
      const base = this.config.asteriskAriUrl!.replace(/\/$/, '');
      const auth = Buffer.from(
        `${this.config.asteriskAriUsername}:${this.config.asteriskAriPassword}`,
      ).toString('base64');
      const res = await fetch(`${base}/endpoints/PJSIP/${encodeURIComponent(endpointId)}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { state?: string };
      return body.state;
    } catch {
      return undefined;
    }
  }

  private serializeCall(row: typeof calls.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      correlationId: row.correlationId,
      direction: row.direction,
      status: row.status,
      callerNumber: row.callerNumber,
      calleeNumber: row.calleeNumber,
      fromExtensionId: row.fromExtensionId,
      toExtensionId: row.toExtensionId,
      asteriskChannelId: row.asteriskChannelId,
      asteriskBridgeId: row.asteriskBridgeId,
      startedAt: row.startedAt.toISOString(),
      answeredAt: row.answeredAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      billableSeconds: row.billableSeconds,
      hangupCause: row.hangupCause,
    };
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
