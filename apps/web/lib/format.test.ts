import { describe, expect, it } from 'vitest';
import {
  demoAiModeLabel,
  externalValidationLabel,
  providerCostLabel,
  pstnVerificationLabel,
  stripeStatusLabel,
} from '@/lib/format';

describe('status labels', () => {
  it('shows demo AI deterministic mode', () => {
    expect(demoAiModeLabel('deterministic')).toBe('Demo AI mode — deterministic local provider');
  });

  it('shows external AI verification as not tested', () => {
    expect(externalValidationLabel('NOT_TESTED')).toBe('External AI verification — Not tested');
  });

  it('shows stripe test mode', () => {
    expect(stripeStatusLabel('TEST')).toBe('Stripe test mode');
  });

  it('shows stripe disabled', () => {
    expect(stripeStatusLabel('DISABLED')).toBe('Payment integration — Disabled');
  });

  it('shows provider cost unavailable', () => {
    expect(providerCostLabel('UNAVAILABLE')).toBe('Provider cost — Unavailable');
  });

  it('shows PSTN verification not performed', () => {
    expect(pstnVerificationLabel('NOT_PERFORMED')).toBe('PSTN verification — Not performed');
  });
});
