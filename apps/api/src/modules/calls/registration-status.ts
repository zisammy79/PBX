import type { ExtensionRegistrationStatus } from '@pbx/contracts';

export type AriEndpointSnapshot = {
  resource: string;
  state?: string;
  channel_ids?: string[];
};

export function mapAriEndpointToRegistrationStatus(
  snapshot: AriEndpointSnapshot | undefined,
  asteriskReachable: boolean,
): ExtensionRegistrationStatus {
  if (!asteriskReachable) {
    return 'unknown';
  }
  if (!snapshot) {
    return 'offline';
  }
  const state = (snapshot.state ?? '').toLowerCase();
  if (state === 'online' || state === 'not in use' || state === 'in use') {
    return 'online';
  }
  if (state === 'offline' || state === 'unavailable' || state === 'unknown') {
    return 'offline';
  }
  const hasChannels = (snapshot.channel_ids?.length ?? 0) > 0;
  return hasChannels ? 'online' : 'offline';
}

export function countEndpointContacts(snapshot: AriEndpointSnapshot | undefined): number {
  if (!snapshot) {
    return 0;
  }
  const state = (snapshot.state ?? '').toLowerCase();
  if (state === 'online' || state === 'not in use' || state === 'in use') {
    return Math.max(1, snapshot.channel_ids?.length ?? 0);
  }
  return snapshot.channel_ids?.length ?? 0;
}
