import { Inject, Injectable } from '@nestjs/common';
import { tenantAccessDenied, type TenantTelephonySettings } from '@pbx/contracts';
import { Permission } from '@pbx/contracts';
import { eq } from 'drizzle-orm';
import { tenantSettings, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { hasAnyPermission, resolveEffectivePermissions } from '@pbx/contracts';

const TELEPHONY_RECORDING_KEY = 'telephony.recording';

@Injectable()
export class TenantTelephonySettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async getSettings(actor: AuthenticatedUser, tenantId: string): Promise<TenantTelephonySettings> {
    await this.assertManage(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => this.readSettings(db, tenantId));
  }

  async updateSettings(
    actor: AuthenticatedUser,
    tenantId: string,
    input: TenantTelephonySettings,
  ): Promise<TenantTelephonySettings> {
    await this.assertManage(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      await db
        .insert(tenantSettings)
        .values({
          tenantId,
          key: TELEPHONY_RECORDING_KEY,
          value: { recordCallsByDefault: input.recordCallsByDefault },
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: {
            value: { recordCallsByDefault: input.recordCallsByDefault },
            updatedAt: new Date(),
          },
        });
      return this.readSettings(db, tenantId);
    });
  }

  async readRecordCallsByDefault(tenantId: string): Promise<boolean> {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const settings = await this.readSettings(db, tenantId);
      return settings.recordCallsByDefault;
    });
  }

  private async readSettings(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<TenantTelephonySettings> {
    const [row] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.key, TELEPHONY_RECORDING_KEY))
      .limit(1);
    const value = (row?.value ?? {}) as { recordCallsByDefault?: boolean };
    return { recordCallsByDefault: value.recordCallsByDefault ?? false };
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
        Permission.TENANT_EXTENSION_MANAGE,
      ])
    ) {
      throw tenantAccessDenied();
    }
  }
}
