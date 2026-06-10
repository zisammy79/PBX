'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBanner } from '@/components/app-shell';

export default function PlanPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get('billing/subscription', tenantId)
      .then((res) => setData(res as Record<string, unknown>))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plan'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const plan = data.plan as Record<string, unknown> | null;
  const subscription = data.subscription as Record<string, unknown> | null;
  const entitlements = (data.entitlements as Array<Record<string, unknown>>) ?? [];

  return (
    <>
      <PageHeader title="Plan & subscription" description="Current plan, allowances, and overage rules." />
      <StatusBanner stripe />
      {!subscription ? (
        <p className="muted">No subscription assigned to this tenant.</p>
      ) : (
        <div className="card">
          <p>Status: {String(subscription.status)}</p>
          {plan ? (
            <>
              <p>Plan: {String(plan.name)}</p>
              <p>Monthly: {formatCurrency(String(plan.monthlyAmount), String(plan.currency ?? data.currency))}</p>
            </>
          ) : null}
          <h2>Included usage</h2>
          <ul>
            {entitlements.map((e) => (
              <li key={String(e.meterName)}>
                {String(e.meterName)}: {String(e.includedQuantity)} {String(e.unit)} included
              </li>
            ))}
          </ul>
          <p className="muted">Overage is billed using configured meter prices after included allowances.</p>
        </div>
      )}
    </>
  );
}
