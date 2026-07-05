import type { AssignableDestination } from '@pbx/contracts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTenantUuid(ref: string): boolean {
  return UUID_RE.test(ref);
}

export function buildExtensionDestinationLabel(input: {
  extensionNumber: string;
  displayName?: string | null;
  sipUsername?: string | null;
}): string {
  if (input.sipUsername) {
    return `${input.extensionNumber} — ${input.sipUsername}`;
  }
  if (input.displayName?.trim()) {
    return `${input.extensionNumber} — ${input.displayName.trim()}`;
  }
  return `Extension ${input.extensionNumber}`;
}

export function mapExtensionRowsToDestinations(
  rows: Array<{
    id: string;
    extensionNumber: string;
    displayName: string | null;
    status: string;
    sipUsername: string | null;
  }>,
): AssignableDestination[] {
  return rows.map((row) => ({
    type: 'extension',
    id: row.id,
    value: row.extensionNumber,
    label: buildExtensionDestinationLabel({
      extensionNumber: row.extensionNumber,
      displayName: row.displayName,
      sipUsername: row.sipUsername,
    }),
    status: row.status,
    metadata: {
      displayName: row.displayName,
      ...(row.sipUsername ? { sipUsername: row.sipUsername } : {}),
    },
  }));
}

export function filterAssignableDestinationsByTarget(
  destinations: AssignableDestination[],
  destinationType: 'extension' | 'ai_agent' | 'voicemail' | 'reserve_only',
): AssignableDestination[] {
  if (destinationType === 'extension' || destinationType === 'voicemail') {
    return destinations.filter((d) => d.type === 'extension');
  }
  if (destinationType === 'ai_agent') {
    return destinations.filter((d) => d.type === 'ai_agent');
  }
  return [];
}
