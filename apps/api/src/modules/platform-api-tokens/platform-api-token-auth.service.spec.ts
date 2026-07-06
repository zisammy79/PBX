import { describe, expect, it } from 'vitest';
import {
  formatPlatformApiToken,
  generatePlatformApiTokenPrefix,
  generatePlatformApiTokenSecret,
  isApiKeyToken,
  isPlatformApiToken,
  parsePlatformApiToken,
} from '@pbx/shared';
import {
  hasAnyPermission,
  Permission,
  resolveEffectivePermissions,
} from '@pbx/contracts';
import type { AuthenticatedUser } from '../auth/auth.service.js';

describe('platform api token auth context', () => {
  it('distinguishes platform tokens from tenant api keys', () => {
    const platform = formatPlatformApiToken(
      generatePlatformApiTokenPrefix(),
      generatePlatformApiTokenSecret(),
    );
    const tenant = `pbx_live_${'abcdefghijkl'}_${generatePlatformApiTokenSecret()}`;
    expect(isPlatformApiToken(platform)).toBe(true);
    expect(isApiKeyToken(platform)).toBe(false);
    expect(isApiKeyToken(tenant)).toBe(true);
    expect(isPlatformApiToken(tenant)).toBe(false);
    expect(parsePlatformApiToken(platform)).not.toBeNull();
  });

  it('grants platform super admin effective tenant permissions', () => {
    const actor: AuthenticatedUser = {
      id: 'platform-token:token-id',
      email: 'service-account:automation',
      platformRoles: ['platform_super_admin'],
      tenantMemberships: [],
      sessionId: 'platform-api-token:token-id',
      mustChangePassword: false,
      authMethod: 'platform_api_token',
      platformApiTokenId: 'token-id',
      platformApiTokenName: 'automation',
    };
    const tenantId = '2433f849-3b43-405c-83a4-47d4ff492955';
    const granted = resolveEffectivePermissions(
      actor.platformRoles,
      [],
      tenantId,
    );
    expect(hasAnyPermission(granted, [Permission.PLATFORM_INTEGRATIONS_READ])).toBe(true);
    expect(hasAnyPermission(granted, [Permission.TENANT_UPDATE])).toBe(true);
    expect(hasAnyPermission(granted, [Permission.TENANT_CALL_READ])).toBe(true);
  });
});
