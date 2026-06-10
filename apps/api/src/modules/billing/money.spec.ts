import { describe, expect, it } from 'vitest';
import { addDecimal, applyBillingIncrement, mulDecimal, roundMoney } from './money.js';

describe('money helpers', () => {
  it('multiplies without float drift for common billing values', () => {
    expect(mulDecimal('0.002', '100')).toBe('0.200000');
  });

  it('rounds to invoice currency scale', () => {
    expect(roundMoney('10.125')).toBe('10.13');
    expect(roundMoney('10.124')).toBe('10.12');
  });

  it('applies billing increment ceiling', () => {
    expect(applyBillingIncrement('1.1', '1')).toBe('2.000000');
  });

  it('sums decimal strings', () => {
    expect(addDecimal('0.10', '0.20')).toBe('0.300000');
  });
});
