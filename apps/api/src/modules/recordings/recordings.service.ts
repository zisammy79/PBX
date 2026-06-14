import { Inject, Injectable } from '@nestjs/common';
import {
  notFound,
  paginate,
  tenantAccessDenied,
  type CallRecordingSummary,
  type ExtensionRecordingListItem,
  type PaginationQuery,
  type RecordingPlaybackResponse,
  Permission,
} from '@pbx/contracts';
import { effectiveExtensionRecording } from '@pbx/shared';
import { and, countDistinct, desc, eq, or } from 'drizzle-orm';
import { callRecordings, calls, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ObjectStorageService } from '../../common/object-storage.service.js';
import { LocalRecordingStorageService } from '../../common/local-recording-storage.service.js';
import { hasAnyPermission, resolveEffectivePermissions } from '@pbx/contracts';
import { TenantTelephonySettingsService } from '../telephony/tenant-telephony-settings.service.js';

type StreamResponse = {
  status(code: number): StreamResponse;
  setHeader(name: string, value: string | number): void;
  json(body: unknown): void;
  end(): void;
};

@Injectable()
export class RecordingsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
    @Inject(LocalRecordingStorageService) private readonly localStorage: LocalRecordingStorageService,
    @Inject(TenantTelephonySettingsService)
    private readonly tenantTelephonySettingsService: TenantTelephonySettingsService,
  ) {}

  async listCallRecordings(
    actor: AuthenticatedUser,
    tenantId: string,
    callId: string,
  ): Promise<CallRecordingSummary[]> {
    await this.assertRecordingRead(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [callRow] = await db
        .select({ id: calls.id })
        .from(calls)
        .where(and(eq(calls.tenantId, tenantId), eq(calls.id, callId)))
        .limit(1);
      if (!callRow) throw notFound('Call');

      const rows = await db
        .select()
        .from(callRecordings)
        .where(and(eq(callRecordings.tenantId, tenantId), eq(callRecordings.callId, callId)))
        .orderBy(desc(callRecordings.createdAt));

      const summaries: CallRecordingSummary[] = [];
      for (const recording of rows) {
        summaries.push(await this.serializeCallRecording(recording, tenantId));
      }
      return summaries;
    });
  }

  async listExtensionRecordings(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
    query: PaginationQuery,
  ) {
    await this.assertRecordingRead(actor, tenantId);
    const offset = (query.page - 1) * query.pageSize;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const participation = or(
        eq(calls.fromExtensionId, extensionId),
        eq(calls.toExtensionId, extensionId),
      );

      const countRow = await db
        .select({ total: countDistinct(callRecordings.id) })
        .from(callRecordings)
        .innerJoin(calls, eq(callRecordings.callId, calls.id))
        .where(and(eq(callRecordings.tenantId, tenantId), participation));

      const total = Number(countRow[0]?.total ?? 0);

      const rows = await db
        .select({
          recording: callRecordings,
          call: calls,
        })
        .from(callRecordings)
        .innerJoin(calls, eq(callRecordings.callId, calls.id))
        .where(and(eq(callRecordings.tenantId, tenantId), participation))
        .orderBy(desc(callRecordings.createdAt))
        .limit(query.pageSize)
        .offset(offset);

      const seen = new Set<string>();
      const data: ExtensionRecordingListItem[] = [];
      for (const row of rows) {
        if (seen.has(row.recording.id)) continue;
        seen.add(row.recording.id);
        data.push(this.serializeExtensionRecording(row.recording, row.call, extensionId, tenantId));
      }

      return paginate(data, query.page, query.pageSize, total);
    });
  }

  async createPlaybackDescriptor(
    actor: AuthenticatedUser,
    tenantId: string,
    recordingId: string,
  ): Promise<RecordingPlaybackResponse> {
    await this.assertRecordingRead(actor, tenantId);
    const row = await this.loadAuthorizedRecording(actor, tenantId, recordingId);
    if (row.recording.status !== 'available' || !row.recording.storageKey) {
      throw notFound('Recording');
    }

    if (this.config.callRecordingStorageBackend === 'local' && this.localStorage.isActive()) {
      const exists = await this.localStorage.objectExists(row.recording.storageKey);
      if (!exists) throw notFound('Recording');
      const playbackUrl = `${this.config.publicApiUrl}/api/v1/tenants/${tenantId}/recordings/${recordingId}/content`;
      return {
        playbackUrl,
        expiresAt: null,
        contentType: row.recording.mimeType ?? this.localStorage.resolveContentType(row.recording.format),
        durationSeconds: row.recording.durationSeconds,
      };
    }

    if (!this.objectStorage.isConfigured()) {
      throw notFound('Recording');
    }
    const exists = await this.objectStorage.objectExists(row.recording.storageKey);
    if (!exists) throw notFound('Recording');
    const signed = await this.objectStorage.createPlaybackUrl(
      row.recording.storageKey,
      row.recording.format,
    );
    return {
      playbackUrl: signed.playbackUrl,
      expiresAt: signed.expiresAt,
      contentType: signed.contentType,
      durationSeconds: row.recording.durationSeconds,
    };
  }

  async createPlaybackUrl(
    actor: AuthenticatedUser,
    tenantId: string,
    recordingId: string,
  ): Promise<RecordingPlaybackResponse> {
    return this.createPlaybackDescriptor(actor, tenantId, recordingId);
  }

  async streamRecordingContent(
    actor: AuthenticatedUser,
    tenantId: string,
    recordingId: string,
    rangeHeader: string | undefined,
    res: StreamResponse,
  ): Promise<void> {
    await this.assertRecordingRead(actor, tenantId);
    const row = await this.loadAuthorizedRecording(actor, tenantId, recordingId);
    if (row.recording.status !== 'available' || !row.recording.storageKey) {
      res.status(404).json({ message: 'Recording unavailable' });
      return;
    }
    if (this.config.callRecordingStorageBackend !== 'local' || !this.localStorage.isActive()) {
      res.status(501).json({ message: 'Local streaming backend not active' });
      return;
    }

    try {
      const streamResult = await this.localStorage.openReadStream(
        row.recording.storageKey,
        row.recording.format,
        rangeHeader,
      );
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', streamResult.contentType);
      if (streamResult.contentRange) {
        res.status(206);
        res.setHeader(
          'Content-Range',
          `bytes ${streamResult.contentRange.start}-${streamResult.contentRange.end}/${streamResult.contentRange.total}`,
        );
      } else {
        res.status(200);
      }
      res.setHeader('Content-Length', String(streamResult.contentLength));
      streamResult.stream.pipe(res as unknown as NodeJS.WritableStream);
    } catch (err) {
      if (err instanceof RangeError) {
        res.status(416).end();
        return;
      }
      res.status(404).json({ message: 'Recording unavailable' });
    }
  }

  async getEffectiveExtensionRecording(
    tenantId: string,
    mode: 'inherit' | 'on' | 'off',
  ): Promise<{ effective: boolean; orgDefault: boolean }> {
    const orgDefault = await this.tenantTelephonySettingsService.readRecordCallsByDefault(tenantId);
    return {
      orgDefault,
      effective: effectiveExtensionRecording(orgDefault, mode),
    };
  }

  private async loadAuthorizedRecording(
    actor: AuthenticatedUser,
    tenantId: string,
    recordingId: string,
  ) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [hit] = await db
        .select({
          recording: callRecordings,
          call: calls,
        })
        .from(callRecordings)
        .innerJoin(calls, eq(callRecordings.callId, calls.id))
        .where(and(eq(callRecordings.tenantId, tenantId), eq(callRecordings.id, recordingId)))
        .limit(1);
      if (!hit) throw notFound('Recording');
      return hit;
    });
  }

  private async serializeCallRecording(
    recording: typeof callRecordings.$inferSelect,
    tenantId: string,
  ): Promise<CallRecordingSummary> {
    const playbackAvailable = await this.isPlaybackAvailable(recording);
    return {
      id: recording.id,
      callId: recording.callId,
      status: recording.status,
      mimeType: recording.mimeType,
      format: recording.format,
      durationMs: recording.durationMs,
      fileSizeBytes: recording.fileSizeBytes,
      startedAt: recording.startedAt?.toISOString() ?? null,
      completedAt: recording.completedAt?.toISOString() ?? null,
      playbackAvailable,
      failureCode: recording.failureCode,
      ...(playbackAvailable
        ? {
            playbackUrl: `${this.config.publicApiUrl}/api/v1/tenants/${tenantId}/recordings/${recording.id}/content`,
          }
        : {}),
    };
  }

  private serializeExtensionRecording(
    recording: typeof callRecordings.$inferSelect,
    call: typeof calls.$inferSelect,
    extensionId: string,
    tenantId: string,
  ): ExtensionRecordingListItem {
    const isFrom = call.fromExtensionId === extensionId;
    const direction =
      call.direction === 'internal' ? (isFrom ? 'outbound' : 'inbound') : call.direction;
    const remoteParty =
      direction === 'inbound' || (!isFrom && call.direction === 'internal')
        ? call.callerNumber
        : call.calleeNumber;

    return {
      id: recording.id,
      callId: recording.callId,
      status: recording.status,
      direction,
      remoteParty: remoteParty ?? null,
      callStatus: call.status,
      startedAt: call.startedAt.toISOString(),
      callDurationSeconds: call.durationSeconds,
      recordingDurationSeconds: recording.durationSeconds,
      format: recording.format,
      playbackAvailable:
        recording.status === 'available' &&
        Boolean(recording.storageKey) &&
        (this.localStorage.isActive() || this.objectStorage.isConfigured()),
    };
  }

  private async isPlaybackAvailable(recording: typeof callRecordings.$inferSelect): Promise<boolean> {
    if (recording.status !== 'available' || !recording.storageKey) return false;
    if (this.config.callRecordingStorageBackend === 'local' && this.localStorage.isActive()) {
      return this.localStorage.objectExists(recording.storageKey);
    }
    return this.objectStorage.isConfigured() && this.objectStorage.objectExists(recording.storageKey);
  }

  private async assertRecordingRead(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }

    const tenantRoles =
      actor.tenantMemberships.find((m) => m.tenantId === tenantId)?.roles ?? [];
    const permissions = resolveEffectivePermissions(
      actor.platformRoles,
      tenantRoles,
      tenantId,
    );
    if (
      !hasAnyPermission(permissions, [Permission.TENANT_RECORDING_READ])
    ) {
      throw tenantAccessDenied();
    }
  }
}
