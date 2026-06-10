import { describe, expect, it } from 'vitest';
import { hasPermission, Permission } from '../src/permissions.js';
import { resolvePermissionsForRoles } from '../src/roles.js';

describe('permissions', () => {
  it('tenant_owner has extension manage permission', () => {
    const perms = resolvePermissionsForRoles([], ['tenant_owner']);
    expect(hasPermission(perms, Permission.TENANT_EXTENSION_MANAGE)).toBe(true);
  });

  it('human_agent cannot manage extensions', () => {
    const perms = resolvePermissionsForRoles([], ['human_agent']);
    expect(hasPermission(perms, Permission.TENANT_EXTENSION_MANAGE)).toBe(false);
  });

  it('platform super admin can create tenants', () => {
    const perms = resolvePermissionsForRoles(['platform_super_admin'], []);
    expect(hasPermission(perms, Permission.PLATFORM_TENANT_CREATE)).toBe(true);
  });
});
