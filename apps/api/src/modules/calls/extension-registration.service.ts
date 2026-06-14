import { Inject, Injectable } from '@nestjs/common';
import type { ExtensionRegistrationBatch, ExtensionRegistrationRuntime } from '@pbx/contracts';
import { notFound, tenantAccessDenied } from '@pbx/contracts';
import { and, eq } from 'drizzle-orm';
import { extensions, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  countEndpointContacts,
  mapAriEndpointToRegistrationStatus,
  type AriEndpointSnapshot,
} from './registration-status.js';

@Injectable()
export class ExtensionRegistrationService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async getBatchRegistrationStatus(
    actor: AuthenticatedUser,
    tenantId: string,
  ): Promise<ExtensionRegistrationBatch> {
    await this.assertTenantAccess(actor, tenantId);
    const observedAt = new Date().toISOString();

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({
          id: extensions.id,
          extensionNumber: extensions.extensionNumber,
          asteriskEndpointId: extensions.asteriskEndpointId,
        })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));

      const { reachable, endpoints } = await this.fetchAriPjsipEndpoints();
      const items: ExtensionRegistrationRuntime[] = rows.map((row) => {
        const snapshot = endpoints.get(row.asteriskEndpointId);
        return {
          extensionId: row.id,
          extensionNumber: row.extensionNumber,
          registrationStatus: mapAriEndpointToRegistrationStatus(snapshot, reachable),
          endpointState: snapshot?.state ?? null,
          contactCount: countEndpointContacts(snapshot),
          lastObservedAt: observedAt,
        };
      });

      return {
        items,
        observedAt,
        asteriskReachable: reachable,
      };
    });
  }

  async getRegistrationStatusForExtension(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
  ): Promise<ExtensionRegistrationRuntime & { asteriskReachable: boolean }> {
    await this.assertTenantAccess(actor, tenantId);
    const observedAt = new Date().toISOString();

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [ext] = await db
        .select({
          id: extensions.id,
          extensionNumber: extensions.extensionNumber,
          asteriskEndpointId: extensions.asteriskEndpointId,
        })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);
      if (!ext) {
        throw notFound('Extension');
      }

      const { reachable, endpoints } = await this.fetchAriPjsipEndpoints();
      const snapshot = endpoints.get(ext.asteriskEndpointId);
      return {
        extensionId: ext.id,
        extensionNumber: ext.extensionNumber,
        registrationStatus: mapAriEndpointToRegistrationStatus(snapshot, reachable),
        endpointState: snapshot?.state ?? null,
        contactCount: countEndpointContacts(snapshot),
        lastObservedAt: observedAt,
        asteriskReachable: reachable,
      };
    });
  }

  private async fetchAriPjsipEndpoints(): Promise<{
    reachable: boolean;
    endpoints: Map<string, AriEndpointSnapshot>;
  }> {
    const endpoints = new Map<string, AriEndpointSnapshot>();
    if (!this.config.telephonyEnabled || !this.config.asteriskAriUrl || !this.config.asteriskAriPassword) {
      return { reachable: false, endpoints };
    }
    try {
      const base = this.config.asteriskAriUrl.replace(/\/$/, '');
      const auth = Buffer.from(
        `${this.config.asteriskAriUsername}:${this.config.asteriskAriPassword}`,
      ).toString('base64');
      const res = await fetch(`${base}/endpoints`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        return { reachable: false, endpoints };
      }
      const body = (await res.json()) as Array<{
        technology?: string;
        resource?: string;
        state?: string;
        channel_ids?: string[];
      }>;
      for (const item of body) {
        if (item.technology !== 'PJSIP' || !item.resource) {
          continue;
        }
        const snapshot: AriEndpointSnapshot = { resource: item.resource };
        if (item.state !== undefined) {
          snapshot.state = item.state;
        }
        if (item.channel_ids !== undefined) {
          snapshot.channel_ids = item.channel_ids;
        }
        endpoints.set(item.resource, snapshot);
      }
      return { reachable: true, endpoints };
    } catch {
      return { reachable: false, endpoints };
    }
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
