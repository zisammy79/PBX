export interface TelephonyExtensionRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  extensionNumber: string;
  displayName: string;
  asteriskEndpointId: string;
  sipUsername: string;
  sipSecret: string;
  status: 'active' | 'disabled';
}

export interface TelephonyTenantRecord {
  tenantId: string;
  slug: string;
  asteriskContext: string;
  status: string;
}

export interface TelephonyAiAgentRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  routeNumber: string;
  agentId: string;
  agentName: string;
  status: 'active' | 'disabled';
}

export interface GeneratedTelephonyConfig {
  version: string;
  generatedAt: string;
  tenantIds: string[];
  pjsipTenants: string;
  extensionsTenants: string;
  manifest: ConfigManifest;
}

export interface ConfigManifest {
  version: string;
  generatedAt: string;
  tenantIds: string[];
  extensionCount: number;
  checksum: string;
}
