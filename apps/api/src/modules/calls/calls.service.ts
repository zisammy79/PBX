import { Inject, Injectable } from '@nestjs/common';
import { CallListQuery, notFound, paginate, tenantAccessDenied } from '@pbx/contracts';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { buildCallListFilterClauses } from './call-list-filters.js';
import {
  callRecordings,
  calls,
  extensions,
  sipRegistrations,
  withTenantContext,
  type createDatabase,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const ACTIVE_STATUSES = ['initiating', 'ringing', 'answered', 'held'] as const;

type AppDb = ReturnType<typeof createDatabase>['db'];

@Injectable()
export class CallsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async listCalls(actor: AuthenticatedUser, tenantId: string, query: CallListQuery) {
    await this.assertTenantAccess(actor, tenantId);
    const offset = (query.page - 1) * query.pageSize;
    const filters = buildCallListFilterClauses(tenantId, query);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const countRow = await db.select({ total: count() }).from(calls).where(filters);
      const total = Number(countRow[0]?.total ?? 0);

      const rows = await db
        .select()
        .from(calls)
        .where(filters)
        .orderBy(desc(calls.startedAt))
        .limit(query.pageSize)
        .offset(offset);

      const recordingMap = await this.loadRecordingIdsForCalls(tenantId, rows.map((r) => r.id), db);

      return paginate(
        rows.map((r) => this.serializeCall(r, recordingMap.get(r.id))),
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
      const recordingMap = await this.loadRecordingIdsForCalls(tenantId, [row.id], db);
      return this.serializeCall(row, recordingMap.get(row.id));
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

  async getOperatorPanel(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    const observedAt = new Date().toISOString();

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const extRows = await db
        .select({
          id: extensions.id,
          extensionNumber: extensions.extensionNumber,
          displayName: extensions.displayName,
        })
        .from(extensions)
        .where(eq(extensions.tenantId, tenantId));

      const extById = new Map(extRows.map((e) => [e.id, e]));

      const activeRows = await db
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

      const activeCalls = activeRows.map((row) => {
        const fromExt = row.fromExtensionId ? extById.get(row.fromExtensionId) : null;
        const toExt = row.toExtensionId ? extById.get(row.toExtensionId) : null;
        return {
          ...this.serializeCall(row),
          fromExtensionNumber: fromExt?.extensionNumber ?? null,
          fromExtensionName: fromExt?.displayName ?? null,
          toExtensionNumber: toExt?.extensionNumber ?? null,
          toExtensionName: toExt?.displayName ?? null,
        };
      });

      const regRows = await db
        .select({ extensionId: sipRegistrations.extensionId })
        .from(sipRegistrations)
        .where(and(eq(sipRegistrations.tenantId, tenantId), eq(sipRegistrations.isRegistered, true)));

      const registeredIds = new Set(regRows.map((r) => r.extensionId));

      return {
        observedAt,
        extensions: {
          total: extRows.length,
          registered: extRows.filter((e) => registeredIds.has(e.id)).length,
          unregistered: extRows.filter((e) => !registeredIds.has(e.id)).length,
          items: extRows.map((e) => ({
            id: e.id,
            extensionNumber: e.extensionNumber,
            displayName: e.displayName,
            registered: registeredIds.has(e.id),
          })),
        },
        activeCalls,
      };
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

  private async loadRecordingIdsForCalls(
    tenantId: string,
    callIds: string[],
    db: Pick<AppDb, 'select'>,
  ): Promise<Map<string, string>> {
    if (callIds.length === 0) return new Map();

    const rows = await db
      .select({ callId: callRecordings.callId, id: callRecordings.id })
      .from(callRecordings)
      .where(
        and(
          eq(callRecordings.tenantId, tenantId),
          inArray(callRecordings.callId, callIds),
          eq(callRecordings.status, 'available'),
        ),
      )
      .orderBy(desc(callRecordings.completedAt));

    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.callId)) {
        map.set(row.callId, row.id);
      }
    }
    return map;
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

  private serializeCall(
    row: typeof calls.$inferSelect,
    recordingId?: string | null,
  ) {
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
      recordingId: recordingId ?? null,
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
