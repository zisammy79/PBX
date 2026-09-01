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
  const [showCredentials, setShowCredentials] = useState(false);

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
      title: 'Recording & backup',
      cards: [
        {
          href: '/platform/integrations/cloud-storage',
          title: 'Google Drive & OneDrive',
          providers: 'Google · Microsoft',
          desc: 'OAuth setup so tenants connect their own accounts for recording backup',
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
          desc: 'Trunk sync, origination URLs, and IL number provisioning',
        },
        {
          href: '/platform/integrations/phone-numbers',
          title: 'Phone numbers',
          providers: 'Twilio',
          desc: 'Search, purchase, assign, and release numbers',
        },
        {
          href: '/platform/integrations/sip-carriers',
          title: 'SIP carriers',
          desc: 'Carrier profiles and tenant trunk assignments',
        },
      ],
    },
    {
      title: 'AI & billing',
      cards: [
        {
          href: '/platform/integrations/ai',
          title: 'AI providers',
          providers: 'OpenAI · Gemini · Azure',
          desc: 'Platform credentials and tenant assignments',
        },
        {
          href: '/platform/integrations/stripe',
          title: 'Stripe',
          providers: 'Stripe',
          desc: 'Payment credentials',
        },
        {
          href: '/platform/integrations/audit',
          title: 'Audit history',
          desc: 'Credential lifecycle and integration events',
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect external services — telephony, cloud backup, AI, and billing."
      />

      {sections.map((section) => (
        <section key={section.title} className="section-card">
          <h2 className="section-heading">{section.title}</h2>
          <div className="integration-grid">
            {section.cards.map((card) => (
              <Link key={card.href} href={card.href} className="card integration-card">
                <h3>{card.title}</h3>
                {card.providers ? <p className="integration-card-providers">{card.providers}</p> : null}
                <p className="integration-card-desc">{card.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="card section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Stored credentials</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCredentials((v) => !v)}
          >
            {showCredentials ? 'Hide' : 'Show'} ({rows.length})
          </button>
        </div>
        {showCredentials ? (
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Scope</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.displayName)}</td>
                    <td>{String(row.integrationType)}</td>
                    <td>{String(row.provider)}</td>
                    <td>{String(row.scopeType)}</td>
                    <td>
                      {row.enabled ? 'Enabled' : 'Disabled'}
                      <span className="muted"> · {String(row.validationStatus)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            Encrypted integration credentials. Tenants manage their own cloud backup under Settings.
          </p>
        )}
      </section>
    </>
  );
}
