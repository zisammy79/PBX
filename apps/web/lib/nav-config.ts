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
  labelKey: string;
  show?: boolean;
  exact?: boolean;
};

/** Secondary tab strips use literal labels (often already localized upstream). */
export type SubNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export type NavGroup = {
  id: string;
  labelKey: string;
  items: NavLink[];
};

export function tenantNavGroups(tenantId: string | undefined, user: SessionUser | null): NavGroup[] {
  const tid = tenantId ?? '';
  const can = (permission: Permission) => hasPermissionForTenant(user, permission, tid);

  return [
    {
      id: 'overview',
      labelKey: 'nav.overview',
      items: [
        { href: `/t/${tid}/dashboard`, labelKey: 'nav.dashboard', show: !!tid },
        { href: `/t/${tid}/statistics`, labelKey: 'nav.statistics', show: !!tid },
        { href: `/t/${tid}/health`, labelKey: 'nav.health', show: !!tid },
      ],
    },
    {
      id: 'telephony',
      labelKey: 'nav.telephony',
      items: [
        { href: `/t/${tid}/extensions`, labelKey: 'nav.extensions', show: !!tid },
        { href: `/t/${tid}/numbers`, labelKey: 'nav.numbers', show: !!tid },
        { href: `/t/${tid}/calls`, labelKey: 'nav.calls', show: !!tid },
        { href: `/t/${tid}/operator`, labelKey: 'nav.operator', show: !!tid },
        { href: `/t/${tid}/agent`, labelKey: 'nav.agent', show: !!tid },
        { href: `/t/${tid}/status`, labelKey: 'nav.status', show: !!tid },
        {
          href: `/t/${tid}/users`,
          labelKey: 'nav.users',
          show: !!tid && can(Permission.TENANT_USER_MANAGE),
        },
      ],
    },
    {
      id: 'callflows',
      labelKey: 'nav.callFlows',
      items: [
        {
          href: `/t/${tid}/callflows/schedules`,
          labelKey: 'nav.schedules',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/ivrs`,
          labelKey: 'nav.ivrs',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/hunt-groups`,
          labelKey: 'nav.huntGroups',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/queues`,
          labelKey: 'nav.queues',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/conferences`,
          labelKey: 'nav.conferences',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/paging`,
          labelKey: 'nav.paging',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/feature-codes`,
          labelKey: 'nav.featureCodes',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/custom-destinations`,
          labelKey: 'nav.customDestinations',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/short-numbers`,
          labelKey: 'nav.shortNumbers',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/media`,
          labelKey: 'nav.media',
          show: !!tid && can(Permission.TENANT_MEDIA_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/voicemail`,
          labelKey: 'nav.voicemail',
          show:
            !!tid &&
            (can(Permission.TENANT_VOICEMAIL_MANAGE) || can(Permission.AGENT_VOICEMAIL_READ)),
        },
        {
          href: `/t/${tid}/callflows/blacklist`,
          labelKey: 'nav.blacklist',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/cronjobs`,
          labelKey: 'nav.cronJobs',
          show: !!tid && can(Permission.TENANT_CALLFLOW_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/phonebooks`,
          labelKey: 'nav.phonebooks',
          show: !!tid && can(Permission.TENANT_PHONEBOOK_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/campaigns`,
          labelKey: 'nav.campaigns',
          show: !!tid && can(Permission.TENANT_CAMPAIGN_MANAGE),
        },
        {
          href: `/t/${tid}/callflows/provisioning`,
          labelKey: 'nav.provisioning',
          show: !!tid && can(Permission.TENANT_PROVISIONING_MANAGE),
        },
      ],
    },
    {
      id: 'ai',
      labelKey: 'nav.ai',
      items: [
        {
          href: `/t/${tid}/ai/providers`,
          labelKey: 'nav.providers',
          show: !!tid && can(Permission.AI_PROVIDER_CONNECTIONS_READ),
        },
        {
          href: `/t/${tid}/ai/agents`,
          labelKey: 'nav.agents',
          show: !!tid && can(Permission.AI_AGENTS_READ),
        },
        {
          href: `/t/${tid}/ai/sessions`,
          labelKey: 'nav.sessions',
          show: !!tid && can(Permission.AI_SESSIONS_READ),
        },
        {
          href: `/t/${tid}/ai/tools`,
          labelKey: 'nav.tools',
          show: !!tid && can(Permission.AI_AGENTS_MANAGE),
        },
      ],
    },
    {
      id: 'billing',
      labelKey: 'nav.billing',
      items: [
        {
          href: `/t/${tid}/billing/invoices`,
          labelKey: 'nav.invoices',
          show: !!tid && canReadBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/billing/plan`,
          labelKey: 'nav.plan',
          show: !!tid && canReadBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/billing/credits`,
          labelKey: 'nav.credits',
          show: !!tid && canManageBillingForTenant(user, tid),
        },
        {
          href: `/t/${tid}/entitlements`,
          labelKey: 'nav.usage',
          show: !!tid && can(Permission.TENANT_USAGE_READ),
        },
      ],
    },
    {
      id: 'settings',
      labelKey: 'nav.settings',
      items: [
        {
          href: `/t/${tid}/settings/telephony`,
          labelKey: 'nav.telephonySettings',
          show: !!tid && can(Permission.TENANT_UPDATE),
        },
        {
          href: `/t/${tid}/settings/locales`,
          labelKey: 'nav.locales',
          show: !!tid && can(Permission.TENANT_UPDATE),
        },
        {
          href: `/t/${tid}/settings/cloud-storage`,
          labelKey: 'nav.cloudBackup',
          show: !!tid && can(Permission.TENANT_UPDATE),
        },
        {
          href: `/t/${tid}/developers/webhooks`,
          labelKey: 'nav.webhooks',
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
      labelKey: 'nav.overview',
      items: [
        { href: '/platform/dashboard', labelKey: 'nav.dashboard', show: admin },
        { href: '/platform/health', labelKey: 'nav.health', show: admin },
      ],
    },
    {
      id: 'customers',
      labelKey: 'nav.customers',
      items: [{ href: '/platform/tenants', labelKey: 'nav.tenants', show: admin }],
    },
    {
      id: 'billing',
      labelKey: 'nav.billing',
      items: [
        { href: '/platform/billing/plans', labelKey: 'nav.plans', show: admin },
        { href: '/platform/billing/prices', labelKey: 'nav.prices', show: admin },
      ],
    },
    {
      id: 'integrations',
      labelKey: 'nav.integrations',
      items: [
        { href: '/platform/integrations', labelKey: 'nav.allIntegrations', show: admin, exact: true },
      ],
    },
    {
      id: 'catalogs',
      labelKey: 'nav.catalogs',
      items: [{ href: '/platform/catalogs', labelKey: 'nav.catalogs', show: admin }],
    },
  ];
}

export const INTEGRATION_TABS: SubNavItem[] = [
  { href: '/platform/integrations', label: 'Overview', exact: true },
  { href: '/platform/integrations/cloud-storage', label: 'Cloud backup' },
  { href: '/platform/integrations/twilio', label: 'Twilio' },
  { href: '/platform/integrations/phone-numbers', label: 'Numbers' },
  { href: '/platform/integrations/sip-carriers', label: 'SIP carriers' },
  { href: '/platform/integrations/ai', label: 'AI' },
  { href: '/platform/integrations/stripe', label: 'Stripe' },
  { href: '/platform/integrations/audit', label: 'Audit' },
];

export const TENANT_SETTINGS_TABS = (tenantId: string): SubNavItem[] => [
  { href: `/t/${tenantId}/settings/telephony`, label: 'Telephony' },
  { href: `/t/${tenantId}/settings/locales`, label: 'Languages' },
  { href: `/t/${tenantId}/settings/cloud-storage`, label: 'Cloud backup' },
];

export const EXTENSION_TABS = (tenantId: string): SubNavItem[] => [
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
