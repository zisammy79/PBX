import { Permission, resolvePermissionsForRoles } from '@pbx/contracts';
import type { SessionUser } from './api-client';

export function userPermissions(user: SessionUser | null): Set<Permission> {
  if (!user) return new Set();
  const tenantRoles = user.tenantMemberships.flatMap((m) => m.roles);
  return new Set(resolvePermissionsForRoles(user.platformRoles as never[], tenantRoles as never[]));
}

export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  return userPermissions(user).has(permission);
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

export function canManageBilling(user: SessionUser | null): boolean {
  return hasPermission(user, Permission.TENANT_BILLING_MANAGE);
}

export function canReadBilling(user: SessionUser | null): boolean {
  return (
    hasPermission(user, Permission.TENANT_BILLING_READ) ||
    hasPermission(user, Permission.PLATFORM_BILLING_READ)
  );
}
