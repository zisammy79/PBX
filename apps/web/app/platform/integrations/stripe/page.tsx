'use client';

import { IntegrationTypePage } from '@/components/integration-manager';

export default function PlatformStripeIntegrationsPage() {
  return (
    <IntegrationTypePage
      title="Stripe"
      description="Configure Stripe test and live credentials separately. Test mode is labeled in tenant billing UI."
      integrationType="stripe"
      providerDefault="stripe"
      warnings={[
        'Stripe test mode — use sk_test_ keys only in TEST environment.',
        'Enabling live mode can create real financial transactions.',
      ]}
      fields={[
        { key: 'secretKey', label: 'Secret key', secret: true },
        { key: 'publishableKey', label: 'Publishable key' },
        { key: 'webhookSecret', label: 'Webhook signing secret', secret: true },
        { key: 'accountId', label: 'Account ID' },
        { key: 'defaultCurrency', label: 'Default currency', placeholder: 'USD' },
      ]}
    />
  );
}
