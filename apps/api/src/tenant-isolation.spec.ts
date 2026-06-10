import { describe, expect, it } from 'vitest';
import { resolveActiveTenantId } from './common/guards/auth.guard.js';
import type { AuthenticatedUser } from './modules/auth/auth.service.js';

describe('tenant isolation', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  const tenantUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@tenant-a.test',
    platformRoles: [],
    tenantMemberships: [{ tenantId: tenantA, roles: ['tenant_owner'] }],
    sessionId: 'session-1',
    mustChangePassword: false,
  };

  it('rejects arbitrary tenant id from non-member', () => {
    const resolved = resolveActiveTenantId(tenantUser, tenantB);
    expect(resolved).toBeUndefined();
  });

  it('allows member tenant id from header', () => {
    const resolved = resolveActiveTenantId(tenantUser, tenantA);
    expect(resolved).toBe(tenantA);
  });

  it('platform admin can access any tenant via header', () => {
    const admin: AuthenticatedUser = {
      ...tenantUser,
      platformRoles: ['platform_super_admin'],
      tenantMemberships: [],
    };
    const resolved = resolveActiveTenantId(admin, tenantB);
    expect(resolved).toBe(tenantB);
  });

  it('support session overrides header tenant', () => {
    const supportUser: AuthenticatedUser = {
      ...tenantUser,
      platformRoles: ['platform_support_operator'],
      supportSession: {
        tenantId: tenantB,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        auditId: 'audit-1',
      },
    };
    const resolved = resolveActiveTenantId(supportUser, tenantA);
    expect(resolved).toBe(tenantB);
  });
});
