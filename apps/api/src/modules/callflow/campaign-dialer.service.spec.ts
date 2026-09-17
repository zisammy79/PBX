import { describe, expect, it } from 'vitest';
import {
  classifyDialAttempt,
  normalizeCampaignNumber,
  shouldCountAttempt,
} from './campaign-dialer.service.js';

describe('CampaignDialerService helpers', () => {
  const dnc = new Set(['972501234567']);

  it('normalizes numbers for DNC comparison', () => {
    expect(normalizeCampaignNumber('+972-50-123-4567')).toBe('972501234567');
  });

  it('skips DNC numbers without counting an attempt', () => {
    expect(classifyDialAttempt('+972501234567', dnc, true)).toBe('skipped_dnc');
    expect(shouldCountAttempt('skipped_dnc')).toBe(false);
  });

  it('queues eligible numbers when tenant has a trunk', () => {
    expect(classifyDialAttempt('+972509999999', dnc, true)).toBe('queued');
    expect(shouldCountAttempt('queued')).toBe(true);
  });

  it('marks failed_no_trunk when no trunk is available', () => {
    expect(classifyDialAttempt('+972509999999', dnc, false)).toBe('failed_no_trunk');
    expect(shouldCountAttempt('failed_no_trunk')).toBe(true);
  });
});
