/**
 * What counts as money the company is still waiting on.
 *
 * "Outstanding" and "overdue" are decided here, once, so the dashboard, the
 * reports, the list filters and the mobile badges can never disagree about
 * which cheques are late.
 */

import { ChequeStatus } from './enums.js';
import type { IsoDateString } from './domain.js';

/** Statuses where the cheque has not yet resolved into cash or a dead end. */
export const OUTSTANDING_CHEQUE_STATUSES: readonly ChequeStatus[] = [
  ChequeStatus.IN_HAND,
  ChequeStatus.RESERVED,
  ChequeStatus.DEPOSITED,
  ChequeStatus.TRANSFERRED,
  ChequeStatus.POSTPONED,
];

/** Statuses where the cheque is with the bank waiting to clear. */
export const AT_BANK_CHEQUE_STATUSES: readonly ChequeStatus[] = [ChequeStatus.DEPOSITED];

export function isOutstandingStatus(status: ChequeStatus): boolean {
  return OUTSTANDING_CHEQUE_STATUSES.includes(status);
}

/**
 * A cheque is overdue when its due date has passed and it is still
 * outstanding. A cleared, cancelled or returned cheque is never overdue —
 * it is simply finished.
 *
 * `today` is passed in rather than read from the clock so the caller decides
 * the reference day (the server's UTC day for API responses), which also
 * makes this testable.
 */
export function isChequeOverdue(
  status: ChequeStatus,
  dueDate: IsoDateString,
  today: IsoDateString,
): boolean {
  return isOutstandingStatus(status) && dueDate < today;
}

/** The server's current UTC calendar day as `YYYY-MM-DD`. */
export function utcToday(now: Date = new Date()): IsoDateString {
  return now.toISOString().slice(0, 10);
}
