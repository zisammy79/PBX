import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function enrichOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ErrorResponse: {
      type: 'object',
      required: ['error', 'message', 'statusCode'],
      properties: {
        error: { type: 'string', example: 'validation_error' },
        message: { type: 'string', example: 'Request validation failed' },
        statusCode: { type: 'integer', example: 400 },
        details: { type: 'object', additionalProperties: true },
        correlationId: { type: 'string', format: 'uuid' },
      },
    },
    LoginRequest: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'owner@tenant.test' },
        password: { type: 'string', minLength: 12, example: 'SecurePass123!' },
      },
    },
    LoginResponse: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        tokenType: { type: 'string', example: 'Bearer' },
        expiresIn: { type: 'integer', example: 900 },
        mustChangePassword: { type: 'boolean', example: false },
        user: { type: 'object' },
      },
    },
    CreateTenantRequest: {
      type: 'object',
      required: ['name', 'slug', 'ownerEmail', 'ownerDisplayName'],
      properties: {
        name: { type: 'string', example: 'Acme Corp' },
        slug: { type: 'string', example: 'acme-corp' },
        ownerEmail: { type: 'string', format: 'email', example: 'owner@acme.test' },
        ownerDisplayName: { type: 'string', example: 'Acme Owner' },
        planId: { type: 'string', format: 'uuid', nullable: true },
      },
    },
    CreateExtensionRequest: {
      type: 'object',
      required: ['extensionNumber', 'displayName'],
      properties: {
        extensionNumber: { type: 'string', example: '1001' },
        displayName: { type: 'string', example: 'Front Desk' },
      },
    },
    ExtensionCreateResponse: {
      type: 'object',
      description:
        'SIP credential secret is returned only on create. Read/list/get responses never include plaintext secrets.',
      properties: {
        extension: { type: 'object' },
        sipCredential: {
          type: 'object',
          properties: {
            username: { type: 'string', example: 'acme_1001' },
            secret: {
              type: 'string',
              description: 'Plaintext SIP password — only present on create',
              example: 'generated-secret-once',
            },
            domain: { type: 'string', example: 'acme-corp.pbx.local' },
          },
        },
      },
    },
    ExtensionReadResponse: {
      type: 'object',
      properties: {
        extension: { type: 'object' },
        sipCredential: {
          type: 'object',
          nullable: true,
          properties: {
            username: { type: 'string' },
            secretVersion: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    HealthResponse: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
        version: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              latencyMs: { type: 'integer' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    ReadinessResponse: {
      allOf: [{ $ref: '#/components/schemas/HealthResponse' }],
      properties: {
        ready: { type: 'boolean', example: true },
      },
    },
  };

  const bearerTenantSecurity = [{ bearer: [] as string[] }, { tenant: [] as string[] }];
  const bearerPlatformSecurity = [{ bearer: [] as string[] }];

  const patch = (
    path: string,
    method: 'get' | 'post',
    extra: Record<string, unknown>,
  ) => {
    const operation = document.paths?.[path]?.[method];
    if (operation) {
      Object.assign(operation, extra);
    }
  };

  patch('/api/v1/auth/login', 'post', {
    summary: 'Authenticate user',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
    },
    responses: {
      '201': {
        description: 'Authentication successful',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
      },
      '401': { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    },
  });

  patch('/api/v1/auth/change-password', 'post', {
    summary: 'Change authenticated user password',
    security: [{ bearer: [] }],
  });

  patch('/api/v1/auth/me', 'get', {
    summary: 'Get current authenticated user and tenant memberships',
    security: [{ bearer: [] }],
    responses: {
      '200': { description: 'Current user profile' },
      '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    },
  });

  patch('/api/v1/tenants/{tenantId}/dashboard', 'get', {
    summary: 'Tenant operational dashboard summary',
    security: bearerTenantSecurity,
    tags: ['Dashboard'],
  });

  patch('/api/v1/platform/dashboard', 'get', {
    summary: 'Platform admin global dashboard summary',
    security: [{ bearer: [] }],
    tags: ['Dashboard'],
  });

  patch('/api/v1/billing/subscription', 'get', {
    summary: 'Current tenant subscription and plan entitlements',
    security: bearerTenantSecurity,
    tags: ['Billing'],
  });

  patch('/api/v1/tenants', 'post', {
    summary: 'Create tenant and owner membership',
    security: [{ bearer: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateTenantRequest' } },
      },
    },
  });

  patch('/api/v1/tenants', 'get', {
    summary: 'List tenants (platform permission required)',
    security: [{ bearer: [] }],
  });

  patch('/api/v1/tenants/{tenantId}', 'get', {
    summary: 'Get tenant by ID',
    security: bearerTenantSecurity,
  });

  patch('/api/v1/tenants/{tenantId}/extensions', 'post', {
    summary: 'Create extension with one-time SIP credential secret',
    security: bearerTenantSecurity,
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateExtensionRequest' } },
      },
    },
    responses: {
      '201': {
        description: 'Extension created; SIP secret returned once',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ExtensionCreateResponse' } },
        },
      },
    },
  });

  patch('/api/v1/tenants/{tenantId}/extensions', 'get', {
    summary: 'List extensions without SIP secrets',
    security: bearerTenantSecurity,
  });

  patch('/api/v1/tenants/{tenantId}/extensions/{extensionId}', 'get', {
    summary: 'Get extension metadata without SIP secret',
    security: bearerTenantSecurity,
    responses: {
      '200': {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ExtensionReadResponse' } },
        },
      },
    },
  });

  patch('/api/v1/health/ready', 'get', {
    summary: 'Readiness probe — fails when required dependencies are unavailable',
    responses: {
      '200': {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessResponse' } } },
      },
      '503': {
        description: 'Required dependency unavailable',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessResponse' } } },
      },
    },
  });

  patch('/api/v1/health/live', 'get', {
    summary: 'Liveness probe — process alive',
    responses: {
      '200': { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'healthy' } } } } } },
    },
  });

  document.paths ??= {};
  const aiSecurity = bearerTenantSecurity;
  const aiPaths: Record<string, Record<string, unknown>> = {
    '/api/v1/ai/provider-connections': {
      post: {
        summary: 'Create AI provider connection (credentials stored encrypted; external verification NOT_TESTED)',
        security: aiSecurity,
        tags: ['AI'],
      },
      get: {
        summary: 'List AI provider connections (no credential secrets returned)',
        security: aiSecurity,
        tags: ['AI'],
      },
    },
    '/api/v1/ai/provider-connections/{id}': {
      get: { summary: 'Get AI provider connection', security: aiSecurity, tags: ['AI'] },
      patch: { summary: 'Update AI provider connection', security: aiSecurity, tags: ['AI'] },
      delete: { summary: 'Disable AI provider connection', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/provider-connections/{id}/test': {
      post: {
        summary: 'External validation deferred — returns NOT_TESTED',
        security: aiSecurity,
        tags: ['AI'],
      },
    },
    '/api/v1/ai/agents': {
      post: { summary: 'Create AI agent with immutable version 1', security: aiSecurity, tags: ['AI'] },
      get: { summary: 'List AI agents', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/agents/{id}': {
      get: { summary: 'Get AI agent', security: aiSecurity, tags: ['AI'] },
      patch: { summary: 'Update AI agent (creates new version when config changes)', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/agents/{id}/activate': {
      post: { summary: 'Activate AI agent route', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/agents/{id}/disable': {
      post: { summary: 'Disable AI agent', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/agents/{id}/versions': {
      get: { summary: 'List immutable AI agent versions', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/sessions': {
      get: { summary: 'List AI sessions', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/sessions/{id}': {
      get: { summary: 'Get AI session', security: aiSecurity, tags: ['AI'] },
    },
    '/api/v1/ai/sessions/{id}/diagnostics': {
      get: { summary: 'Get AI session diagnostics', security: aiSecurity, tags: ['AI'] },
    },
  };
  for (const [path, methods] of Object.entries(aiPaths)) {
    document.paths[path] = { ...document.paths[path], ...methods };
  }

  const billingSecurity = bearerTenantSecurity;
  const billingPaths: Record<string, Record<string, unknown>> = {
    '/api/v1/plans': {
      get: { summary: 'List subscription plans', security: [{ bearer: [] }], tags: ['Billing'] },
      post: { summary: 'Create plan (platform billing admin)', security: [{ bearer: [] }], tags: ['Billing'] },
    },
    '/api/v1/plans/{id}': {
      get: { summary: 'Get plan with entitlements', security: [{ bearer: [] }], tags: ['Billing'] },
      patch: { summary: 'Update plan', security: [{ bearer: [] }], tags: ['Billing'] },
    },
    '/api/v1/prices': {
      get: { summary: 'List versioned meter prices', security: [{ bearer: [] }], tags: ['Billing'] },
      post: { summary: 'Create price version', security: [{ bearer: [] }], tags: ['Billing'] },
    },
    '/api/v1/prices/{id}': {
      get: { summary: 'Get price', security: [{ bearer: [] }], tags: ['Billing'] },
      patch: { summary: 'Update price (creates new version when unit amount changes)', security: [{ bearer: [] }], tags: ['Billing'] },
    },
    '/api/v1/usage': {
      get: { summary: 'List normalized usage events', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/rated-usage': {
      get: { summary: 'List rated usage with meter metadata', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/billing/rate': {
      post: { summary: 'Run rating pipeline for tenant (idempotent)', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/credits': {
      get: { summary: 'List append-only credit ledger entries', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/credits/adjustments': {
      post: {
        summary: 'Apply manual credit or debit adjustment (Idempotency-Key supported)',
        security: billingSecurity,
        tags: ['Billing'],
      },
    },
    '/api/v1/invoices': {
      get: { summary: 'List tenant invoices', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/invoices/preview': {
      post: {
        summary: 'Preview invoice for billing period (Stripe DISABLED)',
        security: billingSecurity,
        tags: ['Billing'],
      },
    },
    '/api/v1/invoices/generate': {
      post: {
        summary: 'Generate draft invoice with idempotency key',
        security: billingSecurity,
        tags: ['Billing'],
      },
    },
    '/api/v1/invoices/{id}': {
      get: { summary: 'Get invoice with immutable line snapshots', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/invoices/{id}/finalize': {
      post: { summary: 'Finalize invoice and apply credits', security: billingSecurity, tags: ['Billing'] },
    },
    '/api/v1/invoices/{id}/void': {
      post: { summary: 'Void draft or finalized invoice (not paid)', security: billingSecurity, tags: ['Billing'] },
    },
  };
  for (const [path, methods] of Object.entries(billingPaths)) {
    document.paths[path] = { ...document.paths[path], ...methods };
  }

  document.components!.securitySchemes!.apiKeyAuth = {
    type: 'http',
    scheme: 'bearer',
    description: 'Tenant API key: Authorization: Bearer pbx_live_<prefix>_<secret>',
  };

  const sliceFPaths: Record<string, Record<string, unknown>> = {
    '/api/v1/api-applications': {
      get: { summary: 'List API applications', security: bearerTenantSecurity, tags: ['API Keys'] },
      post: { summary: 'Create API application', security: bearerTenantSecurity, tags: ['API Keys'] },
    },
    '/api/v1/api-applications/{id}': {
      get: { summary: 'Get API application', security: bearerTenantSecurity, tags: ['API Keys'] },
      patch: { summary: 'Update API application', security: bearerTenantSecurity, tags: ['API Keys'] },
      delete: { summary: 'Delete API application', security: bearerTenantSecurity, tags: ['API Keys'] },
    },
    '/api/v1/api-applications/{id}/keys': {
      get: { summary: 'List API keys (no secrets)', security: bearerTenantSecurity, tags: ['API Keys'] },
      post: { summary: 'Create API key — secret returned once', security: bearerTenantSecurity, tags: ['API Keys'] },
    },
    '/api/v1/api-applications/{id}/keys/{keyId}/rotate': {
      post: {
        summary: 'Rotate API key (Idempotency-Key supported)',
        security: bearerTenantSecurity,
        tags: ['API Keys'],
      },
    },
    '/api/v1/api-applications/{id}/keys/{keyId}/revoke': {
      post: { summary: 'Revoke API key', security: bearerTenantSecurity, tags: ['API Keys'] },
    },
    '/api/v1/webhooks': {
      get: { summary: 'List webhook endpoints', security: bearerTenantSecurity, tags: ['Webhooks'] },
      post: {
        summary: 'Create webhook endpoint — signing secret returned once',
        security: bearerTenantSecurity,
        tags: ['Webhooks'],
      },
    },
    '/api/v1/webhooks/{id}': {
      get: { summary: 'Get webhook endpoint', security: bearerTenantSecurity, tags: ['Webhooks'] },
      patch: { summary: 'Update webhook endpoint', security: bearerTenantSecurity, tags: ['Webhooks'] },
      delete: { summary: 'Delete webhook endpoint', security: bearerTenantSecurity, tags: ['Webhooks'] },
    },
    '/api/v1/webhooks/{id}/rotate-secret': {
      post: { summary: 'Rotate webhook signing secret', security: bearerTenantSecurity, tags: ['Webhooks'] },
    },
    '/api/v1/webhooks/{id}/deliveries': {
      get: { summary: 'List webhook deliveries', security: bearerTenantSecurity, tags: ['Webhooks'] },
    },
    '/api/v1/webhooks/{id}/deliveries/{deliveryId}': {
      get: { summary: 'Get webhook delivery', security: bearerTenantSecurity, tags: ['Webhooks'] },
    },
    '/api/v1/webhooks/{id}/deliveries/{deliveryId}/redeliver': {
      post: {
        summary: 'Manual redelivery (Idempotency-Key supported)',
        security: bearerTenantSecurity,
        tags: ['Webhooks'],
      },
    },
    '/api/v1/platform/integrations': {
      get: { summary: 'List platform integrations (no secrets)', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
      post: { summary: 'Create platform integration — secrets encrypted, never returned on read', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/audit': {
      get: { summary: 'Integration audit history', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/credential-status': {
      get: { summary: 'Resolve credential configuration status without secrets', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}': {
      get: { summary: 'Get platform integration', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
      patch: { summary: 'Update platform integration — blank secret fields preserve existing', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/replace-credential': {
      post: { summary: 'Replace integration credential (requires confirmReplace)', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/rotate': {
      post: { summary: 'Rotate integration credential', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/enable': {
      post: { summary: 'Enable integration', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/disable': {
      post: { summary: 'Disable integration', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/validate': {
      post: { summary: 'Validate integration connection', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/audit': {
      get: { summary: 'Integration audit events', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/assignments': {
      get: { summary: 'List tenant assignments', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
      post: { summary: 'Assign integration to tenant', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
    '/api/v1/platform/integrations/{id}/assignments/{assignmentId}': {
      delete: { summary: 'Remove tenant assignment', security: bearerPlatformSecurity, tags: ['Platform Integrations'] },
    },
  };
  for (const [path, methods] of Object.entries(sliceFPaths)) {
    document.paths[path] = { ...document.paths[path], ...methods };
  }

  document.components!.schemas!.WebhookEventEnvelope = {
    type: 'object',
    required: ['id', 'type', 'apiVersion', 'tenantId', 'createdAt', 'data'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string', example: 'call.completed' },
      apiVersion: { type: 'string', example: 'v1' },
      tenantId: { type: 'string', format: 'uuid' },
      createdAt: { type: 'string', format: 'date-time' },
      correlationId: { type: 'string', format: 'uuid' },
      data: { type: 'object' },
    },
  };

  document.components!.schemas!.RateLimitedResponse = {
    allOf: [{ $ref: '#/components/schemas/ErrorResponse' }],
    description: '429 with Retry-After header when rate limited',
  };

  document.components!.schemas!.InvoicePreview = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'PREVIEW' },
      subtotal: { type: 'string', example: '29.00' },
      tax: { type: 'string', example: '5.80' },
      creditApplied: { type: 'string', example: '0.00' },
      total: { type: 'string', example: '34.80' },
      currency: { type: 'string', example: 'USD' },
      metadata: {
        type: 'object',
        properties: {
          stripeStatus: { type: 'string', enum: ['DISABLED'], example: 'DISABLED' },
          providerCostStatus: { type: 'string', enum: ['UNAVAILABLE'], example: 'UNAVAILABLE' },
          lateUsagePolicy: { type: 'string' },
        },
      },
    },
  };

  document.components!.schemas!.AiProviderConnection = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      providerType: { type: 'string', enum: ['openai', 'gemini', 'azure_openai', 'anthropic', 'custom', 'deterministic-test'] },
      externalValidationStatus: { type: 'string', enum: ['NOT_TESTED'], example: 'NOT_TESTED' },
      configured: { type: 'boolean' },
      enabled: { type: 'boolean' },
    },
  };

  document.components!.schemas!.IntegrationConnection = {
    type: 'object',
    description: 'Platform integration connection — secrets never returned on read',
    properties: {
      id: { type: 'string', format: 'uuid' },
      integrationType: { type: 'string', enum: ['ai', 'sip_carrier', 'stripe'] },
      provider: { type: 'string' },
      scopeType: { type: 'string', enum: ['platform', 'tenant'] },
      environment: { type: 'string', enum: ['default', 'test', 'live'] },
      displayName: { type: 'string' },
      enabled: { type: 'boolean' },
      isDefault: { type: 'boolean' },
      credentialConfigured: { type: 'boolean', description: 'True when encrypted credential exists' },
      credentialVersion: { type: 'integer' },
      validationStatus: {
        type: 'string',
        enum: ['NOT_CONFIGURED', 'CONFIGURED_NOT_TESTED', 'VALID', 'INVALID', 'DISABLED', 'ROTATION_REQUIRED'],
      },
      lastValidatedAt: { type: 'string', format: 'date-time', nullable: true },
      sanitizedValidationError: { type: 'string', nullable: true },
      tenantAssignmentCount: { type: 'integer' },
    },
  };

  return normalizeApiPaths(document);
}

function normalizeApiPaths(document: OpenAPIObject): OpenAPIObject {
  const merged: NonNullable<OpenAPIObject['paths']> = {};
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    const key = path.startsWith('/api/v1') ? path : `/api/v1${path}`;
    merged[key] = { ...(merged[key] ?? {}), ...item };
  }
  document.paths = merged;
  return document;
}

export function setupOpenApi(app: NestFastifyApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PBX Platform API')
    .setDescription(
      'Multi-tenant virtual PBX control plane API. Tenant-scoped routes require Bearer JWT and X-Tenant-Id header.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-Id', in: 'header' }, 'tenant')
    .build();

  const document = enrichOpenApiDocument(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('api/v1/openapi', app, document);

  const root = dirname(fileURLToPath(import.meta.url));
  const outDir = join(root, '..', 'openapi');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'openapi.json'), JSON.stringify(document, null, 2));
}
