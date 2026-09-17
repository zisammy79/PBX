import { describe, expect, it } from 'vitest';
import { dedupeCampaignNumbers, parseCampaignNumberInput } from './campaign-numbers.js';

describe('campaign number import helpers', () => {
  it('accepts normalized E.164-style numbers', () => {
    expect(parseCampaignNumberInput('+972-50-123-4567')).toBe('+972501234567');
    expect(parseCampaignNumberInput('0501234567')).toBe('0501234567');
  });

  it('rejects too-short numbers', () => {
    expect(parseCampaignNumberInput('12345')).toBeNull();
    expect(parseCampaignNumberInput('   ')).toBeNull();
  });

  it('dedupes equivalent numbers', () => {
    expect(
      dedupeCampaignNumbers(['+972501234567', '972501234567', '050-999-8888']),
    ).toEqual(['+972501234567', '0509998888']);
  });
});
