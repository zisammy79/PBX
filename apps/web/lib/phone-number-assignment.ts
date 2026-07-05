import type { AssignableDestination } from '@pbx/contracts';

export type TenantOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export function sortActiveTenantsForAssignment(tenants: TenantOption[]): TenantOption[] {
  return tenants
    .filter((tenant) => tenant.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function filterAssignableDestinationsByTarget(
  destinations: AssignableDestination[],
  destinationType: 'extension' | 'ai_agent' | 'voicemail' | 'reserve_only',
): AssignableDestination[] {
  if (destinationType === 'extension' || destinationType === 'voicemail') {
    return destinations.filter((destination) => destination.type === 'extension');
  }
  if (destinationType === 'ai_agent') {
    return destinations.filter((destination) => destination.type === 'ai_agent');
  }
  return [];
}

export function pickDefaultDestinationValue(
  destinations: AssignableDestination[],
  preferredValue?: string,
): string {
  if (preferredValue && destinations.some((destination) => destination.value === preferredValue)) {
    return preferredValue;
  }
  return destinations[0]?.value ?? '';
}

export function buildPurchaseAndAssignPayload(input: {
  tenantId: string;
  e164: string;
  destinationType: 'extension' | 'ai_agent' | 'voicemail' | 'reserve_only';
  destinationExtensionNumber: string;
  destinationId: string;
  outboundCallerIdPolicy: string;
}) {
  return {
    tenantId: input.tenantId,
    e164: input.e164,
    confirmPurchase: true as const,
    destinationType: input.destinationType,
    outboundCallerIdPolicy: input.outboundCallerIdPolicy,
    ...(input.destinationType === 'extension' || input.destinationType === 'voicemail'
      ? { destinationExtensionNumber: input.destinationExtensionNumber }
      : {}),
    ...(input.destinationType === 'ai_agent' && input.destinationId
      ? { destinationId: input.destinationId }
      : {}),
  };
}
