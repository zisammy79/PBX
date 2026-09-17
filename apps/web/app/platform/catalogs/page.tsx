'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

type LocalePack = { locale: string; label: string; direction: string; version: number };
type HolidayTemplate = { id: string; name: string; timezone: string };

export default function PlatformCatalogsPage() {
  const { t } = useI18n();
  const [packs, setPacks] = useState<LocalePack[]>([]);
  const [holidays, setHolidays] = useState<HolidayTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [p, h] = await Promise.all([
          api.get<LocalePack[]>('platform/catalogs/locale-packs'),
          api.get<HolidayTemplate[]>('platform/catalogs/holiday-templates'),
        ]);
        setPacks(p);
        setHolidays(h);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load catalogs');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader title={t('platform.catalogsTitle')} />
      {error ? <ErrorAlert message={error} /> : null}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <section className="card">
            <h2>{t('platform.localePacks')}</h2>
            <ul>
              {packs.map((p) => (
                <li key={p.locale}>
                  {p.label} ({p.locale}) — {p.direction} — v{p.version}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>{t('platform.holidayTemplates')}</h2>
            {holidays.length === 0 ? (
              <p>{t('callflow.empty')}</p>
            ) : (
              <ul>
                {holidays.map((h) => (
                  <li key={h.id}>
                    {h.name} ({h.timezone})
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
