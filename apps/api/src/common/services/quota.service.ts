import { Inject, Injectable } from '@nestjs/common';
import { quotaExceeded } from '@pbx/contracts';
import { and, count, eq, isNull } from 'drizzle-orm';
import { apiApplications, apiKeys, webhookEndpoints, withTenantContext } from '@pbx/database';
import { DATABASE } from '../tokens.js';

const DEFAULT_MAX_API_KEYS = 25;
const DEFAULT_MAX_WEBHOOKS = 10;

@Injectable()
export class QuotaService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async assertCanCreateApiKey(tenantId: string, applicationId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ total: count() })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.tenantId, tenantId),
            eq(apiKeys.applicationId, applicationId),
            isNull(apiKeys.revokedAt),
          ),
        );
      if (Number(row?.total ?? 0) >= DEFAULT_MAX_API_KEYS) {
        throw quotaExceeded('active_api_keys');
      }
    });
  }

  async assertCanCreateWebhook(tenantId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ total: count() })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.tenantId, tenantId));
      if (Number(row?.total ?? 0) >= DEFAULT_MAX_WEBHOOKS) {
        throw quotaExceeded('webhook_endpoints');
      }
    });
  }

  async assertCanCreateApplication(tenantId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ total: count() })
        .from(apiApplications)
        .where(eq(apiApplications.tenantId, tenantId));
      if (Number(row?.total ?? 0) >= 20) {
        throw quotaExceeded('api_applications');
      }
    });
  }
}
