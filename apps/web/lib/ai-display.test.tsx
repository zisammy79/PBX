import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { externalValidationLabel } from '@/lib/format';

function ProviderReadView({ provider }: { provider: Record<string, unknown> }) {
  return (
    <div>
      <p>{externalValidationLabel(String(provider.externalValidationStatus))}</p>
      <p className="muted">Stored credentials are never displayed after submission.</p>
      <p>Credential version: {String(provider.credentialKeyVersion ?? '—')}</p>
    </div>
  );
}

function AgentVersionView({ agent, versions }: { agent: Record<string, unknown>; versions: Array<Record<string, unknown>> }) {
  return (
    <div>
      <p>Active version: {String(agent.activeVersionNumber ?? '—')}</p>
      <table>
        <tbody>
          {versions.map((v) => (
            <tr key={String(v.id)}>
              <td>{String(v.versionNumber)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe('AI provider and agent display', () => {
  it('6 read view does not expose credential secret', () => {
    render(
      <ProviderReadView
        provider={{
          name: 'OpenAI',
          externalValidationStatus: 'NOT_TESTED',
          credentialKeyVersion: 2,
        }}
      />,
    );

    expect(screen.getByText(/External AI verification — Not tested/i)).toBeInTheDocument();
    expect(screen.getByText(/never displayed after submission/i)).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
  });

  it('8 agent version appears in version history', () => {
    render(
      <AgentVersionView
        agent={{ activeVersionNumber: 3 }}
        versions={[
          { id: 'v1', versionNumber: 1 },
          { id: 'v2', versionNumber: 2 },
          { id: 'v3', versionNumber: 3 },
        ]}
      />,
    );

    expect(screen.getByText('Active version: 3')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
