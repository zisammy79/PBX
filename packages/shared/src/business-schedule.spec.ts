import { describe, expect, it } from 'vitest';
import { evaluateBusinessSchedule } from '../src/business-schedule.js';

describe('evaluateBusinessSchedule', () => {
  it('returns open when no rules are configured', () => {
    expect(evaluateBusinessSchedule([], new Date('2026-09-17T10:00:00Z'), 'UTC')).toBe('open');
  });

  it('matches weektime rules in the configured timezone', () => {
    const rules = [{ type: 'weektime', days: [4], start: '09:00', end: '17:00' }];
    const open = evaluateBusinessSchedule(rules, new Date('2026-09-17T10:00:00Z'), 'UTC');
    const closed = evaluateBusinessSchedule(rules, new Date('2026-09-17T20:00:00Z'), 'UTC');
    expect(open).toBe('open');
    expect(closed).toBe('closed');
  });
});
