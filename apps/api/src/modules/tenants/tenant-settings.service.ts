import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_TENANT_CALLS_FEATURES,
  DEFAULT_TENANT_PHONE_NUMBERS_FEATURES,
  Permission,
  tenantAccessDenied,
  type TenantCallsFeatureSettings,
  type TenantFeatureSettings,
  type TenantPhoneNumbersFeatureSettings,
  type UpdateTenantFeatureSettings,
} from '@pbx/contracts';
import { hasAnyPermission, resolveEffectivePermissions } from '@pbx/contracts';
import { and, eq } from 'drizzle-orm';
import { auditEvents, tenantSettings, withTenantContext } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import { resolveAuditActor } from '../../common/audit-actor.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const TELEPHONY_RECORDING_KEY = 'telephony.recording';
const PHONE_NUMBERS_FEATURES_KEY = 'features.phoneNumbers';
const CALLS_FEATURES_KEY = 'features.calls';

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async getSettings(actor: AuthenticatedUser, tenantId: string): Promise<TenantFeatureSettings> {
    await this.assertManage(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => this.readAllSettings(db, tenantId));
  }

  async updateSettings(
    actor: AuthenticatedUser,
    tenantId: string,
    input: UpdateTenantFeatureSettings,
  ): Promise<TenantFeatureSettings> {
    await this.assertManage(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      if (input.telephony?.recording) {
        const current = await this.readRecordingSettings(db, tenantId);
        await this.upsertSetting(db, tenantId, TELEPHONY_RECORDING_KEY, {
          ...current,
          ...input.telephony.recording,
        });
      }
      if (input.phoneNumbers) {
        const current = await this.readPhoneNumbersFeatures(db, tenantId);
        await this.upsertSetting(db, tenantId, PHONE_NUMBERS_FEATURES_KEY, {
          ...current,
          ...input.phoneNumbers,
        });
      }
      if (input.calls) {
        const current = await this.readCallsFeatures(db, tenantId);
        await this.upsertSetting(db, tenantId, CALLS_FEATURES_KEY, {
          ...current,
          ...input.calls,
        });
      }

      const updated = await this.readAllSettings(db, tenantId);
      const auditActor = resolveAuditActor(actor);
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: auditActor.actorUserId,
        actorType: auditActor.actorType,
        action: 'tenant.settings.updated',
        resourceType: 'tenant_settings',
        metadata: {
          sections: Object.keys(input),
          ...auditActor.actorMetadata,
        },
      });
      return updated;
    });
  }

  private async readAllSettings(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<TenantFeatureSettings> {
    const recording = await this.readRecordingSettings(db, tenantId);
    const phoneNumbers = await this.readPhoneNumbersFeatures(db, tenantId);
    const calls = await this.readCallsFeatures(db, tenantId);
    return {
      telephony: { recording },
      phoneNumbers,
      calls,
    };
  }

  private async readRecordingSettings(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<{ recordCallsByDefault: boolean }> {
    const row = await this.readSettingRow(db, tenantId, TELEPHONY_RECORDING_KEY);
    const value = (row?.value ?? {}) as { recordCallsByDefault?: boolean };
    return { recordCallsByDefault: value.recordCallsByDefault ?? false };
  }

  private async readPhoneNumbersFeatures(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<TenantPhoneNumbersFeatureSettings> {
    const row = await this.readSettingRow(db, tenantId, PHONE_NUMBERS_FEATURES_KEY);
    const value = (row?.value ?? {}) as Partial<TenantPhoneNumbersFeatureSettings>;
    return {
      ...DEFAULT_TENANT_PHONE_NUMBERS_FEATURES,
      ...value,
      allowedRoutingTargets:
        value.allowedRoutingTargets ?? DEFAULT_TENANT_PHONE_NUMBERS_FEATURES.allowedRoutingTargets,
    };
  }

  private async readCallsFeatures(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<TenantCallsFeatureSettings> {
    const row = await this.readSettingRow(db, tenantId, CALLS_FEATURES_KEY);
    const value = (row?.value ?? {}) as Partial<TenantCallsFeatureSettings>;
    return {
      ...DEFAULT_TENANT_CALLS_FEATURES,
      ...value,
    };
  }

  private async readSettingRow(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    key: string,
  ) {
    const [row] = await db
      .select()
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
      .limit(1);
    return row;
  }

  private async upsertSetting(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    key: string,
    value: Record<string, unknown>,
  ) {
    await db
      .insert(tenantSettings)
      .values({ tenantId, key, value })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value, updatedAt: new Date() },
      });
  }

  private async assertManage(actor: AuthenticatedUser, tenantId: string) {
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
      !hasAnyPermission(permissions, [
        Permission.TENANT_UPDATE,
        Permission.PLATFORM_TENANT_UPDATE,
      ])
    ) {
      throw tenantAccessDenied();
    }
  }
}
