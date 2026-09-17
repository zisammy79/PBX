import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_TENANT_LOCALES,
  notFound,
  tenantAccessDenied,
  validationError,
  type AddDncListNumber,
  type CreateBlacklistEntry,
  type CreateBusinessSchedule,
  type CreateConference,
  type CreateCustomDestination,
  type CreateDncList,
  type CreateFeatureCode,
  type CreateIvr,
  type CreateMediaFile,
  type CreatePagingGroup,
  type CreatePhonebookEntry,
  type CreatePlatformHolidayTemplate,
  type CreateQueue,
  type CreateRingGroup,
  type CreateShortNumber,
  type PlatformLocalePack,
  type UpdateBlacklistEntry,
  type UpdateBusinessSchedule,
  type UpdateConference,
  type UpdateCustomDestination,
  type UpdateDncList,
  type UpdateFeatureCode,
  type UpdateIvr,
  type UpdateMediaFile,
  type UpdatePagingGroup,
  type UpdatePhonebookEntry,
  type UpdateQueue,
  type UpdateRingGroup,
  type UpdateShortNumber,
  type UpdateTenantLocales,
} from '@pbx/contracts';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  blacklistEntries,
  businessSchedules,
  conferences,
  customDestinations,
  dncListNumbers,
  dncLists,
  featureCodes,
  ivrOptions,
  ivrs,
  mediaFiles,
  pagingGroups,
  phonebookEntries,
  platformHolidayTemplates,
  platformLocalePacks,
  queueMembers,
  queues,
  ringGroupMembers,
  ringGroups,
  shortNumbers,
  tenantSettings,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TenantLimitsService } from '../tenants/tenant-limits.service.js';

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

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
  }
}
