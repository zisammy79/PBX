export type SipAuthMode = 'registration' | 'ip';
export type SipTransport = 'udp' | 'tcp' | 'tls';

export interface TelephonyTrunkRecord {
  tenantId: string;
  tenantSlug: string;
  trunkId: string;
  name: string;
  slug: string;
  asteriskTrunkId: string;
  authMode: SipAuthMode;
  transport: SipTransport;
  isActive: boolean;
  registrar?: string;
  outboundProxy?: string;
  username?: string;
  password?: string;
  allowedCodecs: string[];
  dtmfMode: 'rfc4733' | 'inband' | 'info';
  assignedDid?: string;
  allowedCallerId?: string;
  maxConcurrentCalls: number;
  maxCallDurationSeconds: number;
  spendLimitCents?: number;
  allowedDestinationCountries: string[];
  failureRoute?: string;
}

export interface TelephonyInboundRouteRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  didPattern: string;
  destinationType: 'extension' | 'ai_agent' | 'voicemail';
  destinationValue: string;
  trunkAsteriskId: string;
}

export interface TelephonyOutboundRouteRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  pattern: string;
  trunkAsteriskId: string;
  callerId: string;
  normalizePrefix?: string;
}

export interface GeneratedTrunkConfig {
  pjsipTrunks: string;
  inboundDialplan: string;
  outboundDialplan: string;
  trunkCount: number;
  checksum: string;
}

export interface PstnFraudControls {
  maxConcurrentCalls: number;
  maxCallDurationSeconds: number;
  spendLimitCents?: number;
  allowedDestinationCountries: string[];
  emergencyCallingEnabled: boolean;
}

export const DEFAULT_PSTN_FRAUD_CONTROLS: PstnFraudControls = {
  maxConcurrentCalls: 5,
  maxCallDurationSeconds: 3600,
  allowedDestinationCountries: ['US', 'CA', 'GB'],
  emergencyCallingEnabled: false,
};
