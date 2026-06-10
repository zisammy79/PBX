import type { CredentialSource, ResolvedCredential } from './credential-resolver.service.js';

export function resolveEnvironmentFallback(
  integrationType: string,
  provider: string,
  environment: string,
): ResolvedCredential | null {
  if (process.env.ALLOW_INTEGRATION_ENV_FALLBACK !== 'true') return null;

  if (integrationType === 'ai' && provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      source: 'ENVIRONMENT_FALLBACK' as CredentialSource,
      provider,
      integrationType,
      environment,
      config: {
        model: process.env.OPENAI_REALTIME_MODEL,
        voice: process.env.OPENAI_REALTIME_VOICE,
        realtimeUrl: process.env.OPENAI_REALTIME_URL,
      },
      secrets: { apiKey },
    };
  }

  if (integrationType === 'stripe' && environment === 'test') {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey?.startsWith('sk_test_')) return null;
    return {
      source: 'ENVIRONMENT_FALLBACK' as CredentialSource,
      provider: 'stripe',
      integrationType: 'stripe',
      environment: 'test',
      config: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      },
      secrets: {
        secretKey,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      },
    };
  }

  if (integrationType === 'sip_carrier') {
    const username = process.env.SIP_USERNAME?.trim();
    const password = process.env.SIP_PASSWORD?.trim();
    if (!username || !password) return null;
    return {
      source: 'ENVIRONMENT_FALLBACK' as CredentialSource,
      provider: process.env.SIP_PROVIDER_NAME ?? 'generic',
      integrationType: 'sip_carrier',
      environment: 'default',
      config: {
        registrar: process.env.SIP_REGISTRAR,
        outboundProxy: process.env.SIP_OUTBOUND_PROXY,
        authMode: process.env.SIP_AUTH_MODE,
        transport: process.env.SIP_TRANSPORT,
        assignedDid: process.env.SIP_ASSIGNED_DID,
        allowedCallerId: process.env.SIP_ALLOWED_CALLER_ID,
      },
      secrets: { username, password },
    };
  }

  return null;
}
