import { describe, expect, it } from 'vitest';

import { addMonthsIso, nextChequeNumber, suggestNextRow } from './serial-cheques.js';

describe('addMonthsIso', () => {
  it('keeps the day of the month', () => {
    expect(addMonthsIso('2026-01-10', 1)).toBe('2026-02-10');
    expect(addMonthsIso('2026-01-10', 5)).toBe('2026-06-10');
  });

  it('rolls the year over', () => {
    expect(addMonthsIso('2026-11-10', 1)).toBe('2026-12-10');
    expect(addMonthsIso('2026-12-10', 1)).toBe('2027-01-10');
    expect(addMonthsIso('2026-03-15', 24)).toBe('2028-03-15');
  });

  it('clamps to the end of a shorter month instead of overflowing', () => {
    // Naive arithmetic gives 2026-03-03 here, and the cheque is chased late.
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-08-31', 1)).toBe('2026-09-30');
    expect(addMonthsIso('2026-10-31', 4)).toBe('2027-02-28');
  });

  it('knows about leap years', () => {
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsIso('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('does not creep: each step is measured from the original day', () => {
    // Stepping from the clamped result would drift to the 28th forever, so a
    // twelve-cheque book starting on the 31st must still end on the 31st.
    const start = '2026-01-31';
    expect(addMonthsIso(start, 12)).toBe('2027-01-31');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(addMonthsIso('', 1)).toBe('');
    expect(addMonthsIso('not-a-date', 1)).toBe('not-a-date');
  });

  it('walks backwards too', () => {
    expect(addMonthsIso('2026-01-10', -1)).toBe('2025-12-10');
    expect(addMonthsIso('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('nextChequeNumber', () => {
  it('increments', () => {
    expect(nextChequeNumber('100')).toBe('101');
    expect(nextChequeNumber('7')).toBe('8');
  });

  it('preserves the printed width', () => {
    expect(nextChequeNumber('00099')).toBe('00100');
    expect(nextChequeNumber('000001')).toBe('000002');
  });

  it('grows rather than wrapping when the width runs out', () => {
    expect(nextChequeNumber('999')).toBe('1000');
  });

  it('refuses anything that is not a plain run of digits', () => {
    // Guessing at a branch prefix would print a wrong number on a real cheque.
    expect(nextChequeNumber('A-100')).toBeNull();
    expect(nextChequeNumber('100/2')).toBeNull();
    expect(nextChequeNumber('')).toBeNull();
  });

  it('refuses numbers too long to increment exactly', () => {
    expect(nextChequeNumber('9007199254740993')).toBeNull();
  });

  it('accepts a step', () => {
    expect(nextChequeNumber('100', 5)).toBe('105');
  });
});

describe('suggestNextRow', () => {
  it('advances the number and the month but never the amount', () => {
    const suggestion = suggestNextRow([
      { chequeNumber: '000120', amount: '1500.00', dueDate: '2026-01-10' },
    ]);

    expect(suggestion).toEqual({ chequeNumber: '000121', dueDate: '2026-02-10' });
    expect(suggestion).not.toHaveProperty('amount');
  });

  it('leaves the number blank when it cannot be derived', () => {
    const suggestion = suggestNextRow([
      { chequeNumber: 'B-40', amount: '10', dueDate: '2026-01-10' },
    ]);

    expect(suggestion.chequeNumber).toBe('');
    expect(suggestion.dueDate).toBe('2026-02-10');
  });

  it('does not creep past a short month', () => {
    // Anchored on the first row, a book starting on the 31st keeps landing on
    // the 31st; stepping from the previous row would stick on the 28th.
    const rows = [{ chequeNumber: '100', amount: '50', dueDate: '2026-01-31' }];

    const second = suggestNextRow(rows);
    expect(second.dueDate).toBe('2026-02-28');

    rows.push({ ...second, amount: '50' });
    const third = suggestNextRow(rows);
    expect(third.dueDate).toBe('2026-03-31');
    expect(third.chequeNumber).toBe('102');
  });

  it('walks a whole twelve-cheque book without drifting', () => {
    const rows = [{ chequeNumber: '000001', amount: '100', dueDate: '2026-01-31' }];
    while (rows.length < 12) rows.push({ ...suggestNextRow(rows), amount: '100' });

    expect(rows.map((row) => row.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
    expect(rows[11]?.chequeNumber).toBe('000012');
  });

  it('returns blanks for an empty batch rather than throwing', () => {
    expect(suggestNextRow([])).toEqual({ chequeNumber: '', dueDate: '' });
  });
});
