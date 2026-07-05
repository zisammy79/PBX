import { describe, expect, it } from 'vitest';
import {
  dedupeAvailableNumbers,
  filterAvailableNumbers,
  mapTwilioAvailableNumber,
} from './twilio-number-search.js';

describe('twilio-number-search', () => {
  it('maps Twilio available number rows for UI', () => {
    const row = mapTwilioAvailableNumber(
      {
        phoneNumber: '+97221234567',
        friendlyName: 'Tel Aviv',
        locality: 'Tel Aviv',
        region: 'Tel Aviv District',
        isoCountry: 'IL',
        capabilities: { voice: true, SMS: false, MMS: false },
        addressRequirements: 'none',
      },
      'IL',
      'local',
    );
    expect(row.e164).toBe('+97221234567');
    expect(row.regulatoryStatus).toBe('none');
    expect(row.capabilities.voice).toBe(true);
  });

  it('flags regulatory setup when address is required', () => {
    const row = mapTwilioAvailableNumber(
      {
        phoneNumber: '+97221234568',
        addressRequirements: 'local',
        capabilities: { voice: true },
      },
      'IL',
      'local',
    );
    expect(row.regulatoryStatus).toBe('requires_regulatory_setup');
  });

  it('filters voice-capable numbers', () => {
    const rows = [
      mapTwilioAvailableNumber({ phoneNumber: '+9721', capabilities: { voice: true } }, 'IL', 'local'),
      mapTwilioAvailableNumber({ phoneNumber: '+9722', capabilities: { voice: false } }, 'IL', 'local'),
    ];
    const filtered = filterAvailableNumbers(rows, { voiceRequired: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.e164).toBe('+9721');
  });

  it('dedupes by e164', () => {
    const rows = [
      mapTwilioAvailableNumber({ phoneNumber: '+9721' }, 'IL', 'local'),
      mapTwilioAvailableNumber({ phoneNumber: '+9721' }, 'IL', 'mobile'),
    ];
    expect(dedupeAvailableNumbers(rows)).toHaveLength(1);
  });
});
