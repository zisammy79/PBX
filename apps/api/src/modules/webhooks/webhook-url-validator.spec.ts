import { describe, expect, it } from 'vitest';
import { validateOutboundWebhookUrl } from './webhook-url-validator.js';

describe('validateOutboundWebhookUrl', () => {
  it('requires HTTPS', async () => {
    await expect(validateOutboundWebhookUrl('http://example.com/hook')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('blocks localhost', async () => {
    await expect(validateOutboundWebhookUrl('https://localhost/hook')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('allows public https host', async () => {
    const url = await validateOutboundWebhookUrl('https://example.com/webhooks/pbx');
    expect(url).toContain('https://example.com/');
  });
});
