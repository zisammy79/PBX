import type { AuthenticatedUser } from '../modules/auth/auth.service.js';

export function resolveAuditActor(actor: AuthenticatedUser): {
  actorUserId: string | null;
  actorType: string;
  actorMetadata: Record<string, unknown>;
} {
  if (actor.authMethod === 'platform_api_token') {
    return {
      actorUserId: null,
      actorType: 'service_account',
      actorMetadata: {
        platformApiTokenId: actor.platformApiTokenId,
        platformApiTokenName: actor.platformApiTokenName,
      },
    };
  }
  if (actor.authMethod === 'api_key') {
    return {
      actorUserId: null,
      actorType: 'api_key',
      actorMetadata: {
        apiKeyId: actor.apiKeyId,
      },
    };
  }
  return {
    actorUserId: actor.id,
    actorType: 'user',
    actorMetadata: {},
  };
}
