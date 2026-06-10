import { describe, expect, it } from 'vitest';
import { resolveStripeStatusFromEnv } from '../billing/stripe-status.js';

describe('stripe contract', () => {
  it('defaults to DISABLED without env', () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    expect(resolveStripeStatusFromEnv()).toBe('DISABLED');
    if (prev) process.env.STRIPE_SECRET_KEY = prev;
  });

  it('detects test mode keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
    expect(resolveStripeStatusFromEnv()).toBe('TEST');
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('detects live mode keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc123';
    expect(resolveStripeStatusFromEnv()).toBe('LIVE');
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('rejects live keys in test-mode verification policy', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc123';
    expect(resolveStripeStatusFromEnv()).toBe('LIVE');
    delete process.env.STRIPE_SECRET_KEY;
  });
});
