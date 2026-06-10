'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  canManageBilling,
  canReadBilling,
  hasPermission,
  isPlatformAdmin,
} from '@/lib/permissions';
import { Permission } from '@pbx/contracts';

type NavItem = { href: string; label: string; show?: boolean };

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tid = tenantId ?? activeTenantId ?? undefined;

  const tenantNav: NavItem[] = [
    { href: `/t/${tid}/dashboard`, label: 'Dashboard', show: !!tid },
    { href: `/t/${tid}/extensions`, label: 'Extensions', show: !!tid },
    { href: `/t/${tid}/calls`, label: 'Calls', show: !!tid },
    { href: `/t/${tid}/health`, label: 'Health', show: !!tid },
    {
      href: `/t/${tid}/ai/providers`,
      label: 'AI Providers',
      show: !!tid && hasPermission(user, Permission.AI_PROVIDER_CONNECTIONS_READ),
    },
    {
      href: `/t/${tid}/ai/agents`,
      label: 'AI Agents',
      show: !!tid && hasPermission(user, Permission.AI_AGENTS_READ),
    },
    {
      href: `/t/${tid}/ai/sessions`,
      label: 'AI Sessions',
      show: !!tid && hasPermission(user, Permission.AI_SESSIONS_READ),
    },
    {
      href: `/t/${tid}/ai/tools`,
      label: 'AI Tools',
      show: !!tid && hasPermission(user, Permission.AI_AGENTS_MANAGE),
    },
    {
      href: `/t/${tid}/billing/usage`,
      label: 'Usage',
      show: !!tid && hasPermission(user, Permission.TENANT_USAGE_READ),
    },
    {
      href: `/t/${tid}/billing/invoices`,
      label: 'Invoices',
      show: !!tid && canReadBilling(user),
    },
    {
      href: `/t/${tid}/billing/plan`,
      label: 'Plan',
      show: !!tid && canReadBilling(user),
    },
    {
      href: `/t/${tid}/billing/credits`,
      label: 'Credits',
      show: !!tid && canManageBilling(user),
    },
    {
      href: `/t/${tid}/developers/applications`,
      label: 'API Applications',
      show: !!tid && hasPermission(user, Permission.TENANT_APIKEY_MANAGE),
    },
    {
      href: `/t/${tid}/developers/webhooks`,
      label: 'Webhooks',
      show: !!tid && hasPermission(user, Permission.TENANT_WEBHOOK_MANAGE),
    },
  ];

  const platformNav: NavItem[] = [
    { href: '/platform/dashboard', label: 'Dashboard', show: isPlatformAdmin(user) },
    { href: '/platform/tenants', label: 'Tenants', show: isPlatformAdmin(user) },
    { href: '/platform/billing/plans', label: 'Plans', show: isPlatformAdmin(user) },
    { href: '/platform/billing/prices', label: 'Prices', show: isPlatformAdmin(user) },
    { href: '/platform/health', label: 'Health', show: isPlatformAdmin(user) },
  ];

  const nav = mode === 'platform' ? platformNav : tenantNav;

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        className="app-sidebar"
        aria-label="Primary navigation"
        data-collapsed={sidebarOpen ? 'false' : 'true'}
        style={{
          width: 'var(--sidebar-width)',
          background: '#101828',
          color: '#fff',
          padding: '1rem 0.75rem',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '0 0.75rem 1rem', fontWeight: 700 }}>PBX Platform</div>
        <button
          type="button"
          className="btn btn-secondary sidebar-toggle"
          aria-expanded={sidebarOpen}
          aria-controls="primary-nav"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? 'Hide menu' : 'Show menu'}
        </button>
        {mode === 'tenant' && user && user.tenantMemberships.length > 1 && (
          <div className="sidebar-extra" style={{ padding: '0 0.75rem 1rem' }}>
            <label htmlFor="tenant-select" className="label" style={{ color: '#cbd5e1' }}>
              Tenant
            </label>
            <select
              id="tenant-select"
              className="select"
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
        <nav id="primary-nav">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {nav
              .filter((item) => item.show !== false)
              .map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      style={{
                        display: 'block',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '6px',
                        color: active ? '#fff' : '#cbd5e1',
                        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                        textDecoration: 'none',
                        marginBottom: '0.15rem',
                      }}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
        {isPlatformAdmin(user) && mode === 'tenant' && (
          <div className="sidebar-extra" style={{ marginTop: '1rem', padding: '0 0.75rem' }}>
            <Link href="/platform/dashboard" className="btn btn-secondary" style={{ width: '100%' }}>
              Platform admin
            </Link>
          </div>
        )}
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          style={{
            height: 'var(--header-height)',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 1rem',
          }}
        >
          <div className="muted">{user?.email}</div>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header style={{ marginBottom: '1rem' }}>
      <h1 style={{ margin: 0 }}>{title}</h1>
      {description ? <p className="muted" style={{ marginTop: '0.35rem' }}>{description}</p> : null}
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
  return (
    <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
      {demoAi ? (
        <div className="alert alert-info" role="status">
          Demo AI mode — deterministic local provider
        </div>
      ) : null}
      {externalAi ? (
        <div className="alert alert-warning" role="status">
          External AI verification — Not tested
        </div>
      ) : null}
      {stripe ? (
        <div className="alert alert-info" role="status">
          Payment integration — Disabled
        </div>
      ) : null}
      {providerCost ? (
        <div className="alert alert-info" role="status">
          Provider cost — Unavailable
        </div>
      ) : null}
      {pstn ? (
        <div className="alert alert-info" role="status">
          PSTN verification — Not performed
        </div>
      ) : null}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div aria-busy="true" aria-live="polite">
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
