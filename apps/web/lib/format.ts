import { formatDate, formatDateTime, formatMoney, type Locale } from '@cheque-flow/localization';

export { formatDate, formatDateTime, formatMoney };

/** Days until a due date; negative means the date has passed. */
export function daysUntil(isoDate: string, today = new Date()): number {
  const due = Date.parse(`${isoDate}T00:00:00.000Z`);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - start) / 86_400_000);
}

/*
 * There is deliberately no `isOverdue(date)` here.
 *
 * It used to exist and compared dates alone, so a cheque cleared years ago
 * rendered in red as though it were still owed. Whether a cheque is late
 * depends on its status as well as its date, that rule lives in
 * `@cheque-flow/shared-types`, and the API already applies it — every cheque
 * arrives with `isOverdue` on it. Use that field.
 */

/** Money formatter bound to a locale, for table cells. */
export function money(locale: Locale, amount: string, currency: string): string {
  return formatMoney(locale, amount, currency);
}
