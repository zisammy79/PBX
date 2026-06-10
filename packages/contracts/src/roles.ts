import { Permission } from './permissions.js';
import type { PlatformRole, TenantRole } from './auth.js';

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  platform_super_admin: [
    Permission.PLATFORM_TENANT_CREATE,
    Permission.PLATFORM_TENANT_READ,
    Permission.PLATFORM_TENANT_UPDATE,
    Permission.PLATFORM_TENANT_SUSPEND,
    Permission.PLATFORM_TENANT_IMPERSONATE,
    Permission.PLATFORM_BILLING_READ,
    Permission.PLATFORM_AUDIT_READ,
    Permission.PLATFORM_HEALTH_READ,
    Permission.PLATFORM_INTEGRATIONS_READ,
    Permission.PLATFORM_INTEGRATIONS_MANAGE,
    Permission.PLATFORM_INTEGRATIONS_VALIDATE,
    Permission.PLATFORM_INTEGRATIONS_ASSIGN,
    Permission.PLATFORM_INTEGRATIONS_AUDIT,
  ],
  platform_support_operator: [
    Permission.PLATFORM_TENANT_READ,
    Permission.PLATFORM_TENANT_IMPERSONATE,
    Permission.PLATFORM_AUDIT_READ,
    Permission.PLATFORM_HEALTH_READ,
  ],
};

export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  tenant_owner: [
    Permission.TENANT_READ,
    Permission.TENANT_UPDATE,
    Permission.TENANT_USER_MANAGE,
    Permission.TENANT_EXTENSION_MANAGE,
    Permission.TENANT_TRUNK_MANAGE,
    Permission.TENANT_NUMBER_MANAGE,
    Permission.TENANT_CALLFLOW_MANAGE,
    Permission.TENANT_AI_MANAGE,
    Permission.AI_PROVIDER_CONNECTIONS_READ,
    Permission.AI_PROVIDER_CONNECTIONS_MANAGE,
    Permission.AI_AGENTS_READ,
    Permission.AI_AGENTS_MANAGE,
    Permission.AI_SESSIONS_READ,
    Permission.AI_SESSIONS_DIAGNOSTICS,
    Permission.AI_USAGE_READ,
    Permission.TENANT_RECORDING_READ,
    Permission.TENANT_CALL_READ,
    Permission.TENANT_USAGE_READ,
    Permission.TENANT_BILLING_READ,
    Permission.TENANT_BILLING_MANAGE,
    Permission.TENANT_APIKEY_MANAGE,
    Permission.TENANT_WEBHOOK_MANAGE,
    Permission.TENANT_AUDIT_READ,
  ],
  tenant_administrator: [
    Permission.TENANT_READ,
    Permission.TENANT_UPDATE,
    Permission.TENANT_USER_MANAGE,
    Permission.TENANT_EXTENSION_MANAGE,
    Permission.TENANT_TRUNK_MANAGE,
    Permission.TENANT_NUMBER_MANAGE,
    Permission.TENANT_CALLFLOW_MANAGE,
    Permission.TENANT_AI_MANAGE,
    Permission.AI_PROVIDER_CONNECTIONS_READ,
    Permission.AI_PROVIDER_CONNECTIONS_MANAGE,
    Permission.AI_AGENTS_READ,
    Permission.AI_AGENTS_MANAGE,
    Permission.AI_SESSIONS_READ,
    Permission.AI_SESSIONS_DIAGNOSTICS,
    Permission.AI_USAGE_READ,
    Permission.TENANT_RECORDING_READ,
    Permission.TENANT_CALL_READ,
    Permission.TENANT_USAGE_READ,
    Permission.TENANT_APIKEY_MANAGE,
    Permission.TENANT_WEBHOOK_MANAGE,
    Permission.TENANT_AUDIT_READ,
  ],
  tenant_billing_administrator: [
    Permission.TENANT_READ,
    Permission.TENANT_BILLING_READ,
    Permission.TENANT_BILLING_MANAGE,
    Permission.TENANT_USAGE_READ,
  ],
  supervisor: [
    Permission.TENANT_READ,
    Permission.TENANT_CALL_READ,
    Permission.TENANT_RECORDING_READ,
    Permission.TENANT_USAGE_READ,
    Permission.AGENT_CALL_HANDLE,
    Permission.AGENT_VOICEMAIL_READ,
  ],
  human_agent: [
    Permission.TENANT_CALL_READ,
    Permission.AGENT_CALL_HANDLE,
    Permission.AGENT_VOICEMAIL_READ,
  ],
  read_only_auditor: [
    Permission.TENANT_READ,
    Permission.TENANT_CALL_READ,
    Permission.TENANT_RECORDING_READ,
    Permission.TENANT_USAGE_READ,
    Permission.AI_USAGE_READ,
    Permission.AI_SESSIONS_READ,
    Permission.TENANT_BILLING_READ,
    Permission.TENANT_AUDIT_READ,
  ],
  api_service_account: [
    Permission.API_CALL_READ,
    Permission.API_USAGE_READ,
    Permission.AI_USAGE_READ,
    Permission.AI_SESSIONS_READ,
    Permission.API_WEBHOOK_RECEIVE,
    Permission.TENANT_CALL_READ,
    Permission.TENANT_USAGE_READ,
  ],
};

export function resolvePermissionsForRoles(
  platformRoles: readonly PlatformRole[],
  tenantRoles: readonly TenantRole[],
): Permission[] {
  const set = new Set<Permission>();
  for (const role of platformRoles) {
    for (const p of PLATFORM_ROLE_PERMISSIONS[role]) {
      set.add(p);
    }
  }
  for (const role of tenantRoles) {
    for (const p of TENANT_ROLE_PERMISSIONS[role]) {
      set.add(p);
    }
  }
  return [...set];
}

/** Platform super admin operating in a tenant context receives owner-equivalent permissions. */
export function resolveEffectivePermissions(
  platformRoles: readonly PlatformRole[],
  tenantRoles: readonly TenantRole[],
  activeTenantId?: string,
): Permission[] {
  const permissions = resolvePermissionsForRoles(platformRoles, tenantRoles);
  if (
    activeTenantId &&
    platformRoles.includes('platform_super_admin') &&
    tenantRoles.length === 0
  ) {
    const set = new Set(permissions);
    for (const p of TENANT_ROLE_PERMISSIONS.tenant_owner) {
      set.add(p);
    }
    return [...set];
  }
  return permissions;
}
