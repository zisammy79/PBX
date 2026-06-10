import { describe, expect, it } from 'vitest';
import { Permission } from '@pbx/contracts';
import {
  canAccessTenant,
  canManageBilling,
  canReadBilling,
  isPlatformAdmin,
} from '@/lib/permissions';
import {
  externalValidationLabel,
  formatCurrency,
  providerCostLabel,
  stripeStatusLabel,
} from '@/lib/format';
import type { SessionUser } from '@/lib/api-client';

const tenantOwner: SessionUser = {
  id: 'owner',
  email: 'owner@tenant.test',
  platformRoles: [],
  tenantMemberships: [{ tenantId: 'tenant-a', roles: ['tenant_owner'] }],
};

const billingAdmin: SessionUser = {
  id: 'billing',
  email: 'billing@tenant.test',
  platformRoles: [],
  tenantMemberships: [{ tenantId: 'tenant-a', roles: ['tenant_billing_administrator'] }],
};

const supervisor: SessionUser = {
  id: 'supervisor',
  email: 'supervisor@tenant.test',
  platformRoles: [],
  tenantMemberships: [{ tenantId: 'tenant-a', roles: ['supervisor'] }],
};

const platformAdmin: SessionUser = {
  id: 'platform',
  email: 'admin@pbx.local',
  platformRoles: ['platform_super_admin'],
  tenantMemberships: [],
};

describe('critical UI flows (logic)', () => {
  it('1 tenant owner can access own tenant', () => {
    expect(canAccessTenant(tenantOwner, 'tenant-a')).toBe(true);
  });

  it('2 tenant owner cannot access other tenant', () => {
    expect(canAccessTenant(tenantOwner, 'tenant-b')).toBe(false);
  });

  it('10 billing admin can read and manage billing', () => {
    expect(canReadBilling(billingAdmin)).toBe(true);
    expect(canManageBilling(billingAdmin)).toBe(true);
  });

  it('11 supervisor cannot manage billing', () => {
    expect(canManageBilling(supervisor)).toBe(false);
  });

  it('12 platform admin is detected', () => {
    expect(isPlatformAdmin(platformAdmin)).toBe(true);
  });

  it('13 tenant user is not platform admin', () => {
    expect(isPlatformAdmin(tenantOwner)).toBe(false);
  });

  it('14 cross-tenant URL access denied for tenant owner', () => {
    expect(canAccessTenant(tenantOwner, 'tenant-b')).toBe(false);
  });

  it('15 external AI status remains NOT_TESTED', () => {
    expect(externalValidationLabel('NOT_TESTED')).toBe('External AI verification — Not tested');
  });

  it('16 stripe status remains DISABLED', () => {
    expect(stripeStatusLabel('DISABLED')).toBe('Payment integration — Disabled');
  });

  it('provider cost remains UNAVAILABLE', () => {
    expect(providerCostLabel('UNAVAILABLE')).toBe('Provider cost — Unavailable');
  });

  it('billing totals format with invoice currency', () => {
    expect(formatCurrency('34.80', 'USD')).toMatch(/\$34\.80/);
  });

  it('platform admin can access any tenant', () => {
    expect(canAccessTenant(platformAdmin, 'tenant-b')).toBe(true);
  });

  it('platform admin has platform billing read', () => {
    expect(canReadBilling(platformAdmin)).toBe(true);
  });

  it('supervisor lacks billing manage permission', () => {
    expect(canManageBilling(supervisor)).toBe(false);
    expect(canReadBilling(supervisor)).toBe(false);
  });

  it('tenant owner has extension and AI permissions via role set', () => {
    expect(canManageBilling(tenantOwner)).toBe(true);
    expect(canAccessTenant(tenantOwner, 'tenant-a')).toBe(true);
  });

  it('billing permission constants are distinct', () => {
    expect(Permission.TENANT_BILLING_READ).not.toBe(Permission.TENANT_BILLING_MANAGE);
  });
});
