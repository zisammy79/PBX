import { describe, expect, it } from 'vitest';
import { Permission } from '@pbx/contracts';
import { canManageBilling, canReadBilling, isPlatformAdmin, userPermissions } from '@/lib/permissions';
import type { SessionUser } from '@/lib/api-client';

const owner: SessionUser = {
  id: 'u1',
  email: 'owner@test',
  platformRoles: [],
  tenantMemberships: [{ tenantId: 't1', roles: ['tenant_owner'] }],
};

const billingAdmin: SessionUser = {
  id: 'u2',
  email: 'billing@test',
  platformRoles: [],
  tenantMemberships: [{ tenantId: 't1', roles: ['tenant_billing_administrator'] }],
};

const platformAdmin: SessionUser = {
  id: 'u3',
  email: 'admin@test',
  platformRoles: ['platform_super_admin'],
  tenantMemberships: [],
};

describe('permissions', () => {
  it('allows tenant owner billing manage', () => {
    expect(canManageBilling(owner)).toBe(true);
    expect(canReadBilling(owner)).toBe(true);
  });

  it('allows billing admin read/manage billing only', () => {
    expect(canManageBilling(billingAdmin)).toBe(true);
    expect(canReadBilling(billingAdmin)).toBe(true);
  });

  it('detects platform admin', () => {
    expect(isPlatformAdmin(platformAdmin)).toBe(true);
    expect(canReadBilling(platformAdmin)).toBe(true);
  });

  it('does not grant billing manage without permission', () => {
    const user: SessionUser = {
      id: 'u4',
      email: 'supervisor@test',
      platformRoles: [],
      tenantMemberships: [{ tenantId: 't1', roles: ['supervisor'] }],
    };
    expect(canManageBilling(user)).toBe(false);
    expect(userPermissions(user).has(Permission.TENANT_BILLING_MANAGE)).toBe(false);
  });
});
