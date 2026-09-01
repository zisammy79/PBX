import { Permission } from '@pbx/contracts';
import type { SessionUser } from '@/lib/api-client';
import {
  canManageBillingForTenant,
  canReadBillingForTenant,
  hasPermissionForTenant,
  isPlatformAdmin,
} from '@/lib/permissions';

export type NavLink = {
  href: string;
  label: string;
  show?: boolean;
  exact?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavLink[];
};

export function tenantNavGroups(tenantId: string | undefined, user: SessionUser | null): NavGroup[] {
  const tid = tenantId ?? '';
  const can = (permission: Permission) => hasPermissionForTenant(user, permission, tid);

  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { href: `/t/${tid}/dashboard`, label: 'Dashboard', show: !!tid },
        { href: `/t/${tid}/statistics`, label: 'Statistics', show: !!tid },
        { href: `/t/${tid}/health`, label: 'Health', show: !!tid },
      ],
    },
    {
      id: 'telephony',
      label: 'Telephony',
      items: [
        { href: `/t/${tid}/extensions`, label: 'Extensions', show: !!tid },
        { href: `/t/${tid}/numbers`, label: 'My numbers', show: !!tid },
        { href: `/t/${tid}/calls`, label: 'Call records', show: !!tid },
        { href: `/t/${tid}/operator`, label: 'Operator panel', show: !!tid },
        { href: `/t/${tid}/agent`, label: 'Agent panel', show: !!tid },
        { href: `/t/${tid}/status`, label: 'Status', show: !!tid },
        {
          href: `/t/${tid}/users`,
          label: 'Users',
          show: !!tid && can(Permission.TENANT_USER_MANAGE),
        },
      ],
    },
    {
      id: 'ai',
      label: 'AI',
      items: [
        {
          href: `/t/${tid}/ai/providers`,
          label: 'Providers',
          show: !!tid && can(Permission.AI_PROVIDER_CONNECTIONS_READ),
        },
        {
          href: `/t/${tid}/ai/agents`,
          label: 'Agents',
          show: !!tid && can(Permission.AI_AGENTS_READ),
        },
        {
          href: `/t/${tid}/ai/sessions`,
          label: 'Sessions',
          show: !!tid && can(Permission.AI_SESSIONS_READ),
        },
        {
          href: `/t/${tid}/ai/tools`,
          label: 'Tools',
          show: !!tid && can(Permission.AI_AGENTS_MANAGE),
        },
      ],
    },
    {
      id: 'billing',
      label: 'Billing',
      items: [
        {
          href: `/t/${tid}/billing/invoices`,
          label: 'Invoices',
          show: !!tid && canReadBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/billing/plan`,
          label: 'Plan',
          show: !!tid && canReadBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/billing/credits`,
          label: 'Credits',
          show: !!tid && canManageBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/entitlements`,
          label: 'Usage',
          show: !!tid && can(Permission.TENANT_USAGE_READ),
        },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        {
          href: `/t/${tid}/settings/telephony`,
          label: 'Telephony',
          show: !!tid && can(Permission.TENANT_UPDATE),
        },
        {
          href: `/t/${tid}/settings/cloud-storage`,
          label: 'Cloud backup',
          show: !!tid && can(Permission.TENANT_UPDATE),
        },
        {
          href: `/t/${tid}/developers/webhooks`,
          label: 'Webhooks',
          show: !!tid && can(Permission.TENANT_WEBHOOK_MANAGE),
        },
      ],
    },
  ];
}

export function platformNavGroups(user: SessionUser | null): NavGroup[] {
  const admin = isPlatformAdmin(user);
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { href: '/platform/dashboard', label: 'Dashboard', show: admin },
        { href: '/platform/health', label: 'Health', show: admin },
      ],
    },
    {
      id: 'customers',
      label: 'Customers',
      items: [{ href: '/platform/tenants', label: 'Tenants', show: admin }],
    },
    {
      id: 'billing',
      label: 'Billing',
      items: [
        { href: '/platform/billing/plans', label: 'Plans', show: admin },
        { href: '/platform/billing/prices', label: 'Prices', show: admin },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      items: [{ href: '/platform/integrations', label: 'All integrations', show: admin, exact: true }],
    },
  ];
}

export const INTEGRATION_TABS: NavLink[] = [
  { href: '/platform/integrations', label: 'Overview', exact: true },
  { href: '/platform/integrations/cloud-storage', label: 'Cloud backup' },
  { href: '/platform/integrations/twilio', label: 'Twilio' },
  { href: '/platform/integrations/phone-numbers', label: 'Numbers' },
  { href: '/platform/integrations/sip-carriers', label: 'SIP carriers' },
  { href: '/platform/integrations/ai', label: 'AI' },
  { href: '/platform/integrations/stripe', label: 'Stripe' },
  { href: '/platform/integrations/audit', label: 'Audit' },
];

export const TENANT_SETTINGS_TABS = (tenantId: string): NavLink[] => [
  { href: `/t/${tenantId}/settings/telephony`, label: 'Telephony' },
  { href: `/t/${tenantId}/settings/cloud-storage`, label: 'Cloud backup' },
];

export const EXTENSION_TABS = (tenantId: string): NavLink[] => [
  { href: `/t/${tenantId}/extensions`, label: 'Extensions', exact: true },
  { href: `/t/${tenantId}/status`, label: 'Devices' },
];

export const STATISTICS_HUB_LINKS = (tenantId: string) => [
  {
    href: `/t/${tenantId}/statistics/calls`,
    title: 'Call statistics',
    description: 'Inbound, outbound, and local call volumes.',
  },
  {
    href: `/t/${tenantId}/statistics/extensions`,
    title: 'Extension statistics',
    description: 'Registration and extension activity.',
  },
  {
    href: `/t/${tenantId}/statistics/numbers`,
    title: 'DID statistics',
    description: 'Phone numbers and inbound routing.',
  },
  {
    href: `/t/${tenantId}/statistics/live`,
    title: 'Live statistics',
    description: 'Active calls and queue snapshot.',
  },
  {
    href: `/t/${tenantId}/statistics/my`,
    title: 'My statistics',
    description: 'Your personal call activity.',
  },
  {
    href: `/t/${tenantId}/calls`,
    title: 'Call detail records',
    description: 'Search, filter, and export call history.',
  },
];
