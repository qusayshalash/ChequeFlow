import { describe, expect, it } from 'vitest';

import { addDaysIso, isValidDate, maskDateInput, todayIso } from './dates';

describe('maskDateInput', () => {
  it('inserts separators as digits arrive', () => {
    expect(maskDateInput('2')).toBe('2');
    expect(maskDateInput('2026')).toBe('2026');
    expect(maskDateInput('202608')).toBe('2026-08');
    expect(maskDateInput('20260829')).toBe('2026-08-29');
  });

  it('ignores anything the user types that is not a digit', () => {
    // Typing the dashes by hand, or pasting a formatted date, both work.
    expect(maskDateInput('2026-08-29')).toBe('2026-08-29');
    expect(maskDateInput('2026/08/29')).toBe('2026-08-29');
    expect(maskDateInput('abc2026')).toBe('2026');
  });

  it('stops at eight digits', () => {
    expect(maskDateInput('202608291234')).toBe('2026-08-29');
  });
});

describe('isValidDate', () => {
  it('accepts real dates', () => {
    expect(isValidDate('2026-08-29')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('rejects dates that look right but do not exist', () => {
    // The case a pattern check alone would let through.
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2025-02-29')).toBe(false);
  });

  it('rejects incomplete input', () => {
    expect(isValidDate('2026-08')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
});

describe('addDaysIso', () => {
  it('moves across month and year boundaries', () => {
    expect(addDaysIso('2026-08-30', 2)).toBe('2026-09-01');
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(addDaysIso('nonsense', 1)).toBe('nonsense');
  });
});

describe('todayIso', () => {
  it('formats the local calendar day', () => {
    // Local, not UTC: the date the user sees on their own device is the one
    // that should be pre-filled in a form.
    expect(todayIso(new Date(2026, 7, 29, 23, 30))).toBe('2026-08-29');
    expect(todayIso(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});
