import { describe, expect, it } from 'vitest';
import {
  countEndpointContacts,
  mapAriEndpointToRegistrationStatus,
} from './registration-status.js';

describe('registration-status', () => {
  it('maps online endpoint state', () => {
    expect(
      mapAriEndpointToRegistrationStatus({ resource: 'demo-company_ext_1003', state: 'online' }, true),
    ).toBe('online');
  });

  it('maps offline endpoint state', () => {
    expect(
      mapAriEndpointToRegistrationStatus(
        { resource: 'demo-company_ext_1004', state: 'unavailable' },
        true,
      ),
    ).toBe('offline');
  });

  it('returns unknown when asterisk is unreachable', () => {
    expect(
      mapAriEndpointToRegistrationStatus({ resource: 'demo-company_ext_1003', state: 'online' }, false),
    ).toBe('unknown');
  });

  it('counts contacts for online endpoints', () => {
    expect(
      countEndpointContacts({ resource: 'demo-company_ext_1003', state: 'online', channel_ids: [] }),
    ).toBe(1);
  });
});
