'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import en from '../messages/en.json';
import he from '../messages/he.json';
import fr from '../messages/fr.json';

export type Locale = 'en' | 'he' | 'fr';

type Messages = typeof en;

const catalogs: Record<Locale, Messages> = { en, he, fr };

const STORAGE_KEY = 'pbx.ui.locale';

type I18nContextValue = {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(messages: Messages, path: string): string {
  const parts = path.split('.');
  let cur: unknown = messages;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return path;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : path;
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'he' || raw === 'fr' || raw === 'en') return raw;
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: locale === 'he' ? 'rtl' : 'ltr',
      setLocale,
      t: (path: string) => lookup(catalogs[locale] ?? en, path),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];
