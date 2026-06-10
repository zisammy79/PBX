/** Explicit permission strings — never compare role names alone for authorization. */
export const Permission = {
  // Platform
  PLATFORM_TENANT_CREATE: 'platform:tenant:create',
  PLATFORM_TENANT_READ: 'platform:tenant:read',
  PLATFORM_TENANT_UPDATE: 'platform:tenant:update',
  PLATFORM_TENANT_SUSPEND: 'platform:tenant:suspend',
  PLATFORM_TENANT_IMPERSONATE: 'platform:tenant:impersonate',
  PLATFORM_BILLING_READ: 'platform:billing:read',
  PLATFORM_AUDIT_READ: 'platform:audit:read',
  PLATFORM_HEALTH_READ: 'platform:health:read',
  PLATFORM_INTEGRATIONS_READ: 'platform:integrations:read',
  PLATFORM_INTEGRATIONS_MANAGE: 'platform:integrations:manage',
  PLATFORM_INTEGRATIONS_VALIDATE: 'platform:integrations:validate',
  PLATFORM_INTEGRATIONS_ASSIGN: 'platform:integrations:assign',
  PLATFORM_INTEGRATIONS_AUDIT: 'platform:integrations:audit',

  // Tenant administration
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',
  TENANT_USER_MANAGE: 'tenant:user:manage',
  TENANT_EXTENSION_MANAGE: 'tenant:extension:manage',
  TENANT_TRUNK_MANAGE: 'tenant:trunk:manage',
  TENANT_NUMBER_MANAGE: 'tenant:number:manage',
  TENANT_CALLFLOW_MANAGE: 'tenant:callflow:manage',
  TENANT_AI_MANAGE: 'tenant:ai:manage',
  AI_PROVIDER_CONNECTIONS_READ: 'ai:provider_connections:read',
  AI_PROVIDER_CONNECTIONS_MANAGE: 'ai:provider_connections:manage',
  AI_AGENTS_READ: 'ai:agents:read',
  AI_AGENTS_MANAGE: 'ai:agents:manage',
  AI_SESSIONS_READ: 'ai:sessions:read',
  AI_SESSIONS_DIAGNOSTICS: 'ai:sessions:diagnostics',
  AI_USAGE_READ: 'ai:usage:read',
  TENANT_RECORDING_READ: 'tenant:recording:read',
  TENANT_CALL_READ: 'tenant:call:read',
  TENANT_USAGE_READ: 'tenant:usage:read',
  TENANT_BILLING_READ: 'tenant:billing:read',
  TENANT_BILLING_MANAGE: 'tenant:billing:manage',
  TENANT_APIKEY_MANAGE: 'tenant:apikey:manage',
  TENANT_WEBHOOK_MANAGE: 'tenant:webhook:manage',
  TENANT_AUDIT_READ: 'tenant:audit:read',

  // Agent operations
  AGENT_CALL_HANDLE: 'agent:call:handle',
  AGENT_VOICEMAIL_READ: 'agent:voicemail:read',

  // API service account
  API_CALL_READ: 'api:call:read',
  API_USAGE_READ: 'api:usage:read',
  API_WEBHOOK_RECEIVE: 'api:webhook:receive',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

export function hasPermission(
  granted: readonly Permission[],
  required: Permission | Permission[],
): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((p) => granted.includes(p));
}

export function hasAnyPermission(
  granted: readonly Permission[],
  required: Permission[],
): boolean {
  return required.some((p) => granted.includes(p));
}
