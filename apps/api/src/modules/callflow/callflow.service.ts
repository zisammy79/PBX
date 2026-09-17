import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_TENANT_LOCALES,
  notFound,
  paginate,
  tenantAccessDenied,
  validationError,
  Permission,
  hasPermission,
  resolveEffectivePermissions,
  type AddDncListNumber,
  type AssignButtonLayout,
  type CreateBlacklistEntry,
  type CreateBusinessSchedule,
  type CreateButtonLayout,
  type CampaignNumberImportQuery,
  type CreateCampaign,
  type ImportCampaignNumbers,
  type ListCampaignNumbersQuery,
  type CreateOutboundFax,
  type CreateConference,
  type CreateCustomDestination,
  type CreateDncList,
  type CreateFeatureCode,
  type CreateIvr,
  type CreateMediaFile,
  type CreateMohClass,
  type CreatePagingGroup,
  type CreatePhonebookEntry,
  type CreatePlatformHolidayTemplate,
  type CreateQueue,
  type CreateRingGroup,
  type CreateShortNumber,
  type CreateTelephonyCronJob,
  type ListFaxesQuery,
  type ListSmsMessagesQuery,
  type ListVoicemailsQuery,
  type MarkFaxRead,
  type MarkVoicemailRead,
  type PlatformLocalePack,
  type UpdateBlacklistEntry,
  type UpdateBusinessSchedule,
  type UpdateButtonLayout,
  type UpdateCampaign,
  type UpdateConference,
  type UpdateCustomDestination,
  type UpdateDncList,
  type UpdateFeatureCode,
  type UpdateIvr,
  type UpdateMediaFile,
  type UpdateMohClass,
  type UpdatePagingGroup,
  type UpdatePhonebookEntry,
  type UpdateQueue,
  type UpdateRingGroup,
  type UpdateShortNumber,
  type UpdateTelephonyCronJob,
  type UpdateTenantLocales,
} from '@pbx/contracts';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyReply } from 'fastify';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  blacklistEntries,
  businessSchedules,
  buttonLayoutAssignments,
  buttonLayouts,
  campaignNumbers,
  campaigns,
  conferences,
  customDestinations,
  dncListNumbers,
  dncLists,
  extensions,
  faxes,
  featureCodes,
  integrationAssignments,
  integrationConnections,
  ivrOptions,
  ivrs,
  mediaFiles,
  mohClasses,
  pagingGroups,
  phonebookEntries,
  platformHolidayTemplates,
  platformLocalePacks,
  queueMembers,
  queues,
  ringGroupMembers,
  ringGroups,
  shortNumbers,
  sipDevices,
  smsMessages,
  telephonyCronJobs,
  tenantSettings,
  voicemails,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import { LocalMediaStorageService } from '../../common/local-media-storage.service.js';
import { LocalRecordingStorageService } from '../../common/local-recording-storage.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TenantLimitsService } from '../tenants/tenant-limits.service.js';
import { CampaignDialerService, normalizeCampaignNumber } from './campaign-dialer.service.js';
import { parseCampaignNumberInput } from './campaign-numbers.js';

const LOCALES_SETTINGS_KEY = 'locales';

type DbTx = Parameters<Parameters<typeof withTenantContext>[2]>[0];

