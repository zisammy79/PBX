import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveEnvironmentFallback } from './credential-env-fallback.js';
import { IntegrationValidatorService } from './integration-validator.service.js';
import { encryptSecret, redactObject } from '@pbx/shared';

describe('resolveEnvironmentFallback', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    delete process.env.ALLOW_INTEGRATION_ENV_FALLBACK;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.SIP_USERNAME;
    delete process.env.SIP_PASSWORD;
  });

  afterEach(() => {
    process.env = prev;
  });

  it('returns null when fallback disabled', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(resolveEnvironmentFallback('ai', 'openai', 'default')).toBeNull();
  });

  it('resolves OpenAI from environment when enabled', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview';
    const resolved = resolveEnvironmentFallback('ai', 'openai', 'default');
    expect(resolved?.source).toBe('ENVIRONMENT_FALLBACK');
    expect(resolved?.secrets.apiKey).toBe('sk-test');
    expect(resolved?.config.model).toBe('gpt-4o-realtime-preview');
  });

  it('rejects live Stripe keys in test environment fallback', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(resolveEnvironmentFallback('stripe', 'stripe', 'test')).toBeNull();
  });

  it('resolves Stripe test keys from environment when enabled', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const resolved = resolveEnvironmentFallback('stripe', 'stripe', 'test');
    expect(resolved?.source).toBe('ENVIRONMENT_FALLBACK');
    expect(resolved?.secrets.secretKey).toBe('sk_test_abc');
  });

  it('resolves SIP carrier from environment when enabled', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.SIP_USERNAME = 'user';
    process.env.SIP_PASSWORD = 'pass';
    process.env.SIP_REGISTRAR = 'sip.example.com';
    const resolved = resolveEnvironmentFallback('sip_carrier', 'generic', 'default');
    expect(resolved?.secrets.username).toBe('user');
    expect(resolved?.config.registrar).toBe('sip.example.com');
  });
});

describe('IntegrationValidatorService', () => {
  const validator = new IntegrationValidatorService();

  it('rejects live Stripe key in test mode', () => {
    const result = validator.validateStripeSecrets({ secretKey: 'sk_live_abc' }, 'test');
    expect(result.status).toBe('INVALID');
  });

  it('accepts test Stripe keys with webhook secret', () => {
    const result = validator.validateStripeSecrets(
      { secretKey: 'sk_test_abc', webhookSecret: 'whsec_x', publishableKey: 'pk_test_abc' },
      'test',
    );
    expect(result.status).toBe('VALID');
  });

  it('sanitizes validation errors without secrets', () => {
    const result = validator.validateOpenAiSecrets({ apiKey: '' }, {});
    expect(result.sanitizedError).not.toMatch(/sk-/);
  });
});

describe('secret encryption and redaction', () => {
  it('encrypts credentials before persistence shape', () => {
    const key = 'a'.repeat(64);
    const encrypted = encryptSecret(JSON.stringify({ apiKey: 'sk-secret' }), key);
    expect(encrypted).not.toContain('sk-secret');
  });

  it('redacts secret keys from metadata', () => {
    const redacted = redactObject({ apiKey: 'sk-secret', displayName: 'OpenAI' });
    expect(redacted.apiKey).not.toBe('sk-secret');
    expect(redacted.displayName).toBe('OpenAI');
  });
});
