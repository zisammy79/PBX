import { Inject, Injectable } from '@nestjs/common';
import { notFound, validationError, type TwilioPhoneProvisioningStatus } from '@pbx/contracts';
import { encryptSecret, tenantTrunkId } from '@pbx/shared';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  inboundRoutes,
  outboundRoutes,
  phoneNumbers,
  sipTrunkEndpoints,
  sipTrunks,
  tenantSettings,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { isTwilioConfigured } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import { assertIsraeliE164, parseTerminationHost } from './twilio-israel.js';
import { TwilioService } from './twilio.service.js';

const PROVISIONING_SETTINGS_KEY = 'twilio.phone_provisioning';
const TWILIO_TRUNK_SLUG = 'twilio-production';

export type PhoneProvisioningRecord = {
  status: TwilioPhoneProvisioningStatus;
  e164?: string;
  twilioNumberSid?: string;
  trunkSid?: string;
  tenantId: string;
  failureReason?: string;
  updatedAt: string;
};

@Injectable()
export class TwilioProvisioningService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TwilioService) private readonly twilioService: TwilioService,
    @Inject(TelephonyService) private readonly telephonyService: TelephonyService,
  ) {}

  async getProvisioningState(tenantId: string): Promise<PhoneProvisioningRecord | null> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, PROVISIONING_SETTINGS_KEY)))
        .limit(1);
      if (!row) return null;
      return row.value as PhoneProvisioningRecord;
    });
  }

  async provisionPhoneNumberForTenant(
    actor: AuthenticatedUser,
    tenantId: string,
    options: { inboundDestinationExtensionNumber?: string; force?: boolean; e164?: string } = {},
  ): Promise<PhoneProvisioningRecord> {
    if (!isTwilioConfigured(this.config)) {
      throw validationError({ twilio: 'Twilio is not configured on this platform' });
    }

    const existingNumber = await withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, tenantId)).limit(1);
      return row ?? null;
    });

    if (existingNumber && !options.force) {
      const state = await this.saveProvisioningState(tenantId, {
        status: 'ready_for_sip_test',
        e164: existingNumber.e164,
        tenantId,
        ...(this.config.twilioTrunkSid ? { trunkSid: this.config.twilioTrunkSid } : {}),
        updatedAt: new Date().toISOString(),
      });
      return state;
    }

    await this.updateProvisioningStatus(tenantId, 'pending_number_assignment');

    try {
      await this.twilioService.syncTrunk();
      await this.updateProvisioningStatus(tenantId, 'trunk_configured');

      const e164 = options.e164
        ? assertIsraeliE164(options.e164)
        : await this.resolveNumberToAssign(tenantId);
      const twilioNumber = await this.twilioService.findNumberByE164(e164);
      if (!twilioNumber) {
        throw validationError({ twilio: `Number ${e164} is not owned by this Twilio account` });
      }

      await this.twilioService.attachNumberToTrunk(twilioNumber.sid);
      await this.updateProvisioningStatus(tenantId, 'number_assigned', { e164, twilioNumberSid: twilioNumber.sid });

      const pbxTrunkId = await this.ensurePbxTwilioTrunk(actor, tenantId, e164);
      const destinationExtensionId = await this.resolveDestinationExtension(tenantId, options.inboundDestinationExtensionNumber);
      await this.ensureInboundRoute(tenantId, pbxTrunkId, e164, 'extension', destinationExtensionId);
      await this.ensureOutboundRoutes(tenantId, pbxTrunkId, e164);
      await this.activateTrunk(tenantId, pbxTrunkId);

      await withBypassRls(this.database.db, async (db) => {
        await db.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'twilio.number.provisioned',
          resourceType: 'phone_number',
          resourceId: pbxTrunkId,
          metadata: {
            e164,
            twilioNumberSid: twilioNumber.sid,
            twilioTrunkSid: this.config.twilioTrunkSid,
            pbxTrunkId,
          },
        });
      });

      await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);

      return this.saveProvisioningState(tenantId, {
        status: 'ready_for_sip_test',
        e164,
        twilioNumberSid: twilioNumber.sid,
        ...(this.config.twilioTrunkSid ? { trunkSid: this.config.twilioTrunkSid } : {}),
        tenantId,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Twilio phone provisioning failed';
      await this.saveProvisioningState(tenantId, {
        status: 'number_assignment_failed',
        tenantId,
        failureReason: message,
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  async assignExistingNumber(
    actor: AuthenticatedUser,
    tenantId: string,
    e164?: string,
    inboundDestinationExtensionNumber?: string,
  ) {
    const target = assertIsraeliE164(e164 ?? this.config.twilioTestDid ?? '');
    return this.provisionPhoneNumberForTenant(actor, tenantId, {
      e164: target,
      ...(inboundDestinationExtensionNumber ? { inboundDestinationExtensionNumber } : {}),
      force: false,
    });
  }

  async purchaseAndAssign(
    actor: AuthenticatedUser,
    tenantId: string,
    inboundDestinationExtensionNumber?: string,
  ) {
    const existing = await withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, tenantId)).limit(1);
      return row ?? null;
    });
    if (existing) {
      return this.provisionPhoneNumberForTenant(actor, tenantId, {
        ...(inboundDestinationExtensionNumber ? { inboundDestinationExtensionNumber } : {}),
      });
    }

    const purchased = await this.twilioService.purchaseIsraeliLocalNumber();
    await withBypassRls(this.database.db, async (db) => {
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'twilio.number.purchased',
        resourceType: 'phone_number',
        resourceId: null,
        metadata: { e164: purchased.e164, twilioNumberSid: purchased.sid, twilioTrunkSid: this.config.twilioTrunkSid },
      });
    });

    return this.provisionPhoneNumberForTenant(actor, tenantId, {
      e164: purchased.e164,
      ...(inboundDestinationExtensionNumber ? { inboundDestinationExtensionNumber } : {}),
      force: true,
    });
  }

  private async resolveNumberToAssign(tenantId: string): Promise<string> {
    const cfg = this.twilioService.twilioConfig();
    const mode = cfg.numberAssignmentMode;

    const existing = await withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, tenantId)).limit(1);
      return row?.e164 ?? null;
    });
    if (existing) return assertIsraeliE164(existing);

    if ((mode === 'manual' || mode === 'manual_or_auto') && cfg.testDid) {
      return assertIsraeliE164(cfg.testDid);
    }

    if (mode === 'auto' || mode === 'manual_or_auto') {
      const purchased = await this.twilioService.purchaseIsraeliLocalNumber();
      return assertIsraeliE164(purchased.e164);
    }

    throw validationError({ twilio: 'No phone number available for assignment; configure TWILIO_TEST_DID or enable auto mode' });
  }

  async syncTrunkOnly(): Promise<void> {
    await this.twilioService.syncTrunk();
  }

  async ensurePbxTwilioTrunkPublic(
    actor: AuthenticatedUser,
    tenantId: string,
    e164: string,
    outboundCallerIdPolicy: 'tenant_default' | 'extension_only' | 'inbound_only' = 'tenant_default',
  ): Promise<string> {
    const trunkId = await this.ensurePbxTwilioTrunk(actor, tenantId, e164);
    if (outboundCallerIdPolicy !== 'inbound_only') {
      await this.ensureOutboundRoutes(tenantId, trunkId, e164);
    }
    await this.activateTrunk(tenantId, trunkId);
    return trunkId;
  }

  async ensureInboundRoutePublic(
    tenantId: string,
    trunkId: string,
    e164: string,
    destinationType: string,
    destinationId: string | null,
  ): Promise<string | undefined> {
    if (destinationType === 'reserve_only' || !destinationId) return undefined;
    return this.ensureInboundRoute(tenantId, trunkId, e164, destinationType, destinationId);
  }

  async ensureOutboundRoutesPublic(
    tenantId: string,
    trunkId: string,
    callerId: string,
    policy: 'tenant_default' | 'extension_only' | 'inbound_only',
  ): Promise<void> {
    if (policy === 'inbound_only') return;
    await this.ensureOutboundRoutes(tenantId, trunkId, callerId);
  }

  private async ensurePbxTwilioTrunk(actor: AuthenticatedUser, tenantId: string, e164: string): Promise<string> {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');

      const cfg = this.twilioService.twilioConfig();
      const trunkStatus = await this.twilioService.getTrunkStatus();
      const terminationSipUri = trunkStatus.terminationSipUri ?? cfg.terminationSipUri;
      const { host, port } = parseTerminationHost(terminationSipUri);
      const credentialsEncrypted =
        cfg.sipUsername && cfg.sipPassword
          ? encryptSecret(
              JSON.stringify({ username: cfg.sipUsername, password: cfg.sipPassword }),
              this.config.encryptionMasterKey,
            )
          : null;
      const trunkValues = {
        name: 'Twilio Production',
        providerAdapter: 'twilio',
        authMode: 'ip' as const,
        transport: 'udp' as const,
        isActive: true,
        credentialsEncrypted,
        config: {
          allowedCodecs: ['alaw', 'ulaw'],
          dtmfMode: 'rfc4733',
          assignedDid: e164,
          allowedCallerId: e164,
          allowedDestinationCountries: ['IL'],
          providerName: 'Twilio Elastic SIP Trunk',
          twilioTrunkSid: cfg.trunkSid,
          terminationSipUri,
        },
        updatedAt: new Date(),
      };

      const [existing] = await db
        .select()
        .from(sipTrunks)
        .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.slug, TWILIO_TRUNK_SLUG)))
        .limit(1);

      if (existing) {
        await db
          .update(sipTrunks)
          .set(trunkValues)
          .where(eq(sipTrunks.id, existing.id));

        const [endpoint] = await db
          .select()
          .from(sipTrunkEndpoints)
          .where(eq(sipTrunkEndpoints.trunkId, existing.id))
          .limit(1);
        if (!endpoint) {
          await db.insert(sipTrunkEndpoints).values({ tenantId, trunkId: existing.id, host, port });
        } else {
          await db
            .update(sipTrunkEndpoints)
            .set({ host, port, isActive: true })
            .where(eq(sipTrunkEndpoints.id, endpoint.id));
        }
        return existing.id;
      }

      const asteriskTrunkId = tenantTrunkId(tenant.slug, TWILIO_TRUNK_SLUG);
      const [row] = await db
        .insert(sipTrunks)
        .values({
          tenantId,
          slug: TWILIO_TRUNK_SLUG,
          asteriskTrunkId,
          ...trunkValues,
        })
        .returning();

      await db.insert(sipTrunkEndpoints).values({ tenantId, trunkId: row!.id, host, port });
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'pstn.trunk.created',
        resourceType: 'sip_trunk',
        resourceId: row!.id,
        metadata: { slug: TWILIO_TRUNK_SLUG, provider: 'twilio' },
      });
      return row!.id;
    });
  }

  private async ensureInboundRoute(
    tenantId: string,
    trunkId: string,
    e164: string,
    destinationType: string,
    destinationId: string,
  ): Promise<string> {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existingRoute] = await db
        .select()
        .from(inboundRoutes)
        .where(and(eq(inboundRoutes.tenantId, tenantId), eq(inboundRoutes.didPattern, e164)))
        .limit(1);

      let routeId = existingRoute?.id;
      if (!existingRoute) {
        const [route] = await db
          .insert(inboundRoutes)
          .values({
            tenantId,
            name: `Inbound ${e164}`,
            didPattern: e164,
            destinationType,
            destinationId,
          })
          .returning();
        routeId = route!.id;
      } else {
        await db
          .update(inboundRoutes)
          .set({ destinationType, destinationId, updatedAt: new Date() })
          .where(eq(inboundRoutes.id, existingRoute.id));
      }

      const [existingNumber] = await db
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.e164, e164))
        .limit(1);

      if (!existingNumber) {
        await db.insert(phoneNumbers).values({
          tenantId,
          e164,
          friendlyName: 'Twilio DID',
          provider: 'twilio',
          trunkId,
          inboundRouteId: routeId,
          isActive: true,
          status: 'active',
        });
      } else if (existingNumber.tenantId !== tenantId) {
        throw validationError({ e164: 'Phone number already assigned to another tenant' });
      } else {
        await db
          .update(phoneNumbers)
          .set({ trunkId, inboundRouteId: routeId, isActive: true, status: 'active', updatedAt: new Date() })
          .where(eq(phoneNumbers.id, existingNumber.id));
      }

      return routeId!;
    });
  }

  private async ensureOutboundRoutes(tenantId: string, trunkId: string, callerId: string): Promise<void> {
    const patterns = [
      { name: 'Israel mobile', pattern: '^05\\d{8}$', normalizePrefix: '+972' },
      { name: 'Israel landline', pattern: '^0[2-9]\\d{7,8}$', normalizePrefix: '+972' },
      { name: 'Israel E164', pattern: '^\\+972[2-9]\\d{7,8}$' },
    ];

    await withTenantContext(this.database.db, tenantId, async (db) => {
      for (const row of patterns) {
        const [existing] = await db
          .select()
          .from(outboundRoutes)
          .where(and(eq(outboundRoutes.tenantId, tenantId), eq(outboundRoutes.pattern, row.pattern)))
          .limit(1);
        if (existing) continue;
        await db.insert(outboundRoutes).values({
          tenantId,
          name: row.name,
          pattern: row.pattern,
          trunkId,
          callerIdPolicy: { callerId, normalizePrefix: row.normalizePrefix },
          isActive: true,
        });
      }
    });
  }

  private async activateTrunk(tenantId: string, trunkId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      await db.update(sipTrunks).set({ isActive: true, updatedAt: new Date() }).where(eq(sipTrunks.id, trunkId));
    });
  }

  private async resolveDestinationExtension(tenantId: string, preferred?: string): Promise<string> {
    return withBypassRls(this.database.db, async (db) => {
      if (preferred) {
        const [ext] = await db
          .select()
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenantId), eq(extensions.extensionNumber, preferred)))
          .limit(1);
        if (!ext) throw validationError({ extension: `Extension ${preferred} not found` });
        return ext.id;
      }

      const [ext] = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')))
        .limit(1);
      if (!ext) throw validationError({ extension: 'Tenant has no active extension for inbound routing' });
      return ext.id;
    });
  }

  private async updateProvisioningStatus(
    tenantId: string,
    status: TwilioPhoneProvisioningStatus,
    extra: Partial<PhoneProvisioningRecord> = {},
  ): Promise<void> {
    await this.saveProvisioningState(tenantId, {
      status,
      tenantId,
      updatedAt: new Date().toISOString(),
      ...(this.config.twilioTrunkSid ? { trunkSid: this.config.twilioTrunkSid } : {}),
      ...extra,
    });
  }

  private async saveProvisioningState(tenantId: string, value: PhoneProvisioningRecord): Promise<PhoneProvisioningRecord> {
    await withBypassRls(this.database.db, async (db) => {
      const [existing] = await db
        .select()
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, PROVISIONING_SETTINGS_KEY)))
        .limit(1);

      if (existing) {
        await db
          .update(tenantSettings)
          .set({ value, updatedAt: new Date() })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await db.insert(tenantSettings).values({
          tenantId,
          key: PROVISIONING_SETTINGS_KEY,
          value,
        });
      }
    });
    return value;
  }
}
