import { describe, expect, it } from 'vitest';
import { validateHttpWebhookConfig } from './http-webhook-guard.js';

describe('http webhook guard', () => {
  it('requires allowlist hosts', () => {
    expect(() => validateHttpWebhookConfig({})).toThrow();
    const hosts = validateHttpWebhookConfig({ allowedHosts: ['hooks.example.com'] });
    expect(hosts).toEqual(['hooks.example.com']);
  });

  it('rejects non-https urls during target validation', async () => {
    const { validateHttpWebhookTarget } = await import('./http-webhook-guard.js');
    await expect(
      validateHttpWebhookTarget('http://hooks.example.com/callback', ['hooks.example.com']),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
