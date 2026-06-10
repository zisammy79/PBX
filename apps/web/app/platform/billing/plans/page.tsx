'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Array<Record<string, unknown>>>('plans')
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plans'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!plans) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Plans" description="Platform subscription plans and entitlements." />
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Monthly</th><th>Currency</th></tr></thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={String(plan.id)}>
                <td>{String(plan.name)}</td>
                <td>{String(plan.slug)}</td>
                <td>{String(plan.monthlyAmount ?? '—')}</td>
                <td>{String(plan.currency ?? 'USD')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
