import { z } from 'zod';
import { Permission } from './permissions.js';
import { validationError } from './errors.js';

/** Tenant API key scopes — no wildcards. */
export const ApiScopeSchema = z.enum([
  'calls.read',
  'calls.active.read',
  'extensions.read',
  'extensions.manage',
  'ai.agents.read',
  'ai.agents.manage',
  'ai.sessions.read',
  'usage.read',
  'billing.read',
  'webhooks.manage',
]);

export type ApiScope = z.infer<typeof ApiScopeSchema>;

export const ALL_API_SCOPES = ApiScopeSchema.options;

export const API_SCOPE_PERMISSIONS: Record<ApiScope, readonly Permission[]> = {
  'calls.read': [Permission.TENANT_CALL_READ],
  'calls.active.read': [Permission.TENANT_CALL_READ],
  'extensions.read': [Permission.TENANT_EXTENSION_MANAGE, Permission.TENANT_CALL_READ],
  'extensions.manage': [Permission.TENANT_EXTENSION_MANAGE],
  'ai.agents.read': [Permission.AI_AGENTS_READ],
  'ai.agents.manage': [Permission.AI_AGENTS_MANAGE],
  'ai.sessions.read': [Permission.AI_SESSIONS_READ],
  'usage.read': [Permission.TENANT_USAGE_READ],
  'billing.read': [Permission.TENANT_BILLING_READ],
  'webhooks.manage': [Permission.TENANT_WEBHOOK_MANAGE],
};

export function resolvePermissionsForApiScopes(scopes: readonly string[]): Permission[] {
  const set = new Set<Permission>();
  for (const scope of scopes) {
    const parsed = ApiScopeSchema.safeParse(scope);
    if (!parsed.success) continue;
    for (const p of API_SCOPE_PERMISSIONS[parsed.data]) {
      set.add(p);
    }
  }
  return [...set];
}

export function assertValidApiScopes(scopes: string[]): ApiScope[] {
  const invalid = scopes.filter((s) => !ApiScopeSchema.safeParse(s).success);
  if (invalid.length) {
    throw validationError({ scopes: `Invalid scopes: ${invalid.join(', ')}` });
  }
  if (scopes.includes('*') || scopes.some((s) => s.includes('*'))) {
    throw validationError({ scopes: 'Wildcard scopes are not permitted' });
  }
  return scopes as ApiScope[];
}

export const CreateApiApplicationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  scopes: z.array(ApiScopeSchema).min(1),
});

export const UpdateApiApplicationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  scopes: z.array(ApiScopeSchema).min(1).optional(),
});

export const CreateApiKeySchema = z.object({
  displayName: z.string().min(1).max(255),
  scopes: z.array(ApiScopeSchema).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const RotateApiKeySchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  expiresAt: z.string().datetime().optional(),
});