function serialize<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function buildQueueAsteriskName(tenantId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `q_${tenantId.replace(/-/g, '').slice(0, 8)}_${slug || 'queue'}_${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class CallflowService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TenantLimitsService) private readonly tenantLimitsService: TenantLimitsService,
    @Inject(LocalMediaStorageService) private readonly mediaStorage: LocalMediaStorageService,
    @Inject(LocalRecordingStorageService) private readonly recordingStorage: LocalRecordingStorageService,
    @Inject(CampaignDialerService) private readonly campaignDialer: CampaignDialerService,
  ) {}

  // --- Schedules ---

  listSchedules(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, businessSchedules);
  }

  createSchedule(actor: AuthenticatedUser, tenantId: string, input: CreateBusinessSchedule) {
    return this.tenantCreate(actor, tenantId, businessSchedules, {
      tenantId,
      name: input.name,
      timezone: input.timezone,
      scheduleType: input.scheduleType,
      rules: input.rules,
      openDestinationType: input.openDestinationType ?? null,
      openDestinationId: input.openDestinationId ?? null,
      closedDestinationType: input.closedDestinationType ?? null,
      closedDestinationId: input.closedDestinationId ?? null,
    });
  }

  getSchedule(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, businessSchedules, id);
  }

  patchSchedule(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateBusinessSchedule) {
    return this.tenantPatch(actor, tenantId, businessSchedules, id, {
      ...input,
      updatedAt: new Date(),
    });
  }

  deleteSchedule(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, businessSchedules, id);
  }

  // --- IVRs ---

  async listIvrs(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db.select().from(ivrs).where(eq(ivrs.tenantId, tenantId));
      return Promise.all(rows.map((row) => this.loadIvr(db, tenantId, row)));
    });
  }

  async createIvr(actor: AuthenticatedUser, tenantId: string, input: CreateIvr) {
    await this.assertTenantAccess(actor, tenantId);
    await this.tenantLimitsService.assertCanCreateIvr(tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [ivr] = await db
        .insert(ivrs)
        .values({
          tenantId,
          name: input.name,
          greetingAudioKey: input.greetingAudioKey ?? null,
          timeoutSeconds: input.timeoutSeconds,
          maxRetries: input.maxRetries,
          allowDialExtensions: input.allowDialExtensions,
          allowFeatureCodes: input.allowFeatureCodes,
          language: input.language,
        })
        .returning();
      if (input.options.length > 0) {
        await db.insert(ivrOptions).values(
          input.options.map((option) => ({
            tenantId,
            ivrId: ivr!.id,
            digit: option.digit,
            destinationType: option.destinationType,
            destinationId: option.destinationId ?? null,
          })),
        );
      }
      return this.loadIvr(db, tenantId, ivr!);
    });
  }

  async getIvr(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [ivr] = await db
        .select()
        .from(ivrs)
        .where(and(eq(ivrs.tenantId, tenantId), eq(ivrs.id, id)))
        .limit(1);
      if (!ivr) throw notFound('IVR');
      return this.loadIvr(db, tenantId, ivr);
    });
  }

  async patchIvr(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateIvr) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(ivrs)
        .where(and(eq(ivrs.tenantId, tenantId), eq(ivrs.id, id)))
        .limit(1);
      if (!existing) throw notFound('IVR');

      const { options, ...patch } = input;
      if (Object.keys(patch).length > 0) {
        await db
          .update(ivrs)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(ivrs.tenantId, tenantId), eq(ivrs.id, id)));
      }
      if (options !== undefined) {
        await db.delete(ivrOptions).where(and(eq(ivrOptions.tenantId, tenantId), eq(ivrOptions.ivrId, id)));
        if (options.length > 0) {
          await db.insert(ivrOptions).values(
            options.map((option) => ({
              tenantId,
              ivrId: id,
              digit: option.digit,
              destinationType: option.destinationType,
              destinationId: option.destinationId ?? null,
            })),
          );
        }
      }
      const [updated] = await db
        .select()
        .from(ivrs)
        .where(and(eq(ivrs.tenantId, tenantId), eq(ivrs.id, id)))
        .limit(1);
      return this.loadIvr(db, tenantId, updated!);
    });
  }

  deleteIvr(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, ivrs, id);
  }

  // --- Queues ---

  async listQueues(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db.select().from(queues).where(eq(queues.tenantId, tenantId));
      return Promise.all(rows.map((row) => this.loadQueue(db, tenantId, row)));
    });
  }

  async createQueue(actor: AuthenticatedUser, tenantId: string, input: CreateQueue) {
    await this.assertTenantAccess(actor, tenantId);
    await this.tenantLimitsService.assertCanCreateQueue(tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [queue] = await db
        .insert(queues)
        .values({
          tenantId,
          name: input.name,
          asteriskQueueName: buildQueueAsteriskName(tenantId, input.name),
          strategy: input.strategy,
          maxWaitSeconds: input.maxWaitSeconds,
          number: input.number ?? null,
          recordAlways: input.recordAlways,
          mohClassId: input.mohClassId ?? null,
        })
        .returning();
      if (input.members.length > 0) {
        await db.insert(queueMembers).values(
          input.members.map((member) => ({
            tenantId,
            queueId: queue!.id,
            extensionId: member.extensionId,
            penalty: member.penalty,
          })),
        );
      }
      return this.loadQueue(db, tenantId, queue!);
    });
  }

  async getQueue(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [queue] = await db
        .select()
        .from(queues)
        .where(and(eq(queues.tenantId, tenantId), eq(queues.id, id)))
        .limit(1);
      if (!queue) throw notFound('Queue');
      return this.loadQueue(db, tenantId, queue);
    });
  }

  async patchQueue(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateQueue) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(queues)
        .where(and(eq(queues.tenantId, tenantId), eq(queues.id, id)))
        .limit(1);
      if (!existing) throw notFound('Queue');

      const { members, ...patch } = input;
      if (Object.keys(patch).length > 0) {
        await db
          .update(queues)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(queues.tenantId, tenantId), eq(queues.id, id)));
      }
      if (members !== undefined) {
        await db.delete(queueMembers).where(and(eq(queueMembers.tenantId, tenantId), eq(queueMembers.queueId, id)));
        if (members.length > 0) {
          await db.insert(queueMembers).values(
            members.map((member) => ({
              tenantId,
              queueId: id,
              extensionId: member.extensionId,
              penalty: member.penalty,
            })),
          );
        }
      }
      const [updated] = await db
        .select()
        .from(queues)
        .where(and(eq(queues.tenantId, tenantId), eq(queues.id, id)))
        .limit(1);
      return this.loadQueue(db, tenantId, updated!);
    });
  }

  deleteQueue(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, queues, id);
  }

  // --- Ring groups ---

  async listRingGroups(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db.select().from(ringGroups).where(eq(ringGroups.tenantId, tenantId));
      return Promise.all(rows.map((row) => this.loadRingGroup(db, tenantId, row)));
    });
  }

  async createRingGroup(actor: AuthenticatedUser, tenantId: string, input: CreateRingGroup) {
    await this.assertTenantAccess(actor, tenantId);
    await this.tenantLimitsService.assertCanCreateRingGroup(tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [group] = await db
        .insert(ringGroups)
        .values({
          tenantId,
          name: input.name,
          strategy: input.strategy,
          timeoutSeconds: input.timeoutSeconds,
        })
        .returning();
      if (input.members.length > 0) {
        await db.insert(ringGroupMembers).values(
          input.members.map((member) => ({
            tenantId,
            ringGroupId: group!.id,
            extensionId: member.extensionId,
            priority: member.priority,
          })),
        );
      }
      return this.loadRingGroup(db, tenantId, group!);
    });
  }

  async getRingGroup(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [group] = await db
        .select()
        .from(ringGroups)
        .where(and(eq(ringGroups.tenantId, tenantId), eq(ringGroups.id, id)))
        .limit(1);
      if (!group) throw notFound('Ring group');
      return this.loadRingGroup(db, tenantId, group);
    });
  }

  async patchRingGroup(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateRingGroup) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(ringGroups)
        .where(and(eq(ringGroups.tenantId, tenantId), eq(ringGroups.id, id)))
        .limit(1);
      if (!existing) throw notFound('Ring group');

      const { members, ...patch } = input;
      if (Object.keys(patch).length > 0) {
        await db
          .update(ringGroups)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(ringGroups.tenantId, tenantId), eq(ringGroups.id, id)));
      }
      if (members !== undefined) {
        await db
          .delete(ringGroupMembers)
          .where(and(eq(ringGroupMembers.tenantId, tenantId), eq(ringGroupMembers.ringGroupId, id)));
        if (members.length > 0) {
          await db.insert(ringGroupMembers).values(
            members.map((member) => ({
              tenantId,
              ringGroupId: id,
              extensionId: member.extensionId,
              priority: member.priority,
            })),
          );
        }
      }
      const [updated] = await db
        .select()
        .from(ringGroups)
        .where(and(eq(ringGroups.tenantId, tenantId), eq(ringGroups.id, id)))
        .limit(1);
      return this.loadRingGroup(db, tenantId, updated!);
    });
  }

  deleteRingGroup(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, ringGroups, id);
  }

  // --- Media files ---

  listMediaFiles(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, mediaFiles);
  }

  createMediaFile(actor: AuthenticatedUser, tenantId: string, input: CreateMediaFile) {
    return this.tenantCreate(actor, tenantId, mediaFiles, { tenantId, ...input });
  }

  getMediaFile(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, mediaFiles, id);
  }

  patchMediaFile(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateMediaFile) {
    return this.tenantPatch(actor, tenantId, mediaFiles, id, { ...input, updatedAt: new Date() });
  }

  deleteMediaFile(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, mediaFiles, id);
  }

  async uploadMediaFile(
    actor: AuthenticatedUser,
    tenantId: string,
    input: { buffer: Buffer; filename: string; displayName?: string },
  ) {
    await this.assertTenantAccess(actor, tenantId);
    if (!this.mediaStorage.isActive()) {
      throw validationError({ storage: 'Local media storage is not configured' });
    }

    let format: string;
    try {
      format = this.mediaStorage.normalizeFormat(path.extname(input.filename));
    } catch {
      throw validationError({ format: 'Unsupported media format. Allowed: wav, mp3, ulaw' });
    }
    const fileId = randomUUID();
    const storageKey = this.mediaStorage.buildStorageKey(tenantId, fileId, format);
    await this.mediaStorage.ensureRoot();
    await this.mediaStorage.saveObject(storageKey, input.buffer);

    const md5 = createHash('md5').update(input.buffer).digest('hex');
    const name = (input.displayName?.trim() || path.basename(input.filename, path.extname(input.filename))).slice(
      0,
      255,
    );

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .insert(mediaFiles)
        .values({
          tenantId,
          name,
          format,
          sizeBytes: input.buffer.length,
          md5,
          storageKey,
        })
        .returning();
      return serialize(row!);
    });
  }

  async streamMediaContent(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    rangeHeader: string | undefined,
    res: FastifyReply,
  ): Promise<void> {
    await this.assertTenantAccess(actor, tenantId);
    const row = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [hit] = await db
        .select()
        .from(mediaFiles)
        .where(and(eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.id, id)))
        .limit(1);
      return hit;
    });
    if (!row) {
      await res.status(404).send({ message: 'Media file not found' });
      return;
    }

    try {
      const streamResult = await this.mediaStorage.openReadStream(row.storageKey, row.format, rangeHeader);
      await this.sendBinaryStream(res, streamResult, `media-${id}.${row.format}`);
    } catch (err) {
      if (err instanceof RangeError) {
        await res.status(416).send();
        return;
      }
      await res.status(404).send({ message: 'Media file unavailable' });
    }
  }

  // --- MoH classes ---

  listMohClasses(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, mohClasses);
  }

  async createMohClass(actor: AuthenticatedUser, tenantId: string, input: CreateMohClass) {
    if (input.mediaFileIds?.length) {
      await this.assertMohMediaFileIds(actor, tenantId, input.mediaFileIds);
    }
    return this.tenantCreate(actor, tenantId, mohClasses, { tenantId, ...input });
  }

  getMohClass(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, mohClasses, id);
  }

  async patchMohClass(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateMohClass) {
    await this.assertTenantAccess(actor, tenantId);
    if (input.mediaFileIds) {
      await this.assertMohMediaFileIds(actor, tenantId, input.mediaFileIds);
    }
    return this.tenantPatch(actor, tenantId, mohClasses, id, { ...input, updatedAt: new Date() });
  }

  private async assertMohMediaFileIds(_actor: AuthenticatedUser, tenantId: string, mediaFileIds: string[]) {
    if (mediaFileIds.length === 0) return;
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.tenantId, tenantId), inArray(mediaFiles.id, mediaFileIds)));
      if (rows.length !== mediaFileIds.length) {
        throw validationError({ mediaFileIds: 'One or more media files were not found for this tenant' });
      }
    });
  }

  deleteMohClass(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, mohClasses, id);
  }

  // --- Voicemail inbox ---

  async listVoicemails(actor: AuthenticatedUser, tenantId: string, query: ListVoicemailsQuery) {
    await this.assertTenantAccess(actor, tenantId);
    const canManage = this.actorHasPermission(actor, tenantId, Permission.TENANT_VOICEMAIL_MANAGE);
    const canReadOwn = this.actorHasPermission(actor, tenantId, Permission.AGENT_VOICEMAIL_READ);
    if (!canManage && !canReadOwn) {
      throw tenantAccessDenied();
    }

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const conditions = [eq(voicemails.tenantId, tenantId)];

      if (!canManage) {
        const owned = await db
          .select({ id: extensions.id })
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenantId), eq(extensions.userId, actor.id)));
        const ownedIds = owned.map((row) => row.id);
        if (ownedIds.length === 0) {
          return [];
        }
        if (query.extensionId && !ownedIds.includes(query.extensionId)) {
          throw tenantAccessDenied();
        }
        conditions.push(
          inArray(voicemails.extensionId, query.extensionId ? [query.extensionId] : ownedIds),
        );
      } else if (query.extensionId) {
        conditions.push(eq(voicemails.extensionId, query.extensionId));
      }

      const rows = await db
        .select()
        .from(voicemails)
        .where(and(...conditions))
        .orderBy(desc(voicemails.createdAt));
      return rows.map((row) => serialize(row));
    });
  }

  async markVoicemailRead(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: MarkVoicemailRead,
  ) {
    await this.assertVoicemailAccess(actor, tenantId, id);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .update(voicemails)
        .set({ isRead: input.isRead })
        .where(and(eq(voicemails.tenantId, tenantId), eq(voicemails.id, id)))
        .returning();
      if (!row) throw notFound('Voicemail');
      return serialize(row);
    });
  }

  async deleteVoicemail(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertVoicemailAccess(actor, tenantId, id);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(voicemails)
        .where(and(eq(voicemails.tenantId, tenantId), eq(voicemails.id, id)))
        .limit(1);
      if (!existing) throw notFound('Voicemail');
      await db.delete(voicemails).where(and(eq(voicemails.tenantId, tenantId), eq(voicemails.id, id)));
      return { deleted: true, id };
    });
  }

  async streamVoicemailContent(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    rangeHeader: string | undefined,
    res: FastifyReply,
  ): Promise<void> {
    await this.assertVoicemailAccess(actor, tenantId, id);
    const row = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [hit] = await db
        .select()
        .from(voicemails)
        .where(and(eq(voicemails.tenantId, tenantId), eq(voicemails.id, id)))
        .limit(1);
      return hit;
    });
    if (!row) {
      await res.status(404).send({ message: 'Voicemail not found' });
      return;
    }

    if (!this.recordingStorage.isActive()) {
      await res.status(404).send({ message: 'Voicemail storage unavailable' });
      return;
    }

    try {
      const streamResult = await this.recordingStorage.openReadStream(row.storageKey, 'wav', rangeHeader);
      await this.sendBinaryStream(res, streamResult, `voicemail-${id}.wav`);
    } catch (err) {
      if (err instanceof RangeError) {
        await res.status(416).send();
        return;
      }
      await res.status(404).send({ message: 'Voicemail unavailable' });
    }
  }

  // --- Campaigns ---

  listCampaigns(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, campaigns);
  }

  async createCampaign(actor: AuthenticatedUser, tenantId: string, input: CreateCampaign) {
    await this.assertTenantAccess(actor, tenantId);
    await this.tenantLimitsService.assertCanCreateCampaign(tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .insert(campaigns)
        .values({
          tenantId,
          name: input.name,
          technology: input.technology,
          maxConcurrent: input.maxConcurrent,
          maxAttempts: input.maxAttempts,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
        })
        .returning();
      return serialize(row!);
    });
  }

  getCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, campaigns, id);
  }

  patchCampaign(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateCampaign) {
    const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
    if (input.startsAt !== undefined) {
      patch.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    }
    if (input.endsAt !== undefined) {
      patch.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    }
    return this.tenantPatch(actor, tenantId, campaigns, id, patch);
  }

  deleteCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, campaigns, id);
  }

  async startCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.setCampaignStatus(actor, tenantId, id, 'running', ['draft', 'ready', 'paused']);
  }

  async pauseCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.setCampaignStatus(actor, tenantId, id, 'paused', ['running']);
  }

  async stopCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.setCampaignStatus(actor, tenantId, id, 'completed', ['running', 'paused', 'ready', 'draft']);
  }

  tickCampaign(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.campaignDialer.tick(actor, tenantId, id);
  }

  async importCampaignNumbers(
    actor: AuthenticatedUser,
    tenantId: string,
    campaignId: string,
    input: ImportCampaignNumbers,
    options: CampaignNumberImportQuery,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    const skipDnc = options.skipDnc ?? false;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)))
        .limit(1);
      if (!campaign) throw notFound('Campaign');

      const dncNumbers = skipDnc ? new Set<string>() : await this.loadDncNumberSet(db, tenantId);
      const existingRows = await db
        .select({ number: campaignNumbers.number })
        .from(campaignNumbers)
        .where(and(eq(campaignNumbers.tenantId, tenantId), eq(campaignNumbers.campaignId, campaignId)));
      const existing = new Set(existingRows.map((row) => normalizeCampaignNumber(row.number)));

      let imported = 0;
      let skippedInvalid = 0;
      let skippedDnc = 0;
      let skippedDuplicate = 0;

      for (const raw of input.numbers) {
        const parsed = parseCampaignNumberInput(raw);
        if (!parsed) {
          skippedInvalid += 1;
          continue;
        }
        const key = normalizeCampaignNumber(parsed);
        if (existing.has(key)) {
          skippedDuplicate += 1;
          continue;
        }
        if (dncNumbers.has(key)) {
          skippedDnc += 1;
          continue;
        }
        await db.insert(campaignNumbers).values({
          tenantId,
          campaignId,
          number: parsed,
        });
        existing.add(key);
        imported += 1;
      }

      return {
        campaignId,
        imported,
        skipped: {
          invalid: skippedInvalid,
          dnc: skippedDnc,
          duplicate: skippedDuplicate,
        },
        totalSubmitted: input.numbers.length,
      };
    });
  }

  async listCampaignNumbers(
    actor: AuthenticatedUser,
    tenantId: string,
    campaignId: string,
    query: ListCampaignNumbersQuery,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    const offset = (query.page - 1) * query.pageSize;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)))
        .limit(1);
      if (!campaign) throw notFound('Campaign');

      const filters = and(
        eq(campaignNumbers.tenantId, tenantId),
        eq(campaignNumbers.campaignId, campaignId),
      );

      const countRow = await db.select({ total: count() }).from(campaignNumbers).where(filters);
      const total = Number(countRow[0]?.total ?? 0);

      const rows = await db
        .select()
        .from(campaignNumbers)
        .where(filters)
        .orderBy(asc(campaignNumbers.createdAt))
        .limit(query.pageSize)
        .offset(offset);

      return paginate(rows.map((row) => serialize(row)), query.page, query.pageSize, total);
    });
  }

  private async loadDncNumberSet(db: DbTx, tenantId: string): Promise<Set<string>> {
    const rows = await db
      .select({ number: dncListNumbers.number })
      .from(dncListNumbers)
      .innerJoin(dncLists, eq(dncListNumbers.listId, dncLists.id))
      .where(and(eq(dncListNumbers.tenantId, tenantId), eq(dncLists.listType, 'dnc')));
    return new Set(rows.map((row) => normalizeCampaignNumber(row.number)));
  }

  // --- Telephony cron jobs ---

  listTelephonyCronJobs(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, telephonyCronJobs);
  }

  createTelephonyCronJob(actor: AuthenticatedUser, tenantId: string, input: CreateTelephonyCronJob) {
    return this.tenantCreate(actor, tenantId, telephonyCronJobs, { tenantId, ...input });
  }

  getTelephonyCronJob(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, telephonyCronJobs, id);
  }

  patchTelephonyCronJob(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: UpdateTelephonyCronJob,
  ) {
    return this.tenantPatch(actor, tenantId, telephonyCronJobs, id, { ...input, updatedAt: new Date() });
  }

  deleteTelephonyCronJob(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, telephonyCronJobs, id);
  }

  // --- Button layouts / BLF provisioning ---

  listButtonLayouts(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, buttonLayouts);
  }

  async createButtonLayout(actor: AuthenticatedUser, tenantId: string, input: CreateButtonLayout) {
    await this.assertTenantAccess(actor, tenantId);
    await this.tenantLimitsService.assertCanCreateButtonLayout(tenantId);
    if (input.lineEnd < input.lineStart) {
      throw validationError({ lineEnd: 'lineEnd must be >= lineStart' });
    }
    return this.tenantCreate(actor, tenantId, buttonLayouts, {
      tenantId,
      name: input.name,
      vendorTemplate: input.vendorTemplate,
      code: input.code ?? null,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      buttons: input.buttons,
    });
  }

  getButtonLayout(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, buttonLayouts, id);
  }

  patchButtonLayout(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateButtonLayout) {
    if (input.lineStart !== undefined && input.lineEnd !== undefined && input.lineEnd < input.lineStart) {
      throw validationError({ lineEnd: 'lineEnd must be >= lineStart' });
    }
    return this.tenantPatch(actor, tenantId, buttonLayouts, id, { ...input, updatedAt: new Date() });
  }

  deleteButtonLayout(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, buttonLayouts, id);
  }

  async assignButtonLayout(
    actor: AuthenticatedUser,
    tenantId: string,
    layoutId: string,
    input: AssignButtonLayout,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [layout] = await db
        .select()
        .from(buttonLayouts)
        .where(and(eq(buttonLayouts.tenantId, tenantId), eq(buttonLayouts.id, layoutId)))
        .limit(1);
      if (!layout) throw notFound('Button layout');

      if (input.deviceId) {
        const [device] = await db
          .select()
          .from(sipDevices)
          .where(and(eq(sipDevices.tenantId, tenantId), eq(sipDevices.id, input.deviceId)))
          .limit(1);
        if (!device) throw notFound('Device');
      }
      if (input.extensionId) {
        const [extension] = await db
          .select()
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, input.extensionId)))
          .limit(1);
        if (!extension) throw notFound('Extension');
      }

      const [row] = await db
        .insert(buttonLayoutAssignments)
        .values({
          tenantId,
          layoutId,
          deviceId: input.deviceId ?? null,
          extensionId: input.extensionId ?? null,
        })
        .returning();
      return serialize(row!);
    });
  }

  // --- Faxes ---

  async listFaxes(actor: AuthenticatedUser, tenantId: string, query: ListFaxesQuery) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const conditions = [eq(faxes.tenantId, tenantId)];
      if (query.direction) conditions.push(eq(faxes.direction, query.direction));
      if (query.status) conditions.push(eq(faxes.status, query.status));
      const rows = await db
        .select()
        .from(faxes)
        .where(and(...conditions))
        .orderBy(desc(faxes.createdAt));
      return rows.map((row) => serialize(row));
    });
  }

  getFax(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, faxes, id);
  }

  async createOutboundFax(actor: AuthenticatedUser, tenantId: string, input: CreateOutboundFax) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .insert(faxes)
        .values({
          tenantId,
          direction: 'outbound',
          remoteNumber: input.remoteNumber,
          localNumber: input.localNumber,
          status: 'queued',
          pages: input.pages,
        })
        .returning();
      return serialize(row!);
    });
  }

  async markFaxRead(actor: AuthenticatedUser, tenantId: string, id: string, input: MarkFaxRead) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .update(faxes)
        .set({
          status: input.isRead ? 'read' : 'received',
          updatedAt: new Date(),
        })
        .where(and(eq(faxes.tenantId, tenantId), eq(faxes.id, id)))
        .returning();
      if (!row) throw notFound('Fax');
      return serialize(row);
    });
  }

  deleteFax(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, faxes, id);
  }

  // --- SMS messages (stub) ---

  async listSmsMessages(actor: AuthenticatedUser, tenantId: string, query: ListSmsMessagesQuery) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const conditions = [eq(smsMessages.tenantId, tenantId)];
      if (query.campaignId) conditions.push(eq(smsMessages.campaignId, query.campaignId));
      const rows = await db
        .select()
        .from(smsMessages)
        .where(and(...conditions))
        .orderBy(desc(smsMessages.createdAt));
      return rows.map((row) => serialize(row));
    });
  }

  listPhoneVendorTemplates(_actor: AuthenticatedUser) {
    return [
      { id: 'generic', label: 'Generic' },
      { id: 'yealink', label: 'Yealink' },
      { id: 'fanvil', label: 'Fanvil' },
    ];
  }

  // --- Feature codes ---

  listFeatureCodes(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, featureCodes);
  }

  createFeatureCode(actor: AuthenticatedUser, tenantId: string, input: CreateFeatureCode) {
    return this.tenantCreate(actor, tenantId, featureCodes, { tenantId, ...input });
  }

  getFeatureCode(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, featureCodes, id);
  }

  patchFeatureCode(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateFeatureCode) {
    return this.tenantPatch(actor, tenantId, featureCodes, id, { ...input, updatedAt: new Date() });
  }

  deleteFeatureCode(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, featureCodes, id);
  }

  // --- Blacklist ---

  listBlacklist(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, blacklistEntries);
  }

  createBlacklistEntry(actor: AuthenticatedUser, tenantId: string, input: CreateBlacklistEntry) {
    return this.tenantCreate(actor, tenantId, blacklistEntries, { tenantId, ...input });
  }

  getBlacklistEntry(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, blacklistEntries, id);
  }

  patchBlacklistEntry(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: UpdateBlacklistEntry,
  ) {
    return this.tenantPatch(actor, tenantId, blacklistEntries, id, input);
  }

  deleteBlacklistEntry(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, blacklistEntries, id);
  }

  // --- Short numbers ---

  listShortNumbers(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, shortNumbers);
  }

  createShortNumber(actor: AuthenticatedUser, tenantId: string, input: CreateShortNumber) {
    return this.tenantCreate(actor, tenantId, shortNumbers, { tenantId, ...input });
  }

  getShortNumber(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, shortNumbers, id);
  }

  patchShortNumber(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateShortNumber) {
    return this.tenantPatch(actor, tenantId, shortNumbers, id, { ...input, updatedAt: new Date() });
  }

  deleteShortNumber(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, shortNumbers, id);
  }

  // --- Custom destinations ---

  listCustomDestinations(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, customDestinations);
  }

  createCustomDestination(actor: AuthenticatedUser, tenantId: string, input: CreateCustomDestination) {
    return this.tenantCreate(actor, tenantId, customDestinations, { tenantId, ...input });
  }

  getCustomDestination(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, customDestinations, id);
  }

  patchCustomDestination(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: UpdateCustomDestination,
  ) {
    return this.tenantPatch(actor, tenantId, customDestinations, id, { ...input, updatedAt: new Date() });
  }

  deleteCustomDestination(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, customDestinations, id);
  }

  // --- Conferences ---

  listConferences(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, conferences);
  }

  createConference(actor: AuthenticatedUser, tenantId: string, input: CreateConference) {
    return this.tenantCreate(actor, tenantId, conferences, { tenantId, ...input });
  }

  getConference(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, conferences, id);
  }

  patchConference(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateConference) {
    return this.tenantPatch(actor, tenantId, conferences, id, { ...input, updatedAt: new Date() });
  }

  deleteConference(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, conferences, id);
  }

  // --- Paging groups ---

  listPagingGroups(actor: AuthenticatedUser, tenantId: string) {
    return this.tenantList(actor, tenantId, pagingGroups);
  }

  createPagingGroup(actor: AuthenticatedUser, tenantId: string, input: CreatePagingGroup) {
    return this.tenantCreate(actor, tenantId, pagingGroups, { tenantId, ...input });
  }

  getPagingGroup(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, pagingGroups, id);
  }

  patchPagingGroup(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdatePagingGroup) {
    return this.tenantPatch(actor, tenantId, pagingGroups, id, { ...input, updatedAt: new Date() });
  }

  deletePagingGroup(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, pagingGroups, id);
  }

  // --- Phonebooks ---

  async listPhonebookEntries(actor: AuthenticatedUser, tenantId: string, bookName?: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const conditions = [eq(phonebookEntries.tenantId, tenantId)];
      if (bookName) {
        conditions.push(eq(phonebookEntries.bookName, bookName));
      }
      const rows = await db.select().from(phonebookEntries).where(and(...conditions));
      return rows.map((row) => serialize(row));
    });
  }

  createPhonebookEntry(actor: AuthenticatedUser, tenantId: string, input: CreatePhonebookEntry) {
    return this.tenantCreate(actor, tenantId, phonebookEntries, { tenantId, ...input });
  }

  getPhonebookEntry(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantGet(actor, tenantId, phonebookEntries, id);
  }

  patchPhonebookEntry(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: UpdatePhonebookEntry,
  ) {
    return this.tenantPatch(actor, tenantId, phonebookEntries, id, { ...input, updatedAt: new Date() });
  }

  deletePhonebookEntry(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, phonebookEntries, id);
  }

  // --- DNC lists ---

  async listDncLists(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db.select().from(dncLists).where(eq(dncLists.tenantId, tenantId));
      return Promise.all(rows.map((row) => this.loadDncList(db, tenantId, row)));
    });
  }

  async createDncList(actor: AuthenticatedUser, tenantId: string, input: CreateDncList) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [list] = await db.insert(dncLists).values({ tenantId, ...input }).returning();
      return this.loadDncList(db, tenantId, list!);
    });
  }

  async getDncList(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [list] = await db
        .select()
        .from(dncLists)
        .where(and(eq(dncLists.tenantId, tenantId), eq(dncLists.id, id)))
        .limit(1);
      if (!list) throw notFound('DNC list');
      return this.loadDncList(db, tenantId, list);
    });
  }

  patchDncList(actor: AuthenticatedUser, tenantId: string, id: string, input: UpdateDncList) {
    return this.tenantPatch(actor, tenantId, dncLists, id, { ...input, updatedAt: new Date() });
  }

  deleteDncList(actor: AuthenticatedUser, tenantId: string, id: string) {
    return this.tenantDelete(actor, tenantId, dncLists, id);
  }

  async addDncListNumber(
    actor: AuthenticatedUser,
    tenantId: string,
    listId: string,
    input: AddDncListNumber,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [list] = await db
        .select()
        .from(dncLists)
        .where(and(eq(dncLists.tenantId, tenantId), eq(dncLists.id, listId)))
        .limit(1);
      if (!list) throw notFound('DNC list');
      const [row] = await db
        .insert(dncListNumbers)
        .values({ tenantId, listId, number: input.number })
        .returning();
      return serialize(row!);
    });
  }

  async removeDncListNumber(
    actor: AuthenticatedUser,
    tenantId: string,
    listId: string,
    number: string,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [list] = await db
        .select()
        .from(dncLists)
        .where(and(eq(dncLists.tenantId, tenantId), eq(dncLists.id, listId)))
        .limit(1);
      if (!list) throw notFound('DNC list');
      await db
        .delete(dncListNumbers)
        .where(
          and(
            eq(dncListNumbers.tenantId, tenantId),
            eq(dncListNumbers.listId, listId),
            eq(dncListNumbers.number, number),
          ),
        );
      return { removed: true, number };
    });
  }

  // --- Tenant locales ---

  async getTenantLocales(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, LOCALES_SETTINGS_KEY)))
        .limit(1);
      const value = (row?.value ?? {}) as {
        enabledLocales?: string[];
        defaultLocale?: string;
      };
      return {
        enabledLocales: value.enabledLocales ?? [...DEFAULT_TENANT_LOCALES],
        defaultLocale: value.defaultLocale ?? DEFAULT_TENANT_LOCALES[0],
      };
    });
  }

  async patchTenantLocales(actor: AuthenticatedUser, tenantId: string, input: UpdateTenantLocales) {
    await this.assertTenantAccess(actor, tenantId);
    if (!input.enabledLocales.includes(input.defaultLocale)) {
      throw validationError({ defaultLocale: 'Default locale must be included in enabledLocales' });
    }
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const value = {
        enabledLocales: input.enabledLocales,
        defaultLocale: input.defaultLocale,
      };
      await db
        .insert(tenantSettings)
        .values({ tenantId, key: LOCALES_SETTINGS_KEY, value })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: { value, updatedAt: new Date() },
        });
      return value;
    });
  }

  // --- Platform catalogs ---

  listPlatformLocalePacks(_actor: AuthenticatedUser) {
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db.select().from(platformLocalePacks);
      return rows.map((row) => serialize(row));
    });
  }

  putPlatformLocalePacks(_actor: AuthenticatedUser, items: PlatformLocalePack[]) {
    return withBypassRls(this.database.db, async (db) => {
      const results = [];
      for (const item of items) {
        const [row] = await db
          .insert(platformLocalePacks)
          .values({
            locale: item.locale,
            label: item.label,
            direction: item.direction,
            messages: item.messages,
            version: item.version,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: platformLocalePacks.locale,
            set: {
              label: item.label,
              direction: item.direction,
              messages: item.messages,
              version: item.version,
              updatedAt: new Date(),
            },
          })
          .returning();
        results.push(serialize(row!));
      }
      return results;
    });
  }

  listPlatformHolidayTemplates(_actor: AuthenticatedUser) {
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db.select().from(platformHolidayTemplates);
      return rows.map((row) => serialize(row));
    });
  }

  createPlatformHolidayTemplate(_actor: AuthenticatedUser, input: CreatePlatformHolidayTemplate) {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db.insert(platformHolidayTemplates).values(input).returning();
      return serialize(row!);
    });
  }

  // --- Helpers ---

  private async tenantList(
    actor: AuthenticatedUser,
    tenantId: string,
    table: PgTable,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(table)
        .where(eq((table as typeof businessSchedules).tenantId, tenantId));
      return rows.map((row) => serialize(row as Record<string, unknown>));
    });
  }

  private async tenantCreate<T extends Record<string, unknown>>(
    actor: AuthenticatedUser,
    tenantId: string,
    table: PgTable,
    values: T,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db.insert(table).values(values).returning();
      return serialize(row as Record<string, unknown>);
    });
  }

  private async tenantGet(actor: AuthenticatedUser, tenantId: string, table: PgTable, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const scoped = table as typeof businessSchedules;
      const [row] = await db
        .select()
        .from(table)
        .where(and(eq(scoped.id, id), eq(scoped.tenantId, tenantId)))
        .limit(1);
      if (!row) throw notFound('Resource');
      return serialize(row as Record<string, unknown>);
    });
  }

  private async tenantPatch<T extends Record<string, unknown>>(
    actor: AuthenticatedUser,
    tenantId: string,
    table: PgTable,
    id: string,
    patch: T,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const scoped = table as typeof businessSchedules;
      const [existing] = await db
        .select()
        .from(table)
        .where(and(eq(scoped.id, id), eq(scoped.tenantId, tenantId)))
        .limit(1);
      if (!existing) throw notFound('Resource');
      const [row] = await db
        .update(table)
        .set(patch)
        .where(and(eq(scoped.id, id), eq(scoped.tenantId, tenantId)))
        .returning();
      return serialize(row as Record<string, unknown>);
    });
  }

  private async tenantDelete(actor: AuthenticatedUser, tenantId: string, table: PgTable, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const scoped = table as typeof businessSchedules;
      const [existing] = await db
        .select()
        .from(table)
        .where(and(eq(scoped.id, id), eq(scoped.tenantId, tenantId)))
        .limit(1);
      if (!existing) throw notFound('Resource');
      await db.delete(table).where(and(eq(scoped.id, id), eq(scoped.tenantId, tenantId)));
      return { deleted: true, id };
    });
  }

  private async loadIvr(db: DbTx, tenantId: string, ivr: typeof ivrs.$inferSelect) {
    const options = await db
      .select()
      .from(ivrOptions)
      .where(and(eq(ivrOptions.tenantId, tenantId), eq(ivrOptions.ivrId, ivr.id)));
    return {
      ...serialize(ivr),
      options: options.map((option) => serialize(option)),
    };
  }

  private async loadQueue(db: DbTx, tenantId: string, queue: typeof queues.$inferSelect) {
    const members = await db
      .select()
      .from(queueMembers)
      .where(and(eq(queueMembers.tenantId, tenantId), eq(queueMembers.queueId, queue.id)));
    return {
      ...serialize(queue),
      members: members.map((member) => serialize(member)),
    };
  }

  private async loadRingGroup(db: DbTx, tenantId: string, group: typeof ringGroups.$inferSelect) {
    const members = await db
      .select()
      .from(ringGroupMembers)
      .where(and(eq(ringGroupMembers.tenantId, tenantId), eq(ringGroupMembers.ringGroupId, group.id)));
    return {
      ...serialize(group),
      members: members.map((member) => serialize(member)),
    };
  }

  private async loadDncList(db: DbTx, tenantId: string, list: typeof dncLists.$inferSelect) {
    const numbers = await db
      .select()
      .from(dncListNumbers)
      .where(and(eq(dncListNumbers.tenantId, tenantId), eq(dncListNumbers.listId, list.id)));
    return {
      ...serialize(list),
      numbers: numbers.map((row) => serialize(row)),
    };
  }

  private async sendBinaryStream(
    res: FastifyReply,
    streamResult: {
      stream: NodeJS.ReadableStream;
      contentType: string;
      contentLength: number;
      contentRange?: { start: number; end: number; total: number };
    },
    filename: string,
  ): Promise<void> {
    void res.header('Accept-Ranges', 'bytes');
    void res.header('Content-Type', streamResult.contentType);
    void res.header('Content-Disposition', `inline; filename="${filename}"`);
    if (streamResult.contentRange) {
      void res.status(206);
      void res.header(
        'Content-Range',
        `bytes ${streamResult.contentRange.start}-${streamResult.contentRange.end}/${streamResult.contentRange.total}`,
      );
    } else {
      void res.status(200);
    }
    void res.header('Content-Length', String(streamResult.contentLength));
    await res.send(streamResult.stream);
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
  }

  private actorHasPermission(
    actor: AuthenticatedUser,
    tenantId: string,
    permission: Permission,
  ): boolean {
    const tenantRoles =
      actor.tenantMemberships.find((m) => m.tenantId === tenantId)?.roles ?? [];
    const permissions = resolveEffectivePermissions(
      actor.platformRoles,
      tenantRoles,
      tenantId,
    );
    return hasPermission(permissions, permission);
  }

  private async assertVoicemailAccess(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    const canManage = this.actorHasPermission(actor, tenantId, Permission.TENANT_VOICEMAIL_MANAGE);
    if (canManage) {
      return;
    }
    if (!this.actorHasPermission(actor, tenantId, Permission.AGENT_VOICEMAIL_READ)) {
      throw tenantAccessDenied();
    }

    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [message] = await db
        .select()
        .from(voicemails)
        .where(and(eq(voicemails.tenantId, tenantId), eq(voicemails.id, id)))
        .limit(1);
      if (!message) {
        throw notFound('Voicemail');
      }
      const [extension] = await db
        .select()
        .from(extensions)
        .where(
          and(
            eq(extensions.tenantId, tenantId),
            eq(extensions.id, message.extensionId),
            eq(extensions.userId, actor.id),
          ),
        )
        .limit(1);
      if (!extension) {
        throw tenantAccessDenied();
      }
    });
  }

  private async setCampaignStatus(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    status: string,
    allowedFrom: string[],
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id)))
        .limit(1);
      if (!existing) throw notFound('Campaign');
      if (!allowedFrom.includes(existing.status)) {
        throw validationError({ status: `Cannot transition from ${existing.status} to ${status}` });
      }

      if (status === 'running' && existing.technology === 'sms') {
        const hasSmsProvider = await this.tenantHasSmsProvider(db, tenantId);
        if (!hasSmsProvider) {
          const [row] = await db
            .update(campaigns)
            .set({ status: 'ready', updatedAt: new Date() })
            .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id)))
            .returning();
          return {
            ...serialize(row!),
            providerRequired: true,
            warning:
              'No SMS provider is configured for this tenant. Campaign remains in ready state until an SMS integration is assigned.',
          };
        }
      }

      const [row] = await db
        .update(campaigns)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id)))
        .returning();
      return serialize(row!);
    });
  }

  private async tenantHasSmsProvider(
    db: DbTx,
    tenantId: string,
  ): Promise<boolean> {
    const [assigned] = await db
      .select({ id: integrationConnections.id })
      .from(integrationAssignments)
      .innerJoin(integrationConnections, eq(integrationAssignments.connectionId, integrationConnections.id))
      .where(
        and(
          eq(integrationAssignments.tenantId, tenantId),
          eq(integrationAssignments.enabled, true),
          eq(integrationConnections.integrationType, 'sms'),
          eq(integrationConnections.enabled, true),
          inArray(integrationConnections.validationStatus, ['VALID', 'CONFIGURED_NOT_TESTED']),
        ),
      )
      .limit(1);

    if (assigned) return true;

    const [owned] = await db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.scopeType, 'tenant'),
          eq(integrationConnections.scopeId, tenantId),
          eq(integrationConnections.integrationType, 'sms'),
          eq(integrationConnections.enabled, true),
          inArray(integrationConnections.validationStatus, ['VALID', 'CONFIGURED_NOT_TESTED']),
        ),
      )
      .limit(1);

    return Boolean(owned);
  }
}
