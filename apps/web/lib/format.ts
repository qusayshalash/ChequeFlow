import { formatDate, formatDateTime, formatMoney, type Locale } from '@cheque-flow/localization';

export { formatDate, formatDateTime, formatMoney };

/** Days until a due date; negative means overdue. */
export function daysUntil(isoDate: string, today = new Date()): number {
  const due = Date.parse(`${isoDate}T00:00:00.000Z`);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - start) / 86_400_000);
}

export function isOverdue(isoDate: string, today = new Date()): boolean {
  return daysUntil(isoDate, today) < 0;
}

/** Money formatter bound to a locale, for table cells. */
export function money(locale: Locale, amount: string, currency: string): string {
  return formatMoney(locale, amount, currency);
}
