'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

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

  const cards = [
    { href: '/platform/integrations/ai', title: 'AI Providers', desc: 'OpenAI, Gemini, Azure OpenAI, Anthropic, custom' },
    { href: '/platform/integrations/sip-carriers', title: 'SIP Carriers', desc: 'Platform carrier profiles and tenant assignments' },
    { href: '/platform/integrations/stripe', title: 'Stripe', desc: 'Test and live payment credentials' },
    { href: '/platform/integrations/audit', title: 'Audit History', desc: 'Credential lifecycle audit events' },
  ];

  return (
    <>
      <PageHeader title="Integrations" description="Platform Administration → encrypted external integration credentials." />
      <div className="alert alert-info" role="note">
        Integration credentials are encrypted and cannot be viewed after saving. Platform bootstrap secrets (database, JWT, encryption master key) remain environment/KMS managed only.
      </div>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '1rem' }}>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="card" style={{ display: 'block', textDecoration: 'none' }}>
            <h2 style={{ marginTop: 0 }}>{card.title}</h2>
            <p>{card.desc}</p>
          </Link>
        ))}
      </div>
      <div className="table-wrap card">
        <h2>Configured integrations</h2>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Provider</th><th>Scope</th><th>Status</th><th>Validation</th></tr></thead>
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
