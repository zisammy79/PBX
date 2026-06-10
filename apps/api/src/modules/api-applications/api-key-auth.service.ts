import { Inject, Injectable } from '@nestjs/common';
import { unauthorized } from '@pbx/contracts';
import {
  formatApiKey,
  generateApiKeyPrefix,
  generateApiKeySecret,
  hashApiKeySecret,
  parseApiKeyToken,
  verifyApiKeySecret,
} from '@pbx/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { apiKeys, withBypassRls } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { RateLimitService } from '../../common/services/rate-limit.service.js';

@Injectable()
export class ApiKeyAuthService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const parsed = parseApiKeyToken(token);
    if (!parsed) {
      throw unauthorized('Invalid API key');
    }

    await this.rateLimits.enforce(`api-key-auth:${parsed.prefix}`, 120, 60);

    const [row] = await withBypassRls(this.database.db, async (db) =>
      db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyPrefix, parsed.prefix), isNull(apiKeys.revokedAt)))
        .limit(1),
    );

    if (!row || !verifyApiKeySecret(parsed.secret, row.keyHash)) {
      await this.rateLimits.enforce(`api-key-fail:${parsed.prefix}`, 20, 300);
      throw unauthorized('Invalid API key');
    }

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('API key expired');
    }

    void this.touchLastUsed(row.id);

    return {
      id: `apikey:${row.id}`,
      email: '',
      platformRoles: [],
      tenantMemberships: [{ tenantId: row.tenantId, roles: ['api_service_account'] }],
      sessionId: `api-key:${row.id}`,
      mustChangePassword: false,
      authMethod: 'api_key',
      apiKeyId: row.id,
      apiKeyTenantId: row.tenantId,
      apiKeyScopes: row.scopes,
    };
  }

  static createKeyMaterial() {
    const prefix = generateApiKeyPrefix();
    const secret = generateApiKeySecret();
    return {
      prefix,
      secret,
      token: formatApiKey(prefix, secret),
      hash: hashApiKeySecret(secret),
    };
  }

  private async touchLastUsed(keyId: string) {
    try {
      await withBypassRls(this.database.db, async (db) => {
        await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
      });
    } catch {
      // bounded best-effort update
    }
  }
}
