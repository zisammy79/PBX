import { Inject, Injectable } from '@nestjs/common';
import {
  notFound,
  RequestTenantSipDomainSchema,
  tenantAccessDenied,
  validationError,
  type RequestTenantSipDomainRequest,
  type TenantSipDomainSummary,
} from '@pbx/contracts';
import { generateSecureToken, sha256Hex } from '@pbx/shared';
import { promises as dns } from 'node:dns';
import { and, eq } from 'drizzle-orm';
import { auditEvents, tenantSipDomains, tenants, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const CHALLENGE_PREFIX = 'pbx-domain-verify=';

@Injectable()
export class SipDomainsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async getDomainSummary(actor: AuthenticatedUser, tenantId: string): Promise<TenantSipDomainSummary | null> {
    await this.assertAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSipDomains)
        .where(eq(tenantSipDomains.tenantId, tenantId))
        .limit(1);

      if (!row) {
        return null;
      }

      return this.toSummary(row);
    });
  }

  async requestDomain(
    actor: AuthenticatedUser,
    tenantId: string,
    input: RequestTenantSipDomainRequest,
  ): Promise<TenantSipDomainSummary> {
    await this.assertAccess(actor, tenantId, true);
    const parsed = RequestTenantSipDomainSchema.parse(input);
    const normalized = parsed.domain.toLowerCase().trim();
    const token = generateSecureToken(24);
    const tokenHash = sha256Hex(token);

    const row = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(tenantSipDomains)
        .where(eq(tenantSipDomains.domain, normalized))
        .limit(1);

      if (existing && existing.tenantId !== tenantId) {
        throw validationError({ domain: 'Domain already assigned to another tenant' });
      }

      const values = {
        tenantId,
        domain: normalized,
        mode: parsed.mode,
        validationStatus: 'pending',
        activationStatus: 'inactive',
        verificationTokenHash: tokenHash,
        dnsValidationToken: `${CHALLENGE_PREFIX}${token}`,
        updatedAt: new Date(),
      };

      const [saved] = existing
        ? await db.update(tenantSipDomains).set(values).where(eq(tenantSipDomains.id, existing.id)).returning()
        : await db.insert(tenantSipDomains).values(values).returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'sip_domain.requested',
        resourceType: 'tenant_sip_domain',
        resourceId: saved!.id,
        metadata: { domain: normalized },
      });

      return saved!;
    });

    return this.toSummary(row);
  }

  async validateDomain(actor: AuthenticatedUser, tenantId: string): Promise<TenantSipDomainSummary> {
    await this.assertAccess(actor, tenantId, true);

    const updated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSipDomains)
        .where(eq(tenantSipDomains.tenantId, tenantId))
        .limit(1);

      if (!row) throw notFound('SIP domain');

      await db
        .update(tenantSipDomains)
        .set({ validationStatus: 'validating', lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantSipDomains.id, row.id));

      let verified = false;
      let failureReason: string | null = null;
      try {
        const records = await dns.resolveTxt(`_pbx.${row.domain}`);
        const flat = records.map((r) => r.join('')).join('');
        const expected = row.dnsValidationToken ?? '';
        verified = flat.includes(expected);
        if (!verified) {
          failureReason = 'TXT challenge not found or mismatch';
        }
      } catch (err) {
        failureReason = err instanceof Error ? err.message : 'DNS lookup failed';
      }

      const [next] = await db
        .update(tenantSipDomains)
        .set({
          validationStatus: verified ? 'verified' : 'failed',
          validatedAt: verified ? new Date() : null,
          failureReason,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantSipDomains.id, row.id))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: verified ? 'sip_domain.verified' : 'sip_domain.validation_failed',
        resourceType: 'tenant_sip_domain',
        resourceId: row.id,
        metadata: { domain: row.domain, verified, failureReason },
      });

      return next!;
    });

    return this.toSummary(updated);
  }

  async activateDomain(actor: AuthenticatedUser, tenantId: string): Promise<TenantSipDomainSummary> {
    await this.assertAccess(actor, tenantId, true);

    const updated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSipDomains)
        .where(eq(tenantSipDomains.tenantId, tenantId))
        .limit(1);

      if (!row) throw notFound('SIP domain');
      if (row.validationStatus !== 'verified') {
        throw validationError({ domain: 'Domain must be verified before activation' });
      }

      const [next] = await db
        .update(tenantSipDomains)
        .set({
          activationStatus: 'active',
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantSipDomains.id, row.id))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'sip_domain.activated',
        resourceType: 'tenant_sip_domain',
        resourceId: row.id,
        metadata: { domain: row.domain },
      });

      return next!;
    });

    return this.toSummary(updated);
  }

  async disableDomain(actor: AuthenticatedUser, tenantId: string): Promise<TenantSipDomainSummary | null> {
    await this.assertAccess(actor, tenantId, true);

    const updated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantSipDomains)
        .where(eq(tenantSipDomains.tenantId, tenantId))
        .limit(1);

      if (!row) return null;

      const [next] = await db
        .update(tenantSipDomains)
        .set({
          activationStatus: 'disabled',
          validationStatus: 'disabled',
          updatedAt: new Date(),
        })
        .where(eq(tenantSipDomains.id, row.id))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'sip_domain.disabled',
        resourceType: 'tenant_sip_domain',
        resourceId: row.id,
        metadata: { domain: row.domain },
      });

      return next!;
    });

    return updated ? this.toSummary(updated) : null;
  }

  private toSummary(row: typeof tenantSipDomains.$inferSelect): TenantSipDomainSummary {
    return {
      id: row.id,
      domain: row.domain,
      mode: (row.mode as TenantSipDomainSummary['mode']) ?? 'tenant_domain',
      validationStatus: row.validationStatus as TenantSipDomainSummary['validationStatus'],
      activationStatus: row.activationStatus as TenantSipDomainSummary['activationStatus'],
      sharedDomainFallback: row.activationStatus !== 'active',
      dnsInstructions: row.dnsValidationToken
        ? {
            recordType: 'TXT' as const,
            host: `_pbx.${row.domain}`,
            value: row.dnsValidationToken,
          }
        : null,
      validatedAt: row.validatedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      failureReason: row.failureReason ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async assertAccess(actor: AuthenticatedUser, tenantId: string, mutate = false) {
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const membership = actor.tenantMemberships.find((m) => m.tenantId === tenantId);
    const roles = membership?.roles ?? [];
    const canView = isPlatform || roles.some((r) => ['tenant_owner', 'tenant_administrator'].includes(r));
    const canMutate = canView;
    if (mutate && !canMutate) throw tenantAccessDenied();
    if (!mutate && !canView && !isPlatform) throw tenantAccessDenied();
  }
}
