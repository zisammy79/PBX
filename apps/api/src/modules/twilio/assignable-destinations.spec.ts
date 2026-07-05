import { describe, expect, it } from 'vitest';
import {
  buildExtensionDestinationLabel,
  isTenantUuid,
  mapExtensionRowsToDestinations,
} from './assignable-destinations.js';

describe('assignable destinations helpers', () => {
  it('detects tenant UUID refs', () => {
    expect(isTenantUuid('2433f849-3b43-405c-83a4-47d4ff492955')).toBe(true);
    expect(isTenantUuid('rls-a-2433f849')).toBe(false);
  });

  it('builds extension labels with SIP username when available', () => {
    expect(
      buildExtensionDestinationLabel({
        extensionNumber: '100',
        displayName: 'Twilio Test',
        sipUsername: 'rls-a-2433f849_100',
      }),
    ).toBe('100 — rls-a-2433f849_100');
  });

  it('maps active extension rows to assignable destinations', () => {
    expect(
      mapExtensionRowsToDestinations([
        {
          id: 'ext-id',
          extensionNumber: '100',
          displayName: 'Twilio Test',
          status: 'active',
          sipUsername: 'rls-a-2433f849_100',
        },
      ]),
    ).toEqual([
      {
        type: 'extension',
        id: 'ext-id',
        value: '100',
        label: '100 — rls-a-2433f849_100',
        status: 'active',
        metadata: {
          displayName: 'Twilio Test',
          sipUsername: 'rls-a-2433f849_100',
        },
      },
    ]);
  });
});
