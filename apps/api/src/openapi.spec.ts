import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const openapiPath = join(root, 'openapi', 'openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
};

const requiredPaths = [
  '/api/v1/auth/login',
  '/api/v1/health/ready',
  '/api/v1/tenants/{tenantId}/extensions',
  '/api/v1/credits/adjustments',
  '/api/v1/invoices/generate',
  '/api/v1/api-applications',
  '/api/v1/webhooks',
  '/api/v1/webhooks/{id}/deliveries/{deliveryId}/redeliver',
  '/api/v1/ai/provider-connections',
];

describe('openapi release artifact', () => {
  it('includes every implemented public route group', () => {
    for (const path of requiredPaths) {
      expect(openapi.paths[path], `missing path ${path}`).toBeTruthy();
    }
  });

  it('documents webhook envelope and deferred AI status', () => {
    expect(openapi.components?.schemas?.WebhookEventEnvelope).toBeTruthy();
    const aiSchema = openapi.components?.schemas?.AiProviderConnection as {
      properties?: { externalValidationStatus?: { enum?: string[] } };
    };
    expect(aiSchema?.properties?.externalValidationStatus?.enum).toContain('NOT_TESTED');
  });

  it('documents idempotency on mutating routes', () => {
    const creditPost = openapi.paths['/api/v1/credits/adjustments']?.post as { summary?: string };
    expect(creditPost?.summary).toMatch(/Idempotency/i);
    const rotate = openapi.paths['/api/v1/api-applications/{id}/keys/{keyId}/rotate']?.post as {
      summary?: string;
    };
    expect(rotate?.summary).toMatch(/Idempotency/i);
  });
});
