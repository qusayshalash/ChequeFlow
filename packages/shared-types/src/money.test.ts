import { describe, expect, it } from 'vitest';

import { addMoney, isNegativeMoney, isZeroMoney, sameMoney, subtractMoney } from './money.js';

describe('money arithmetic', () => {
  it('adds without the float error a screen used to show', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney(['0.10', '0.20'])).toBe('0.30');
  });

  it('stays exact past what a double can hold in minor units', () => {
    expect(addMoney(['90071992547409.93', '0.01'])).toBe('90071992547409.94');
  });

  it('treats missing amounts as zero and keeps two places', () => {
    expect(addMoney([])).toBe('0.00');
    expect(addMoney([null, undefined, '5'])).toBe('5.00');
  });

  it('keeps the precision of the most precise input', () => {
    expect(addMoney(['1.5', '0.125'])).toBe('1.625');
  });

  it('subtracts into negatives and says so', () => {
    expect(subtractMoney('100.00', '250.50')).toBe('-150.50');
    expect(subtractMoney('10.00', '-2.50')).toBe('12.50');
    expect(isNegativeMoney('-0.01')).toBe(true);
    expect(isNegativeMoney('0.00')).toBe(false);
    expect(isZeroMoney(subtractMoney('7.30', '7.3'))).toBe(true);
  });

  it('knows two spellings of one amount are the same', () => {
    expect(sameMoney('500', '500.00')).toBe(true);
    expect(sameMoney('500.5', '500.50')).toBe(true);
    expect(sameMoney('500.01', '500.00')).toBe(false);
    expect(sameMoney('', '500.00')).toBe(false);
    expect(sameMoney('5x', '5.00')).toBe(false);
  });

  it('refuses something that is not an amount', () => {
    expect(() => addMoney(['1e3'])).toThrow(/Not an amount/);
  });
});
