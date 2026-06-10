import { describe, expect, it } from 'vitest';
import { assertCurrencyMatch } from './rating.service.js';
import { subDecimal, minDecimal, roundMoney } from './money.js';

describe('assertCurrencyMatch', () => {
  it('accepts matching ISO codes case-insensitively', () => {
    expect(() => assertCurrencyMatch('USD', 'usd')).not.toThrow();
  });

  it('rejects currency mismatch with structured validation error', () => {
    expect(() => assertCurrencyMatch('USD', 'EUR')).toThrow(/validation failed/i);
  });
});

describe('credit application math', () => {
  it('applies partial credit up to invoice total', () => {
    const balance = '15.00';
    const preCreditTotal = '10.00';
    expect(roundMoney(minDecimal(balance, preCreditTotal))).toBe('10.00');
    expect(roundMoney(subDecimal(preCreditTotal, minDecimal(balance, preCreditTotal)))).toBe('0.00');
  });

  it('leaves remainder when credit exceeds invoice total', () => {
    const balance = '50.00';
    const preCreditTotal = '10.00';
    const applied = roundMoney(minDecimal(balance, preCreditTotal));
    const remaining = roundMoney(subDecimal(balance, applied));
    expect(applied).toBe('10.00');
    expect(remaining).toBe('40.00');
  });
});

describe('tax rounding', () => {
  it('rounds tax-exclusive VAT to invoice scale', () => {
    expect(roundMoney(Number('100') * 0.2)).toBe('20.00');
    expect(roundMoney(Number('10.125') * 0.2)).toBe('2.03');
  });
});
