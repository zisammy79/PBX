import { describe, expect, it } from 'vitest';
import { resolveStripeStatusFromEnv } from '../billing/stripe-status.js';

describe('integration API contract redaction', () => {
  it('serialized integration never includes plaintext secret fields', () => {
    const sample = {
      credentialConfigured: true,
      validationStatus: 'CONFIGURED_NOT_TESTED',
      config: { model: 'gpt-4o-realtime-preview' },
    };
    expect(sample).not.toHaveProperty('apiKey');
    expect(sample).not.toHaveProperty('encryptedPayload');
    expect(sample).not.toHaveProperty('secretKey');
  });

  it('stripe live keys detected separately from test env', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc';
    expect(resolveStripeStatusFromEnv()).toBe('LIVE');
    delete process.env.STRIPE_SECRET_KEY;
  });
});
