import { describe, expect, it } from 'vitest';
import {
  buildTwilioAvailableNumbersQuery,
  dedupeAvailableNumbers,
  filterAvailableNumbers,
  mapTwilioAvailableNumber,
  normalizeIlPrefixToE164Prefix,
  normalizePhoneNumberSearchFilters,
  postFilterAvailableNumbers,
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

describe('normalizeIlPrefixToE164Prefix', () => {
  it.each([
    ['03', '+9723'],
    ['3', '+9723'],
    ['02', '+9722'],
    ['04', '+9724'],
    ['09', '+9729'],
    ['076', '+97276'],
    ['9723', '+9723'],
    ['+9723', '+9723'],
    [' 03 ', '+9723'],
    ['(03)', '+9723'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeIlPrefixToE164Prefix(input)).toBe(expected);
  });

  it('returns undefined for empty input', () => {
    expect(normalizeIlPrefixToE164Prefix('')).toBeUndefined();
    expect(normalizeIlPrefixToE164Prefix('   ')).toBeUndefined();
  });

  it('throws for invalid prefix', () => {
    expect(() => normalizeIlPrefixToE164Prefix('abc')).toThrow('Invalid Israeli prefix');
  });
});

describe('normalizePhoneNumberSearchFilters', () => {
  const baseQuery = {
    country: 'IL',
    type: 'local' as const,
    voiceRequired: true,
    limit: 25,
  };

  it('maps IL area code 03 to Twilio contains +9723 without areaCode', () => {
    const normalized = normalizePhoneNumberSearchFilters({ ...baseQuery, areaCode: '03' });
    expect(normalized.twilioParams).toEqual({ limit: 25, contains: '+9723' });
    expect(normalized.twilioParams.areaCode).toBeUndefined();
    expect(normalized.postFilters.e164Prefix).toBe('+9723');
    expect(normalized.appliedFilters).toEqual({ areaCodeInput: '03', e164Prefix: '+9723' });
  });

  it('maps US area code 212 to Twilio areaCode without contains', () => {
    const normalized = normalizePhoneNumberSearchFilters({
      ...baseQuery,
      country: 'US',
      areaCode: '212',
    });
    expect(normalized.twilioParams).toEqual({ limit: 25, areaCode: 212 });
    expect(normalized.twilioParams.contains).toBeUndefined();
  });

  it('maps CA area code 416 to Twilio areaCode', () => {
    const normalized = normalizePhoneNumberSearchFilters({
      ...baseQuery,
      country: 'CA',
      areaCode: '416',
    });
    expect(normalized.twilioParams.areaCode).toBe(416);
  });

  it('omits empty areaCode and contains from Twilio query', () => {
    const normalized = normalizePhoneNumberSearchFilters(baseQuery);
    expect(normalized.twilioParams).toEqual({ limit: 25 });
    expect(normalized.postFilters).toEqual({});
  });

  it('combines IL prefix with contains suffix via post-filter', () => {
    const normalized = normalizePhoneNumberSearchFilters({
      ...baseQuery,
      areaCode: '03',
      contains: '25338',
    });
    expect(normalized.twilioParams.contains).toBe('+9723');
    expect(normalized.postFilters).toEqual({
      e164Prefix: '+9723',
      containsSuffix: '25338',
    });
  });
});

describe('postFilterAvailableNumbers', () => {
  const rows = [
    mapTwilioAvailableNumber({ phoneNumber: '+97233825338' }, 'IL', 'local'),
    mapTwilioAvailableNumber({ phoneNumber: '+97223765964' }, 'IL', 'local'),
    mapTwilioAvailableNumber({ phoneNumber: '+972765996822' }, 'IL', 'local'),
  ];

  it('keeps only numbers starting with IL prefix', () => {
    const filtered = postFilterAvailableNumbers(rows, { e164Prefix: '+9723' });
    expect(filtered.map((row) => row.e164)).toEqual(['+97233825338']);
  });

  it('applies suffix post-filter within prefix matches', () => {
    const filtered = postFilterAvailableNumbers(rows, {
      e164Prefix: '+9723',
      containsSuffix: '25338',
    });
    expect(filtered.map((row) => row.e164)).toEqual(['+97233825338']);
  });
});

describe('buildTwilioAvailableNumbersQuery', () => {
  it('delegates to normalizePhoneNumberSearchFilters', () => {
    const built = buildTwilioAvailableNumbersQuery({
      country: 'IL',
      type: 'local',
      areaCode: '076',
      voiceRequired: true,
      limit: 10,
    });
    expect(built.twilioParams.contains).toBe('+97276');
  });
});
