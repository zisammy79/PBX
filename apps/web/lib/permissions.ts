import {
  Permission,
  resolveEffectivePermissions,
  type PlatformRole,
  type TenantRole,
} from '@pbx/contracts';
import type { SessionUser } from './api-client';

export function userPermissionsForTenant(
  user: SessionUser | null,
  tenantId?: string | null,
): Set<Permission> {
  if (!user) return new Set();
  const tenantRoles = tenantId
    ? (user.tenantMemberships.find((m) => m.tenantId === tenantId)?.roles ?? [])
    : user.tenantMemberships.flatMap((m) => m.roles);
  return new Set(
    resolveEffectivePermissions(
      user.platformRoles as PlatformRole[],
      tenantRoles as TenantRole[],
      tenantId ?? undefined,
    ),
  );
}

/** @deprecated Prefer userPermissionsForTenant with an active tenant id. */
export function userPermissions(user: SessionUser | null): Set<Permission> {
  return userPermissionsForTenant(user, null);
}

export function hasPermissionForTenant(
  user: SessionUser | null,
  permission: Permission,
  tenantId?: string | null,
): boolean {
  return userPermissionsForTenant(user, tenantId).has(permission);
}

export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  return hasPermissionForTenant(user, permission, null);
}

export function isPlatformAdmin(user: SessionUser | null): boolean {
  return !!user?.platformRoles.includes('platform_super_admin');
}

export function canAccessTenant(user: SessionUser | null, tenantId: string): boolean {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  if (user.supportSession?.tenantId === tenantId) return true;
  return user.tenantMemberships.some((m) => m.tenantId === tenantId);
}

export function canManageBillingForTenant(user: SessionUser | null, tenantId?: string | null): boolean {
  return hasPermissionForTenant(user, Permission.TENANT_BILLING_MANAGE, tenantId);
}

export function canReadBillingForTenant(user: SessionUser | null, tenantId?: string | null): boolean {
  return (
    hasPermissionForTenant(user, Permission.TENANT_BILLING_READ, tenantId) ||
    hasPermissionForTenant(user, Permission.PLATFORM_BILLING_READ, tenantId)
  );
}

export function canManageBilling(user: SessionUser | null): boolean {
  return canManageBillingForTenant(user, null);
}

export function canReadBilling(user: SessionUser | null): boolean {
  return canReadBillingForTenant(user, null);
}
