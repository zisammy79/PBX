export type ExtensionRecordingPolicyMode = 'inherit' | 'on' | 'off';

export interface RecordingPolicyDecision {
  shouldRecord: boolean;
  reason: string;
  participantExtensionIds: string[];
  resolvedAt: string;
}

export function effectiveExtensionRecording(
  orgRecordByDefault: boolean,
  mode: ExtensionRecordingPolicyMode,
): boolean {
  switch (mode) {
    case 'on':
      return true;
    case 'off':
      return false;
    default:
      return orgRecordByDefault;
  }
}

export function resolveCallRecordingPolicy(input: {
  orgRecordByDefault: boolean;
  callAnswered: boolean;
  participants: Array<{ extensionId: string; mode: ExtensionRecordingPolicyMode; active: boolean }>;
  resolvedAt?: string;
}): RecordingPolicyDecision {
  const resolvedAt = input.resolvedAt ?? new Date().toISOString();
  const activeParticipants = input.participants.filter((p) => p.active);

  if (!input.callAnswered || activeParticipants.length === 0) {
    return {
      shouldRecord: false,
      reason: 'call_not_answered',
      participantExtensionIds: activeParticipants.map((p) => p.extensionId),
      resolvedAt,
    };
  }

  const enabledIds = activeParticipants
    .filter((p) => effectiveExtensionRecording(input.orgRecordByDefault, p.mode))
    .map((p) => p.extensionId);

  if (enabledIds.length === 0) {
    return {
      shouldRecord: false,
      reason: input.orgRecordByDefault ? 'all_participants_off' : 'organization_default_off',
      participantExtensionIds: activeParticipants.map((p) => p.extensionId),
      resolvedAt,
    };
  }

  const hasExplicitOn = activeParticipants.some((p) => p.mode === 'on');
  const hasExplicitOffOnly =
    !hasExplicitOn &&
    activeParticipants.every((p) => p.mode === 'inherit' || p.mode === 'off') &&
    input.orgRecordByDefault;

  return {
    shouldRecord: true,
    reason: hasExplicitOn
      ? 'extension_override_on'
      : hasExplicitOffOnly
        ? 'organization_default_on'
        : 'multi_participant_policy_on',
    participantExtensionIds: enabledIds,
    resolvedAt,
  };
}

export function buildRecordingStorageKey(tenantId: string, recordingId: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${year}/${month}/${recordingId}.wav`;
}
