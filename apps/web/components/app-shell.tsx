'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/permissions';
import { platformNavGroups, tenantNavGroups, type NavGroup } from '@/lib/nav-config';
import { api } from '@/lib/api-client';
import { TelephonyTopBar } from '@/components/telephony/top-bar';
import { LOCALE_OPTIONS, useI18n } from '@/lib/i18n';

function NavSections({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  const { t } = useI18n();
  return (
    <>
      {groups.map((group) => {
        const items = group.items.filter((item) => item.show !== false);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="nav-group">
            <div className="nav-group-label">{t(group.labelKey)}</div>
            <ul className="nav-list">
              {items.map((item) => {
                const active =
                  item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={`nav-link${active ? ' nav-link-active' : ''}`}>
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export function AppShell({
  children,
  mode,
  tenantId,
}: {
  children: React.ReactNode;
  mode: 'tenant' | 'platform';
  tenantId?: string;
}) {
  const pathname = usePathname();
  const { user, logout, activeTenantId, setActiveTenantId } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tid = tenantId ?? activeTenantId ?? undefined;
  const [tenantLabel, setTenantLabel] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'tenant' || !tid) {
      setTenantLabel(null);
      return;
    }
    void api
      .get<{ name: string; slug: string }>(`tenants/${tid}`, tid)
      .then((row) => setTenantLabel(row.name || row.slug))
      .catch(() => setTenantLabel(null));
  }, [mode, tid]);

  const navGroups =
    mode === 'platform' ? platformNavGroups(user) : tenantNavGroups(tid, user);

  return (
    <div className="app-layout">
      <aside
        className="app-sidebar"
        aria-label="Primary navigation"
        data-collapsed={sidebarOpen ? 'false' : 'true'}
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-title">
            {mode === 'tenant' ? tenantLabel ?? t('app.brandTenant') : t('app.brandPlatform')}
          </span>
          {mode === 'tenant' && tenantLabel ? (
            <span className="sidebar-brand-sub">{t('app.tenantWorkspace')}</span>
          ) : mode === 'platform' ? (
            <span className="sidebar-brand-sub">{t('app.platformAdmin')}</span>
          ) : null}
        </div>

        <button
          type="button"
          className="btn btn-secondary sidebar-toggle"
          aria-expanded={sidebarOpen}
          aria-controls="primary-nav"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? t('app.hideMenu') : t('app.menu')}
        </button>

        {mode === 'tenant' && user && user.tenantMemberships.length > 1 && (
          <div className="sidebar-extra">
            <label htmlFor="tenant-select" className="label sidebar-label">Switch tenant</label>
            <select
              id="tenant-select"
              className="select sidebar-select"
              value={tid ?? ''}
              onChange={(e) => {
                setActiveTenantId(e.target.value);
                window.location.href = `/t/${e.target.value}/dashboard`;
              }}
            >
              {user.tenantMemberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantId.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>
        )}

        <nav id="primary-nav" className="sidebar-nav">
          <NavSections groups={navGroups} pathname={pathname} />
        </nav>

        {isPlatformAdmin(user) && mode === 'tenant' && (
          <div className="sidebar-footer">
            <Link href="/platform/dashboard" className="btn btn-secondary btn-block">
              Platform admin
            </Link>
          </div>
        )}
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header-user">{user?.email}</div>
          <label className="label" htmlFor="ui-locale" style={{ margin: 0 }}>
            {t('app.language')}
          </label>
          <select
            id="ui-locale"
            className="select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'he' | 'fr')}
            aria-label={t('app.language')}
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void logout()}>
            {t('app.logout')}
          </button>
        </header>
        <main className="app-content">
          {mode === 'tenant' ? <TelephonyTopBar /> : null}
          <div className="page-container">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-body">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function StatusBanner({
  externalAi,
  demoAi,
  stripe,
  providerCost,
  pstn,
}: {
  externalAi?: boolean;
  demoAi?: boolean;
  stripe?: boolean;
  providerCost?: boolean;
  pstn?: boolean;
}) {
  const items: string[] = [];
  if (demoAi) items.push('Demo AI mode');
  if (externalAi) items.push('External AI not verified');
  if (stripe) items.push('Payments disabled');
  if (providerCost) items.push('Provider cost unavailable');
  if (pstn) items.push('PSTN not verified');
  if (items.length === 0) return null;

  return (
    <div className="status-strip" role="status">
      {items.map((item) => (
        <span key={item} className="status-strip-item">{item}</span>
      ))}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div aria-busy="true" aria-live="polite" className="loading-block">
      <div className="skeleton" style={{ height: '2rem', marginBottom: '0.75rem' }} />
      <div className="skeleton" style={{ height: '6rem' }} />
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state card">
      <p>{title}</p>
      {action}
    </div>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="alert alert-danger" role="alert">
      {message}
    </div>
  );
}
