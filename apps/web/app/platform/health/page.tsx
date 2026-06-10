'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function PlatformHealthPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get('health/ready')
      .then((res) => setHealth(res as Record<string, unknown>))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load health'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!health) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Platform health" description="Dependency readiness and degradation status." />
      <div className="card">
        <p>Status: {String(health.status)}</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(health.dependencies, null, 2)}</pre>
      </div>
    </>
  );
}
