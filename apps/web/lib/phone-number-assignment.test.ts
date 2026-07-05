import { describe, expect, it } from 'vitest';
import {
  buildPurchaseAndAssignPayload,
  filterAssignableDestinationsByTarget,
  pickDefaultDestinationValue,
  sortActiveTenantsForAssignment,
} from '@/lib/phone-number-assignment';

describe('phone number assignment helpers', () => {
  const tenants = [
    { id: 'archived-id', name: 'WeDo - internal', slug: 'wedo', status: 'archived' },
    { id: 'tenant-a-id', name: 'Tenant A', slug: 'rls-a-2433f849', status: 'active' },
    { id: 'tenant-b-id', name: 'Tenant B', slug: 'rls-b', status: 'active' },
  ];

  const destinations = [
    {
      type: 'extension' as const,
      id: 'ext-100',
      value: '100',
      label: '100 — rls-a-2433f849_100',
      status: 'active',
    },
    {
      type: 'extension' as const,
      id: 'ext-7001',
      value: '7001',
      label: 'Extension 7001',
      status: 'active',
    },
    {
      type: 'ai_agent' as const,
      id: 'agent-id',
      value: 'agent-id',
      label: 'Support Bot',
      status: 'active',
    },
  ];

  it('filters active tenants for assignment dropdown', () => {
    expect(sortActiveTenantsForAssignment(tenants).map((tenant) => tenant.name)).toEqual([
      'Tenant A',
      'Tenant B',
    ]);
  });

  it('returns extension destinations for extension routing target', () => {
    expect(filterAssignableDestinationsByTarget(destinations, 'extension').map((d) => d.value)).toEqual([
      '100',
      '7001',
    ]);
  });

  it('includes extension 100 when active', () => {
    const extensionDestinations = filterAssignableDestinationsByTarget(destinations, 'extension');
    expect(extensionDestinations.some((destination) => destination.value === '100')).toBe(true);
  });

  it('prefers requested extension when available', () => {
    expect(
      pickDefaultDestinationValue(
        filterAssignableDestinationsByTarget(destinations, 'extension'),
        '100',
      ),
    ).toBe('100');
  });

  it('builds purchase-and-assign payload with tenant and extension', () => {
    expect(
      buildPurchaseAndAssignPayload({
        tenantId: 'tenant-a-id',
        e164: '+972331234567',
        destinationType: 'extension',
        destinationExtensionNumber: '100',
        destinationId: '',
        outboundCallerIdPolicy: 'tenant_default',
      }),
    ).toEqual({
      tenantId: 'tenant-a-id',
      e164: '+972331234567',
      confirmPurchase: true,
      destinationType: 'extension',
      destinationExtensionNumber: '100',
      outboundCallerIdPolicy: 'tenant_default',
    });
  });
});
