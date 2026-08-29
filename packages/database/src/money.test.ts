import { describe, expect, it } from 'vitest';

import { moneyToString, sumMoney, toMoney } from './money.js';

describe('money helpers', () => {
  it('keeps exact decimal arithmetic', () => {
    // The classic floating point failure: 0.1 + 0.2 !== 0.3
    expect(sumMoney(['0.10', '0.20']).toFixed(2)).toBe('0.30');
    expect(sumMoney(['1500.55', '2499.45']).toFixed(2)).toBe('4000.00');
  });

  it('normalises to two decimal places', () => {
    expect(moneyToString(toMoney('10.005'))).toBe('10.01');
    expect(moneyToString(toMoney(7))).toBe('7.00');
  });

  it('rejects non numeric input', () => {
    expect(() => toMoney('not-a-number')).toThrow();
  });
});
