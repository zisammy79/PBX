import { Inject, Injectable } from '@nestjs/common';
import {
  notFound,
  validationError,
  type TenantPhoneNumberRow,
  type TwilioNumberAssignment,
  type TwilioOutboundCallerIdPolicy,
  type TwilioPurchaseAndAssign,
} from '@pbx/contracts';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  inboundRoutes,
  phoneNumbers,
  sipTrunks,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { isTwilioConfigured } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import { assertIsraeliE164 } from './twilio-israel.js';
import { TwilioProvisioningService } from './twilio-provisioning.service.js';
import { TwilioService } from './twilio.service.js';

const TWILIO_TRUNK_SLUG = 'twilio-production';

export type NumberAssignmentInput = TwilioNumberAssignment & {
  e164?: string;
  phoneNumberSid?: string;
  friendlyName?: string;
};

@Injectable()
export class TwilioNumbersService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TwilioService) private readonly twilioService: TwilioService,
    @Inject(TwilioProvisioningService) private readonly provisioningService: TwilioProvisioningService,
    @Inject(TelephonyService) private readonly telephonyService: TelephonyService,
  ) {}

  assertTwilioConfigured(): void {
    if (!isTwilioConfigured(this.config)) {
      throw validationError({ twilio: 'Twilio is not configured on this platform' });
    }
  }

  async listTenantPhoneNumbers(tenantId: string): Promise<TenantPhoneNumberRow[]> {
    const cfg = isTwilioConfigured(this.config) ? this.config.twilioTrunkSid : null;
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, tenantId));
      const out: TenantPhoneNumberRow[] = [];
      for (const row of rows) {
        let destinationType: string | null = null;
        let destinationId: string | null = null;
        if (row.inboundRouteId) {
          const [route] = await db
            .select()
            .from(inboundRoutes)
            .where(eq(inboundRoutes.id, row.inboundRouteId))
            .limit(1);
          destinationType = route?.destinationType ?? null;
          destinationId = route?.destinationId ?? null;
        }
        let onTwilioTrunk = false;
        if (row.providerSid && cfg) {
          const twilioRow = await this.twilioService.findNumberByE164(row.e164).catch(() => null);
          onTwilioTrunk = twilioRow?.trunkSid === cfg;
        }
        out.push({
          id: row.id,
          tenantId: row.tenantId,
          e164: row.e164,
          friendlyName: row.friendlyName,
          provider: row.provider,
          providerSid: row.providerSid,
          status: row.status,
          capabilities: (row.capabilities ?? {}) as Record<string, unknown>,
          regulatoryStatus: row.regulatoryStatus,
          trunkId: row.trunkId,
          inboundRouteId: row.inboundRouteId,
          isActive: row.isActive,
          destinationType,
          destinationId,
          onTwilioTrunk,
        });
      }
      return out;
    });
  }

  async purchaseNumber(
    actor: AuthenticatedUser,
    input: { e164: string; friendlyName?: string },
  ): Promise<{ sid: string; e164: string; status: string }> {
    this.assertTwilioConfigured();
    const e164 = assertIsraeliE164(input.e164);
    const purchased = await this.twilioService.purchaseIncomingNumber(e164, input.friendlyName);

    await withBypassRls(this.database.db, async (db) => {
      await db.insert(auditEvents).values({
        tenantId: null,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'twilio.number.purchased',
        resourceType: 'phone_number',
        resourceId: null,
        metadata: {
          e164: purchased.e164,
          twilioNumberSid: purchased.sid,
          twilioTrunkSid: this.config.twilioTrunkSid,
        },
      });
    });

    return { ...purchased, status: 'owned_not_attached' };
  }

  async attachToTrunk(
    actor: AuthenticatedUser,
    phoneNumberSid: string,
    tenantId?: string,
  ): Promise<{ phoneNumberSid: string; trunkSid: string; status: string }> {
    this.assertTwilioConfigured();
    const owned = (await this.twilioService.listOwnedNumbers()).find((n) => n.sid === phoneNumberSid);
    if (!owned) throw notFound('Twilio phone number');

    try {
      const { trunkSid } = await this.twilioService.attachNumberToTrunk(phoneNumberSid);
      if (tenantId) {
        await this.updatePhoneNumberStatus(tenantId, owned.e164, 'attached_route_pending', {
          providerSid: phoneNumberSid,
        });
      }

      await this.recordAudit(actor, tenantId ?? null, 'twilio.number.attached_to_trunk', {
        e164: owned.e164,
        twilioNumberSid: phoneNumberSid,
        twilioTrunkSid: trunkSid,
      });

      return { phoneNumberSid, trunkSid, status: 'attached_route_pending' };
    } catch (error) {
      if (tenantId) {
        await this.updatePhoneNumberStatus(tenantId, owned.e164, 'owned_not_attached', {
          providerSid: phoneNumberSid,
        });
      }
      throw error;
    }
  }

  async assignNumberToTenant(
    actor: AuthenticatedUser,
    phoneNumberSid: string,
    assignment: NumberAssignmentInput,
  ): Promise<TenantPhoneNumberRow> {
    this.assertTwilioConfigured();
    const owned = (await this.twilioService.listOwnedNumbers()).find((n) => n.sid === phoneNumberSid);
    if (!owned) throw notFound('Twilio phone number');

    const e164 = assertIsraeliE164(owned.e164);
    await this.provisioningService.syncTrunkOnly();

    const trunkAttached = owned.trunkSid === this.config.twilioTrunkSid;
    if (!trunkAttached) {
      await this.attachToTrunk(actor, phoneNumberSid, assignment.tenantId);
    }

    try {
      const pbxTrunkId = await this.provisioningService.ensurePbxTwilioTrunkPublic(
        actor,
        assignment.tenantId,
        e164,
        assignment.outboundCallerIdPolicy,
      );

      if (assignment.destinationType !== 'reserve_only') {
        const destinationId = await this.resolveDestination(assignment);
        await this.provisioningService.ensureInboundRoutePublic(
          assignment.tenantId,
          pbxTrunkId,
          e164,
          assignment.destinationType,
          destinationId,
        );
        await this.provisioningService.ensureOutboundRoutesPublic(
          assignment.tenantId,
          pbxTrunkId,
          e164,
          assignment.outboundCallerIdPolicy,
        );
      }

      await this.upsertTenantPhoneNumber(assignment.tenantId, {
        e164,
        providerSid: phoneNumberSid,
        trunkId: pbxTrunkId,
        friendlyName: owned.friendlyName,
        capabilities: owned.capabilities ?? {},
        status: assignment.destinationType === 'reserve_only' ? 'reserved' : 'active',
        outboundCallerIdPolicy: assignment.outboundCallerIdPolicy,
      });

      await this.telephonyService.provisionGlobalConfiguration(actor, assignment.tenantId);

      await this.recordAudit(actor, assignment.tenantId, 'twilio.number.assigned', {
        e164,
        twilioNumberSid: phoneNumberSid,
        destinationType: assignment.destinationType,
        outboundCallerIdPolicy: assignment.outboundCallerIdPolicy,
      });

      const rows = await this.listTenantPhoneNumbers(assignment.tenantId);
      const row = rows.find((r) => r.e164 === e164);
      if (!row) throw validationError({ phoneNumber: 'Assignment completed but phone number row missing' });
      return row;
    } catch (error) {
      await this.updatePhoneNumberStatus(assignment.tenantId, e164, 'attached_route_pending', {
        providerSid: phoneNumberSid,
      });
      throw error;
    }
  }

  async purchaseAndAssign(
    actor: AuthenticatedUser,
    input: TwilioPurchaseAndAssign,
  ): Promise<TenantPhoneNumberRow> {
    this.assertTwilioConfigured();
    const e164 = assertIsraeliE164(input.e164);

    const purchased = await this.purchaseNumber(actor, {
      e164,
      ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
    });

    try {
      await this.attachToTrunk(actor, purchased.sid, input.tenantId);
    } catch (error) {
      await this.upsertTenantPhoneNumber(input.tenantId, {
        e164,
        providerSid: purchased.sid,
        status: 'owned_not_attached',
        capabilities: {},
        outboundCallerIdPolicy: input.outboundCallerIdPolicy,
      });
      throw error;
    }

    return this.assignNumberToTenant(actor, purchased.sid, {
      tenantId: input.tenantId,
      destinationType: input.destinationType,
      outboundCallerIdPolicy: input.outboundCallerIdPolicy,
      ...(input.destinationExtensionNumber
        ? { destinationExtensionNumber: input.destinationExtensionNumber }
        : {}),
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    });
  }

  private async resolveDestination(assignment: NumberAssignmentInput): Promise<string | null> {
    if (assignment.destinationType === 'reserve_only') return null;

    return withBypassRls(this.database.db, async (db) => {
      if (assignment.destinationType === 'extension') {
        const extNum = assignment.destinationExtensionNumber;
        if (!extNum) {
          throw validationError({ destination: 'Extension number is required for extension routing' });
        }
        const [ext] = await db
          .select()
          .from(extensions)
          .where(
            and(
              eq(extensions.tenantId, assignment.tenantId),
              eq(extensions.extensionNumber, extNum),
            ),
          )
          .limit(1);
        if (!ext) throw validationError({ extension: `Extension ${extNum} not found` });
        return ext.id;
      }

      if (assignment.destinationType === 'ai_agent') {
        const destinationId = assignment.destinationId;
        if (!destinationId) {
          throw validationError({ destination: 'AI agent id is required' });
        }
        return destinationId;
      }

      if (assignment.destinationType === 'voicemail') {
        const extNum = assignment.destinationExtensionNumber;
        if (!extNum) {
          throw validationError({ destination: 'Extension number is required for voicemail routing' });
        }
        const [ext] = await db
          .select()
          .from(extensions)
          .where(
            and(
              eq(extensions.tenantId, assignment.tenantId),
              eq(extensions.extensionNumber, extNum),
            ),
          )
          .limit(1);
        if (!ext) throw validationError({ extension: `Extension ${extNum} not found` });
        return ext.id;
      }

      throw validationError({ destination: `Unsupported destination type ${assignment.destinationType}` });
    });
  }

  private async upsertTenantPhoneNumber(
    tenantId: string,
    input: {
      e164: string;
      providerSid?: string;
      trunkId?: string;
      friendlyName?: string | null;
      capabilities?: Record<string, unknown>;
      status: string;
      outboundCallerIdPolicy: TwilioOutboundCallerIdPolicy;
      inboundRouteId?: string;
    },
  ): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.e164, input.e164))
        .limit(1);

      const values = {
        tenantId,
        e164: input.e164,
        friendlyName: input.friendlyName ?? null,
        provider: 'twilio',
        providerSid: input.providerSid ?? null,
        status: input.status,
        capabilities: input.capabilities ?? {},
        outboundCallerIdPolicy: { mode: input.outboundCallerIdPolicy },
        trunkId: input.trunkId ?? null,
        inboundRouteId: input.inboundRouteId ?? null,
        isActive: input.status === 'active' || input.status === 'reserved',
        updatedAt: new Date(),
      };

      if (!existing) {
        await db.insert(phoneNumbers).values(values);
        return;
      }
      if (existing.tenantId !== tenantId) {
        throw validationError({ e164: 'Phone number already assigned to another tenant' });
      }
      await db.update(phoneNumbers).set(values).where(eq(phoneNumbers.id, existing.id));
    });
  }

  private async updatePhoneNumberStatus(
    tenantId: string,
    e164: string,
    status: string,
    extra: { providerSid?: string } = {},
  ): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.tenantId, tenantId), eq(phoneNumbers.e164, e164)))
        .limit(1);
      if (!existing) {
        await db.insert(phoneNumbers).values({
          tenantId,
          e164,
          provider: 'twilio',
          providerSid: extra.providerSid ?? null,
          status,
          isActive: false,
        });
        return;
      }
      await db
        .update(phoneNumbers)
        .set({
          status,
          ...(extra.providerSid ? { providerSid: extra.providerSid } : {}),
          updatedAt: new Date(),
        })
        .where(eq(phoneNumbers.id, existing.id));
    });
  }

  private async recordAudit(
    actor: AuthenticatedUser,
    tenantId: string | null,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await withBypassRls(this.database.db, async (db) => {
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action,
        resourceType: 'phone_number',
        resourceId: null,
        metadata,
      });
    });
  }
}
