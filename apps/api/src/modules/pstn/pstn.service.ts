import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import { encryptSecret, redactObject, tenantTrunkId } from '@pbx/shared';
import { and, desc, eq } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  inboundRoutes,
  outboundRoutes,
  phoneNumbers,
  sipTrunkEndpoints,
  sipTrunks,
  tenants,
  withTenantContext,
} from '@pbx/database';
import {
  generateTrunkConfig,
  normalizeOutboundNumber,
  redactTrunkConfig,
  validateDestinationCountry,
  type TelephonyInboundRouteRecord,
  type TelephonyOutboundRouteRecord,
  type TelephonyTrunkRecord,
} from '@pbx/telephony-config';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { CreateInboundRoute, CreateOutboundRoute, CreateSipTrunk } from '@pbx/contracts';

@Injectable()
export class PstnService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async createTrunk(actor: AuthenticatedUser, tenantId: string, input: CreateSipTrunk) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');

      const asteriskTrunkId = tenantTrunkId(tenant.slug, input.slug);
      let credentialsEncrypted: string | null = null;
      if (input.credentials?.username && input.credentials?.password) {
        credentialsEncrypted = encryptSecret(
          JSON.stringify({ username: input.credentials.username, password: input.credentials.password }),
          this.config.encryptionMasterKey,
        );
      } else if (input.authMode === 'registration') {
        throw validationError({ credentials: 'username and password required for registration auth' });
      }

      const [row] = await db
        .insert(sipTrunks)
        .values({
          tenantId,
          name: input.name,
          slug: input.slug,
          authMode: input.authMode,
          transport: input.transport,
          asteriskTrunkId,
          config: input.config ?? {},
          credentialsEncrypted,
          isActive: false,
        })
        .returning();

      if (input.registrar) {
        await db.insert(sipTrunkEndpoints).values({
          tenantId,
          trunkId: row!.id,
          host: input.registrar,
          port: input.transport === 'tls' ? 5061 : 5060,
        });
      }

      await this.audit(db, tenantId, actor.id, 'pstn.trunk.created', row!.id, { slug: input.slug });
      return this.serializeTrunk(row!, tenant.slug);
    });
  }

  async listTrunks(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const rows = await db
        .select()
        .from(sipTrunks)
        .where(eq(sipTrunks.tenantId, tenantId))
        .orderBy(desc(sipTrunks.createdAt));
      return rows.map((r) => this.serializeTrunk(r, tenant?.slug ?? ''));
    });
  }

  async validateConfiguration(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    const records = await this.loadTrunkRecords(tenantId);
    const generated = generateTrunkConfig(records.trunks, records.inbound, records.outbound);
    return {
      valid: records.trunks.length >= 0,
      trunkCount: generated.trunkCount,
      checksum: generated.checksum,
      preview: redactTrunkConfig(generated),
      fraudControls: records.trunks.map((t) => ({
        trunkId: t.trunkId,
        maxConcurrentCalls: t.maxConcurrentCalls,
        maxCallDurationSeconds: t.maxCallDurationSeconds,
        spendLimitCents: t.spendLimitCents,
        allowedDestinationCountries: t.allowedDestinationCountries,
      })),
    };
  }

  async normalizeNumber(actor: AuthenticatedUser, tenantId: string, raw: string) {
    await this.assertTenantAccess(actor, tenantId);
    const normalized = normalizeOutboundNumber(raw);
    const records = await this.loadTrunkRecords(tenantId);
    const allowed = records.trunks[0]?.allowedDestinationCountries ?? ['US'];
    const check = validateDestinationCountry(normalized, allowed);
    return { normalized, ...check };
  }

  async createInboundRoute(actor: AuthenticatedUser, tenantId: string, input: CreateInboundRoute) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [trunk] = await db
        .select()
        .from(sipTrunks)
        .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.id, input.trunkId)))
        .limit(1);
      if (!trunk) throw notFound('SIP trunk');

      const [route] = await db
        .insert(inboundRoutes)
        .values({
          tenantId,
          name: input.name,
          didPattern: input.didPattern,
          destinationType: input.destinationType,
          destinationId: input.destinationId,
        })
        .returning();

      if (input.didPattern.startsWith('+')) {
        await db.insert(phoneNumbers).values({
          tenantId,
          e164: input.didPattern,
          trunkId: trunk.id,
          inboundRouteId: route!.id,
        });
      }

      return { id: route!.id, didPattern: route!.didPattern };
    });
  }

  async createOutboundRoute(actor: AuthenticatedUser, tenantId: string, input: CreateOutboundRoute) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [trunk] = await db
        .select()
        .from(sipTrunks)
        .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.id, input.trunkId)))
        .limit(1);
      if (!trunk) throw notFound('SIP trunk');

      const [route] = await db
        .insert(outboundRoutes)
        .values({
          tenantId,
          name: input.name,
          pattern: input.pattern,
          trunkId: trunk.id,
          callerIdPolicy: { callerId: input.callerId, normalizePrefix: input.normalizePrefix },
        })
        .returning();

      return { id: route!.id, pattern: route!.pattern, callerId: input.callerId };
    });
  }

  private async loadTrunkRecords(tenantId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');

      const trunkRows = await db.select().from(sipTrunks).where(eq(sipTrunks.tenantId, tenantId));
      const trunks: TelephonyTrunkRecord[] = [];
      for (const row of trunkRows) {
        const cfg = (row.config ?? {}) as Record<string, unknown>;
        let username: string | undefined;
        let password: string | undefined;
        if (row.credentialsEncrypted) {
          try {
            const { decryptSecret } = await import('@pbx/shared');
            const creds = JSON.parse(decryptSecret(row.credentialsEncrypted, this.config.encryptionMasterKey)) as {
              username?: string;
              password?: string;
            };
            username = creds.username;
            password = creds.password;
          } catch {
            // contract validation still renders config structure
          }
        }
        const endpoints = await db
          .select()
          .from(sipTrunkEndpoints)
          .where(eq(sipTrunkEndpoints.trunkId, row.id));
        const record: TelephonyTrunkRecord = {
          tenantId: row.tenantId,
          tenantSlug: tenant.slug,
          trunkId: row.id,
          name: row.name,
          slug: row.slug,
          asteriskTrunkId: row.asteriskTrunkId,
          authMode: row.authMode as 'registration' | 'ip',
          transport: row.transport as 'udp' | 'tcp' | 'tls',
          isActive: row.isActive,
          allowedCodecs: (cfg.allowedCodecs as string[]) ?? ['ulaw'],
          dtmfMode: (cfg.dtmfMode as 'rfc4733') ?? 'rfc4733',
          maxConcurrentCalls: Number(cfg.maxConcurrentCalls ?? 5),
          maxCallDurationSeconds: Number(cfg.maxCallDurationSeconds ?? 3600),
          allowedDestinationCountries: (cfg.allowedDestinationCountries as string[]) ?? ['US'],
          providerAdapter: row.providerAdapter,
        };
        if (endpoints[0]?.host) record.registrar = endpoints[0].host;
        if (username) record.username = username;
        if (password) record.password = password;
        if (typeof cfg.assignedDid === 'string') record.assignedDid = cfg.assignedDid;
        if (typeof cfg.allowedCallerId === 'string') record.allowedCallerId = cfg.allowedCallerId;
        if (typeof cfg.spendLimitCents === 'number') record.spendLimitCents = cfg.spendLimitCents;
        if (typeof cfg.failureRoute === 'string') record.failureRoute = cfg.failureRoute;
        if (Array.isArray(cfg.inboundIpCidrs)) {
          record.inboundIpCidrs = cfg.inboundIpCidrs.filter((v): v is string => typeof v === 'string');
        }
        trunks.push(record);
      }

      const inboundRows = await db
        .select()
        .from(inboundRoutes)
        .where(and(eq(inboundRoutes.tenantId, tenantId), eq(inboundRoutes.isActive, true)));
      const inbound: TelephonyInboundRouteRecord[] = [];
      const defaultTrunk = trunkRows.find((t) => t.isActive) ?? trunkRows[0];
      for (const route of inboundRows) {
        let destValue = '';
        if (route.destinationType === 'extension' && route.destinationId) {
          const [ext] = await db
            .select()
            .from(extensions)
            .where(eq(extensions.id, route.destinationId))
            .limit(1);
          destValue = ext?.extensionNumber ?? '';
        }
        inbound.push({
          tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          didPattern: route.didPattern,
          destinationType: route.destinationType as 'extension' | 'ai_agent',
          destinationValue: destValue,
          trunkAsteriskId: defaultTrunk?.asteriskTrunkId ?? `${tenant.slug}_trunk_default`,
        });
      }

      const outboundRows = await db
        .select()
        .from(outboundRoutes)
        .where(and(eq(outboundRoutes.tenantId, tenantId), eq(outboundRoutes.isActive, true)));
      const outbound: TelephonyOutboundRouteRecord[] = outboundRows.map((route) => {
        const trunk = trunkRows.find((t) => t.id === route.trunkId);
        const policy = (route.callerIdPolicy ?? {}) as Record<string, string>;
        const out: TelephonyOutboundRouteRecord = {
          tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          pattern: route.pattern,
          trunkAsteriskId: trunk?.asteriskTrunkId ?? `${tenant.slug}_trunk_default`,
          callerId: policy.callerId ?? '+10000000000',
        };
        if (policy.normalizePrefix) out.normalizePrefix = policy.normalizePrefix;
        return out;
      });

      return { trunks, inbound, outbound };
    });
  }

  private serializeTrunk(row: typeof sipTrunks.$inferSelect, tenantSlug: string) {
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantSlug,
      name: row.name,
      slug: row.slug,
      asteriskTrunkId: row.asteriskTrunkId,
      authMode: row.authMode,
      transport: row.transport,
      isActive: row.isActive,
      healthStatus: row.healthStatus,
      configured: Boolean(row.credentialsEncrypted),
      credentialsReturned: false,
      config: redactObject(cfg),
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
      resourceType: 'sip_trunk',
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
