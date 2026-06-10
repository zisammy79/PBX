'use client';

import { IntegrationTypePage } from '@/components/integration-manager';

export default function PlatformSipIntegrationsPage() {
  return (
    <IntegrationTypePage
      title="SIP Carriers"
      description="Configure platform SIP carrier profiles assignable to tenants."
      integrationType="sip_carrier"
      providerDefault="generic"
      warnings={['A live carrier test may create call charges.']}
      fields={[
        { key: 'username', label: 'SIP username', secret: true },
        { key: 'password', label: 'SIP password', secret: true },
        { key: 'registrar', label: 'Registrar' },
        { key: 'outboundProxy', label: 'Outbound proxy' },
        { key: 'authMode', label: 'Auth mode', placeholder: 'registration' },
        { key: 'transport', label: 'Transport', placeholder: 'udp' },
        { key: 'assignedDid', label: 'Assigned DID' },
        { key: 'allowedCallerId', label: 'Allowed caller ID' },
      ]}
    />
  );
}
