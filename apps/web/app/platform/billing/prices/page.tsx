'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

export default function PlatformPricesPage() {
  const [prices, setPrices] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Array<Record<string, unknown>>>('prices')
      .then(setPrices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load prices'));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!prices) return <LoadingBlock />;

  return (
    <>
      <PageHeader title="Prices" description="Versioned meter prices." />
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Meter</th><th>Unit amount</th><th>Model</th><th>Effective from</th><th>Active</th></tr></thead>
          <tbody>
            {prices.map((price) => (
              <tr key={String(price.id)}>
                <td>{String(price.meterName)}</td>
                <td>{String(price.unitAmount)}</td>
                <td>{String(price.pricingModel ?? 'PER_UNIT')}</td>
                <td>{formatDate(String(price.effectiveFrom))}</td>
                <td>{price.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
