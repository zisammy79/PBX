/** Tenant-prefixed telephony resource identifiers for Asterisk isolation. */
export function tenantAsteriskContext(tenantSlug: string): string {
  return `t_${tenantSlug.replace(/[^a-z0-9]/g, '_')}`;
}

export function tenantEndpointId(tenantSlug: string, extensionNumber: string): string {
  return `${tenantSlug}_ext_${extensionNumber}`;
}

export function tenantTrunkId(tenantSlug: string, trunkSlug: string): string {
  return `${tenantSlug}_trunk_${trunkSlug}`;
}

export function tenantQueueName(tenantSlug: string, queueSlug: string): string {
  return `${tenantSlug}_queue_${queueSlug}`;
}

export function tenantBridgeName(tenantSlug: string, callId: string): string {
  return `${tenantSlug}_bridge_${callId.slice(0, 8)}`;
}

export function tenantStoragePath(tenantId: string, ...segments: string[]): string {
  return ['tenants', tenantId, ...segments].join('/');
}

export function tenantNatsSubject(tenantId: string, subject: string): string {
  return `tenant.${tenantId}.${subject}`;
}
