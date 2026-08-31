import { describe, expect, it } from 'vitest';

import { convertMoney, moneyToString, rateToString, sumMoney, toMoney, toRate } from './money.js';

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

describe('exchange rate helpers', () => {
  it('keeps six decimals of a rate', () => {
    expect(rateToString(toRate('3.641234'))).toBe('3.641234');
  });

  it('drops trailing zeros so a rate does not fake precision', () => {
    expect(rateToString(toRate('3.60'))).toBe('3.6');
    expect(rateToString(toRate('1'))).toBe('1');
  });

  it('refuses a rate that is not positive', () => {
    expect(() => toRate('0')).toThrow(TypeError);
    expect(() => toRate('-1')).toThrow(TypeError);
    expect(() => toRate('abc')).toThrow(TypeError);
  });

  it('converts an amount at a rate', () => {
    expect(moneyToString(convertMoney('1000.00', '3.64'))).toBe('3640.00');
    expect(moneyToString(convertMoney('250.50', '0.27'))).toBe('67.64');
  });

  it('rounds once, at the end', () => {
    // Rounding the product of each row to cents before summing is the classic
    // way a converted total drifts; the multiply itself must stay exact.
    const rows = ['33.33', '33.33', '33.34'];
    const converted = rows.map((amount) => convertMoney(amount, '3.641234'));
    expect(moneyToString(sumMoney(converted))).toBe('364.12');
  });

  it('never goes through a float', () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point.
    expect(moneyToString(convertMoney('0.10', '3'))).toBe('0.30');
  });
});
