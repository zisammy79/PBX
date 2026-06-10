'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { externalValidationLabel } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function AiProviderDetailPage() {
  const { tenantId, providerId } = useParams<{ tenantId: string; providerId: string }>();
  const [provider, setProvider] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get(`ai/provider-connections/${providerId}`, tenantId)
      .then((row) => setProvider(row as Record<string, unknown>))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load provider'));
  }, [tenantId, providerId]);

  if (error) return <ErrorAlert message={error} />;
  if (!provider) return <LoadingBlock />;

  return (
    <>
      <PageHeader title={String(provider.name)} description={`Type: ${String(provider.providerType)}`} />
      <StatusBanner externalAi />
      <div className="card">
        <p>{externalValidationLabel(String(provider.externalValidationStatus))}</p>
        <p>Status: {provider.isActive ? 'Enabled' : 'Disabled'}</p>
        <p className="muted">Stored credentials are never displayed after submission.</p>
        <p>Credential version: {String(provider.credentialKeyVersion ?? '—')}</p>
      </div>
    </>
  );
}
