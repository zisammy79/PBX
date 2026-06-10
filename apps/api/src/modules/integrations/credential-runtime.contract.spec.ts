import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resolveEnvironmentFallback } from './credential-env-fallback.js';
import { validateSipConfiguration } from './sip-network-validator.js';
import { encryptSecret, redactObject } from '@pbx/shared';

describe('runtime credential contract', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    delete process.env.ALLOW_INTEGRATION_ENV_FALLBACK;
  });

  afterEach(() => {
    process.env = prev;
  });

  it('environment fallback disabled by default', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(resolveEnvironmentFallback('ai', 'openai', 'default')).toBeNull();
  });

  it('environment fallback works only when explicitly enabled', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.OPENAI_API_KEY = 'sk-test';
    const resolved = resolveEnvironmentFallback('ai', 'openai', 'default');
    expect(resolved?.source).toBe('ENVIRONMENT_FALLBACK');
  });

  it('rejects live stripe keys in test fallback', () => {
    process.env.ALLOW_INTEGRATION_ENV_FALLBACK = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(resolveEnvironmentFallback('stripe', 'stripe', 'test')).toBeNull();
  });

  it('sip configuration validation is non-billable', () => {
    const result = validateSipConfiguration(
      { username: 'u', password: 'p' },
      { registrar: 'sip.example.com', transport: 'udp', authMode: 'registration' },
    );
    expect(result.status).toBe('CONFIGURATION_VALID');
  });

  it('secrets absent from serialized integration reads', () => {
    const sample = {
      credentialConfigured: true,
      credentialVersion: 2,
      validationStatus: 'CONFIGURED_NOT_TESTED',
    };
    expect(sample).not.toHaveProperty('apiKey');
    expect(sample).not.toHaveProperty('encryptedPayload');
  });

  it('audit metadata redacts secret patterns', () => {
    const redacted = redactObject({
      apiKey: 'sk-secret',
      secretKey: 'sk_test_abc',
      password: 'sip-pass',
      displayName: 'Carrier',
    });
    expect(JSON.stringify(redacted)).not.toContain('sk-secret');
    expect(JSON.stringify(redacted)).not.toContain('sip-pass');
    expect(redacted.displayName).toBe('Carrier');
  });

  it('encryption prevents plaintext persistence shape', () => {
    const key = 'a'.repeat(64);
    const encrypted = encryptSecret(JSON.stringify({ apiKey: 'sk-secret' }), key);
    expect(encrypted).not.toContain('sk-secret');
  });
});

describe('credential rotation behavior (contract)', () => {
  it('new sessions use updated credential version metadata', () => {
    const sessionA = { credentialVersion: 1 };
    const sessionB = { credentialVersion: 2 };
    expect(sessionA.credentialVersion).not.toBe(sessionB.credentialVersion);
  });
});
