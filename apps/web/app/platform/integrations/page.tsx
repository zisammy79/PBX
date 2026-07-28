'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type IntegrationCard = {
  href: string;
  title: string;
  desc: string;
  providers?: string;
};

type IntegrationSection = {
  title: string;
  cards: IntegrationCard[];
};

export default function IntegrationsOverviewPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Array<Record<string, unknown>>>('platform/integrations')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!rows) return <LoadingBlock />;

  const sections: IntegrationSection[] = [
    {
      title: 'Recording & cloud backup',
      cards: [
        {
          href: '/platform/integrations/cloud-storage',
          title: 'Google Drive & OneDrive',
          providers: 'Google · Microsoft',
          desc: 'One-time OAuth app setup so each tenant can connect their own account for recording backup',
        },
      ],
    },
    {
      title: 'Telephony & PSTN',
      cards: [
        {
          href: '/platform/integrations/twilio',
          title: 'Twilio Elastic SIP',
          providers: 'Twilio',
          desc: 'Production trunk sync, origination URLs, test DID, and IL number provisioning',
        },
        {
          href: '/platform/integrations/phone-numbers',
          title: 'Phone Numbers',
          providers: 'Twilio',
          desc: 'Search, purchase, assign, and release PSTN numbers across tenants',
        },
        {
          href: '/platform/integrations/sip-carriers',
          title: 'SIP Carriers',
          desc: 'Platform carrier profiles and tenant trunk assignments',
        },
      ],
    },
    {
      title: 'AI & automation',
      cards: [
        {
          href: '/platform/integrations/ai',
          title: 'AI Providers',
          providers: 'OpenAI · Gemini · Azure · Anthropic',
          desc: 'Platform AI credentials and tenant assignments',
        },
      ],
    },
    {
      title: 'Billing & payments',
      cards: [
        {
          href: '/platform/integrations/stripe',
          title: 'Stripe',
          providers: 'Stripe',
          desc: 'Test and live payment credentials',
        },
      ],
    },
    {
      title: 'Administration',
      cards: [
        {
          href: '/platform/integrations/audit',
          title: 'Audit History',
          desc: 'Credential lifecycle and integration audit events',
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Integrations"
        description="All external service connections for the platform — telephony, cloud storage, AI, billing, and carriers."
      />
      <div className="alert alert-info" role="note">
        Integration credentials are encrypted and cannot be viewed after saving. Tenants configure their own Google
        Drive / OneDrive backup under <strong>Cloud backup</strong> in the tenant menu.
      </div>
      {sections.map((section) => (
        <section key={section.title} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>{section.title}</h2>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            {section.cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="card"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{card.title}</h3>
                {card.providers ? (
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>{card.providers}</p>
                ) : null}
                <p style={{ margin: 0 }}>{card.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <div className="table-wrap card">
        <h2>Configured credential integrations</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Provider</th>
              <th>Scope</th>
              <th>Status</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>{String(row.displayName)}</td>
                <td>{String(row.integrationType)}</td>
                <td>{String(row.provider)}</td>
                <td>{String(row.scopeType)}</td>
                <td>{row.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>{String(row.validationStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
