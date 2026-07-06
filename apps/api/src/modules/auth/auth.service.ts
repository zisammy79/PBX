import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import {
  JwtClaims,
  JwtClaimsSchema,
  PlatformRole,
  TenantRole,
  TokenResponse,
} from '@pbx/contracts';
import {
  generateSecureToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '@pbx/shared';
import { eq } from 'drizzle-orm';
import { sessions, tenantMemberships, users, withBypassRls } from '@pbx/database';
import type { Database } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { unauthorized, validationError } from '@pbx/contracts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRoles: PlatformRole[];
  tenantMemberships: Array<{ tenantId: string; roles: TenantRole[] }>;
  supportSession?: JwtClaims['supportSession'];
  sessionId: string;
  mustChangePassword: boolean;
  authMethod?: 'jwt' | 'api_key' | 'platform_api_token';
  apiKeyId?: string;
  apiKeyTenantId?: string;
  apiKeyScopes?: string[];
  platformApiTokenId?: string;
  platformApiTokenName?: string;
}

@Injectable()
export class AuthService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {
    this.secret = new TextEncoder().encode(config.jwtSecret);
  }

  get db(): Database {
    return this.database.db;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; tokens: TokenResponse; mustChangePassword: boolean }> {
    return withBypassRls(this.database.db, async (db) => {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw unauthorized('Invalid email or password');
      }
      if (user.status === 'disabled') {
        throw unauthorized('Account disabled');
      }
      if (user.status !== 'active' && user.status !== 'invited') {
        throw unauthorized('Account not eligible for login');
      }

      const memberships = await db
        .select()
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, user.id));

      const sessionId = crypto.randomUUID();
      const refreshToken = generateSecureToken(48);

      await db.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.config.jwtRefreshTtlSeconds * 1000),
      });

      const mustChangePassword = user.passwordMustChange || user.status === 'invited';

      const authenticated: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        platformRoles: user.platformRoles as PlatformRole[],
        tenantMemberships: memberships.map((m) => ({
          tenantId: m.tenantId,
          roles: m.roles as TenantRole[],
        })),
        sessionId,
        mustChangePassword,
      };

      const accessToken = await this.signAccessToken(authenticated);
      return {
        user: authenticated,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: this.config.jwtAccessTtlSeconds,
          tokenType: 'Bearer',
        },
        mustChangePassword,
      };
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 12) {
      throw validationError({ newPassword: 'Password must be at least 12 characters' });
    }

    await withBypassRls(this.database.db, async (db) => {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        throw unauthorized('Current password is incorrect');
      }

      await db
        .update(users)
        .set({
          passwordHash: hashPassword(newPassword),
          passwordMustChange: false,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      const claims = JwtClaimsSchema.parse(payload);
      if (claims.type !== 'access') throw unauthorized();

      return {
        id: claims.sub,
        email: claims.email,
        platformRoles: claims.platformRoles,
        tenantMemberships: claims.tenantMemberships,
        supportSession: claims.supportSession,
        sessionId: claims.sessionId,
        mustChangePassword: false,
      };
    } catch {
      throw unauthorized('Invalid or expired token');
    }
  }

  private async signAccessToken(user: AuthenticatedUser): Promise<string> {
    const claims: JwtClaims = {
      sub: user.id,
      email: user.email,
      type: 'access',
      platformRoles: user.platformRoles,
      tenantMemberships: user.tenantMemberships,
      supportSession: user.supportSession,
      sessionId: user.sessionId,
    };

    return new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.jwtAccessTtlSeconds}s`)
      .sign(this.secret);
  }
}
