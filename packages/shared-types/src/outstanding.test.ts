import { describe, expect, it } from 'vitest';

import { ChequeStatus } from './enums.js';
import { isChequeOverdue, isOutstandingStatus, utcToday } from './outstanding.js';

describe('isOutstandingStatus', () => {
  it('treats cheques still in play as outstanding', () => {
    expect(isOutstandingStatus(ChequeStatus.IN_HAND)).toBe(true);
    expect(isOutstandingStatus(ChequeStatus.DEPOSITED)).toBe(true);
    expect(isOutstandingStatus(ChequeStatus.POSTPONED)).toBe(true);
  });

  it('excludes finished and not-yet-real cheques', () => {
    // A draft has not been received yet, and a cleared cheque is already cash.
    expect(isOutstandingStatus(ChequeStatus.DRAFT)).toBe(false);
    expect(isOutstandingStatus(ChequeStatus.CLEARED)).toBe(false);
    expect(isOutstandingStatus(ChequeStatus.CANCELLED)).toBe(false);
    expect(isOutstandingStatus(ChequeStatus.BOUNCED)).toBe(false);
  });
});

describe('isChequeOverdue', () => {
  const today = '2026-08-29';

  it('flags an outstanding cheque whose due date has passed', () => {
    expect(isChequeOverdue(ChequeStatus.IN_HAND, '2026-08-28', today)).toBe(true);
  });

  it('does not flag a cheque due today', () => {
    // Due today is due, not late: the payer still has the whole day.
    expect(isChequeOverdue(ChequeStatus.IN_HAND, today, today)).toBe(false);
  });

  it('does not flag a cheque due in the future', () => {
    expect(isChequeOverdue(ChequeStatus.IN_HAND, '2026-09-01', today)).toBe(false);
  });

  it('never flags a finished cheque, however old', () => {
    // This is the case that makes the shared helper worth having: a cheque
    // cleared years ago must not show up as late anywhere in the product.
    expect(isChequeOverdue(ChequeStatus.CLEARED, '2020-01-01', today)).toBe(false);
    expect(isChequeOverdue(ChequeStatus.CANCELLED, '2020-01-01', today)).toBe(false);
    expect(isChequeOverdue(ChequeStatus.RETURNED, '2020-01-01', today)).toBe(false);
  });

  it('compares dates as strings, which is safe for ISO calendar dates', () => {
    // Lexicographic order equals chronological order for YYYY-MM-DD, including
    // across month and year boundaries.
    expect(isChequeOverdue(ChequeStatus.IN_HAND, '2025-12-31', '2026-01-01')).toBe(true);
    expect(isChequeOverdue(ChequeStatus.IN_HAND, '2026-01-02', '2026-01-01')).toBe(false);
  });
});

describe('utcToday', () => {
  it('returns the UTC calendar day, not the local one', () => {
    // 00:30 UTC on the 29th is still the 28th in the Americas; the server day
    // is what the API reports, so everyone sees the same "today".
    expect(utcToday(new Date('2026-08-29T00:30:00.000Z'))).toBe('2026-08-29');
    expect(utcToday(new Date('2026-08-29T23:59:59.999Z'))).toBe('2026-08-29');
  });
});
