'use client';

import { IntegrationTypePage } from '@/components/integration-manager';

export default function PlatformAiIntegrationsPage() {
  return (
    <IntegrationTypePage
      title="AI Providers"
      description="Configure platform-wide AI provider credentials. Tenant-specific credentials take precedence."
      integrationType="ai"
      providerDefault="openai"
      warnings={['This credential may be used by multiple tenants. Tenant-specific credentials take precedence.']}
      fields={[
        { key: 'apiKey', label: 'API key', secret: true },
        { key: 'model', label: 'Realtime model' },
        { key: 'voice', label: 'Voice' },
        { key: 'realtimeUrl', label: 'Realtime base URL' },
        { key: 'organizationId', label: 'Organization ID' },
        { key: 'projectId', label: 'Project ID' },
        { key: 'region', label: 'Region' },
      ]}
    />
  );
}
