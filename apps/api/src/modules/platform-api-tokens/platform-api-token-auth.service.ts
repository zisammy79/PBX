import { Inject, Injectable } from '@nestjs/common';
import { unauthorized, type PlatformRole } from '@pbx/contracts';
import {
  formatPlatformApiToken,
  generatePlatformApiTokenPrefix,
  generatePlatformApiTokenSecret,
  hashPlatformApiTokenSecret,
  parsePlatformApiToken,
  verifyPlatformApiTokenSecret,
} from '@pbx/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { platformApiTokens, withBypassRls } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { RateLimitService } from '../../common/services/rate-limit.service.js';

@Injectable()
export class PlatformApiTokenAuthService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const parsed = parsePlatformApiToken(token);
    if (!parsed) {
      throw unauthorized('Invalid platform API token');
    }

    await this.rateLimits.enforce(`platform-api-token-auth:${parsed.prefix}`, 120, 60);

    const [row] = await withBypassRls(this.database.db, async (db) =>
      db
        .select()
        .from(platformApiTokens)
        .where(
          and(
            eq(platformApiTokens.tokenPrefix, parsed.prefix),
            eq(platformApiTokens.status, 'active'),
            isNull(platformApiTokens.revokedAt),
          ),
        )
        .limit(1),
    );

    if (!row || !verifyPlatformApiTokenSecret(parsed.secret, row.tokenHash)) {
      await this.rateLimits.enforce(`platform-api-token-fail:${parsed.prefix}`, 20, 300);
      throw unauthorized('Invalid platform API token');
    }

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('Platform API token expired');
    }

    void this.touchLastUsed(row.id);

    const platformRole = row.role as PlatformRole;
    return {
      id: `platform-token:${row.id}`,
      email: `service-account:${row.name}`,
      platformRoles: platformRole === 'platform_super_admin' ? ['platform_super_admin'] : [],
      tenantMemberships: [],
      sessionId: `platform-api-token:${row.id}`,
      mustChangePassword: false,
      authMethod: 'platform_api_token',
      platformApiTokenId: row.id,
      platformApiTokenName: row.name,
    };
  }

  static createTokenMaterial() {
    const prefix = generatePlatformApiTokenPrefix();
    const secret = generatePlatformApiTokenSecret();
    return {
      prefix,
      secret,
      token: formatPlatformApiToken(prefix, secret),
      hash: hashPlatformApiTokenSecret(secret),
    };
  }

  private async touchLastUsed(tokenId: string) {
    try {
      await withBypassRls(this.database.db, async (db) => {
        await db
          .update(platformApiTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(platformApiTokens.id, tokenId));
      });
    } catch {
      // bounded best-effort update
    }
  }
}
