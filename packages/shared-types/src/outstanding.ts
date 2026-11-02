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

/**
 * The current UTC calendar day as `YYYY-MM-DD`.
 *
 * Not "today" for anyone. It was used as today everywhere, and for an
 * organization two or three hours east of Greenwich that meant the business
 * day changed at two or three in the morning: a cheque due today was not due
 * until then, and "overdue" switched on that much late, every night. Kept for
 * the few callers that genuinely mean UTC; anything that means the business
 * day uses `todayIn` with the organization's time zone.
 */
export function utcToday(now: Date = new Date()): IsoDateString {
  return now.toISOString().slice(0, 10);
}

/** True for a zone the runtime can actually format in. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The calendar fields of an instant, as a wall clock in `timeZone` reads them. */
function wallClock(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * The organization's current calendar day as `YYYY-MM-DD`.
 *
 * Read from `Intl` rather than a time-zone library: the runtime already knows
 * every zone and its daylight-saving rules, and those rules change by decree
 * more often than a bundled table is updated. An unknown zone falls back to
 * UTC rather than throwing — a misconfigured setting must not take the
 * dashboard down.
 */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDateString {
  if (!isValidTimeZone(timeZone)) return utcToday(now);
  const { year, month, day } = wallClock(now.getTime(), timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The instant at which it is `hour:00` on `isoDate` in `timeZone`.
 *
 * What a reminder for "eight in the morning on the due date" has to be stored
 * as. Found by asking the zone what its clock reads at a first guess and
 * correcting by the difference, twice, so that a day on which the clocks move
 * still lands on the hour that exists.
 */
export function instantAt(isoDate: IsoDateString, hour: number, timeZone: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(year, month - 1, day, hour);
  if (!isValidTimeZone(timeZone)) return new Date(target);

  let guess = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = wallClock(guess, timeZone);
    const shown = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    );
    guess += target - shown;
  }
  return new Date(guess);
}
