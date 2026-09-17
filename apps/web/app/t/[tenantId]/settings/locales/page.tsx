'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { LOCALE_OPTIONS, useI18n, type Locale } from '@/lib/i18n';
import { ErrorAlert, PageHeader } from '@/components/app-shell';

type LocaleSettings = {
  enabledLocales: string[];
  defaultLocale: string;
};

export default function TenantLocalesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t, setLocale } = useI18n();
  const [settings, setSettings] = useState<LocaleSettings>({
    enabledLocales: ['he', 'en', 'fr'],
    defaultLocale: 'he',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<LocaleSettings>(`tenants/${tenantId}/locales`, tenantId)
      .then((row) => setSettings(row))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [tenantId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const saved = await api.patch<LocaleSettings>(`tenants/${tenantId}/locales`, settings, tenantId);
      setSettings(saved);
      if (saved.defaultLocale === 'he' || saved.defaultLocale === 'en' || saved.defaultLocale === 'fr') {
        setLocale(saved.defaultLocale as Locale);
      }
      setMessage(t('locales.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  function toggleLocale(code: string) {
    setSettings((prev) => {
      const enabled = prev.enabledLocales.includes(code)
        ? prev.enabledLocales.filter((x) => x !== code)
        : [...prev.enabledLocales, code];
      const defaultLocale = enabled.includes(prev.defaultLocale) ? prev.defaultLocale : enabled[0] ?? 'en';
      return { enabledLocales: enabled, defaultLocale };
    });
  }

  return (
    <div>
      <PageHeader title={t('locales.title')} />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <div className="alert alert-success" role="status">{message}</div> : null}
      <form className="card" onSubmit={onSave} style={{ display: 'grid', gap: '1rem', maxWidth: 480 }}>
        <fieldset>
          <legend>{t('locales.enabledLocales')}</legend>
          {LOCALE_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={settings.enabledLocales.includes(opt.value)}
                onChange={() => toggleLocale(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
        <label className="label">
          {t('locales.defaultLocale')}
          <select
            className="select"
            value={settings.defaultLocale}
            onChange={(e) => setSettings((s) => ({ ...s, defaultLocale: e.target.value }))}
          >
            {settings.enabledLocales.map((code) => (
              <option key={code} value={code}>
                {LOCALE_OPTIONS.find((o) => o.value === code)?.label ?? code}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          {t('callflow.save')}
        </button>
      </form>
    </div>
  );
}
