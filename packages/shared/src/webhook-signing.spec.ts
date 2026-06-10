import { describe, expect, it } from 'vitest';
import {
  generateWebhookSigningSecret,
  signWebhookBody,
  verifyWebhookSignature,
} from './webhook-signing.js';

describe('webhook signing', () => {
  it('signs and verifies raw body with timestamp', () => {
    const secret = generateWebhookSigningSecret();
    const body = JSON.stringify({ id: 'evt-1', type: 'call.completed' });
    const timestamp = 1_700_000_000;
    const signature = signWebhookBody(secret, timestamp, body);
    expect(
      verifyWebhookSignature(secret, timestamp, body, signature, timestamp),
    ).toBe(true);
    expect(
      verifyWebhookSignature(secret, timestamp, body, 'v1=deadbeef', timestamp),
    ).toBe(false);
  });

  it('rejects replay outside tolerance', () => {
    const secret = generateWebhookSigningSecret();
    const body = '{}';
    const timestamp = 1_700_000_000;
    const signature = signWebhookBody(secret, timestamp, body);
    expect(
      verifyWebhookSignature(secret, timestamp, body, signature, timestamp + 9999),
    ).toBe(false);
  });
});
