export type CallflowDestinationType =
  | 'extension'
  | 'queue'
  | 'ring_group'
  | 'voicemail'
  | 'ivr'
  | 'schedule'
  | string;

export interface TelephonyIvrOptionRecord {
  digit: string;
  destinationType: CallflowDestinationType;
  destinationId: string | null;
}

export interface TelephonyIvrRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  ivrId: string;
  name: string;
  greetingAudioKey: string | null;
  timeoutSeconds: number;
  maxRetries: number;
  language: string;
  options: TelephonyIvrOptionRecord[];
}

export interface TelephonyBusinessScheduleRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  scheduleId: string;
  name: string;
  timezone: string;
  scheduleType: string;
  rules: unknown[];
  openDestinationType: string | null;
  openDestinationId: string | null;
  closedDestinationType: string | null;
  closedDestinationId: string | null;
}

export interface TelephonyQueueMemberRecord {
  extensionId: string;
  extensionNumber: string;
  asteriskEndpointId: string;
  penalty: number;
}

export interface TelephonyQueueRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  queueId: string;
  name: string;
  asteriskQueueName: string;
  strategy: string;
  maxWaitSeconds: number;
  number: string | null;
  mohClassName: string | null;
  members: TelephonyQueueMemberRecord[];
}

export interface TelephonyMohTrackRecord {
  fileName: string;
  storageKey: string;
}

export interface TelephonyMohClassRecord {
  tenantId: string;
  tenantSlug: string;
  mohClassId: string;
  name: string;
  asteriskClassName: string;
  randomize: boolean;
  tracks: TelephonyMohTrackRecord[];
}

export interface TelephonyRingGroupMemberRecord {
  extensionId: string;
  extensionNumber: string;
  asteriskEndpointId: string;
  priority: number;
}

export interface TelephonyRingGroupRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  ringGroupId: string;
  name: string;
  strategy: string;
  timeoutSeconds: number;
  members: TelephonyRingGroupMemberRecord[];
}

export interface TelephonyFeatureCodeRecord {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  code: string;
  actionType: string;
  enabled: boolean;
}

export interface TelephonyBlacklistRecord {
  tenantId: string;
  tenantSlug: string;
  numberPattern: string;
}

export interface TelephonyCallflowRecords {
  ivrs: TelephonyIvrRecord[];
  schedules: TelephonyBusinessScheduleRecord[];
  queues: TelephonyQueueRecord[];
  ringGroups: TelephonyRingGroupRecord[];
  featureCodes: TelephonyFeatureCodeRecord[];
  blacklist: TelephonyBlacklistRecord[];
  mohClasses: TelephonyMohClassRecord[];
}

export interface DestinationResolution {
  context: string;
  exten: string;
  priority: number;
}
