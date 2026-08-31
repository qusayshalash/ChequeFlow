/**
 * Helpers for entering a book of serial cheques.
 *
 * A customer rarely hands over one cheque. They hand over a strip torn from a
 * cheque book: consecutive numbers, one due date a month apart, everything else
 * — bank, drawer, currency — identical. Entering twenty of those one form at a
 * time is twenty chances to mistype a bank name.
 *
 * These functions produce the *suggestion* for the next row. They are
 * deliberately pure and shared by the API, the web app and the phone, so the
 * number the user is offered on one screen is the number the others would have
 * offered too.
 */

/** Days in a given month, `month` being 1-12. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `YYYY-MM-DD` shifted by whole months, keeping the day of the month.
 *
 * The day is clamped to the end of the target month, which is what a bank does
 * with a cheque dated the 31st in a 30-day month: 2026-01-31 + 1 month is
 * 2026-02-28, not 2026-03-03. Naive date arithmetic overflows into the next
 * month instead, and the error is invisible until a cheque is chased a week
 * late.
 */
export function addMonthsIso(isoDate: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Months counted from zero make the year rollover fall out of the division
  // rather than needing a branch for December.
  const absolute = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;

  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth).padStart(2, '0'),
    String(clampedDay).padStart(2, '0'),
  ].join('-');
}

/**
 * The next number in a cheque book, or `null` when it cannot be derived.
 *
 * Width is preserved because cheque numbers are printed with leading zeros and
 * are matched as text: the cheque after `00099` is `00100`, never `100`. A
 * number that would grow past its printed width (`999` → `1000`) is allowed to
 * grow — the alternative is silently wrapping to `000`.
 *
 * Returns `null` for anything that is not a plain run of digits — some books
 * carry a branch prefix, and guessing at those would put a wrong number on a
 * real cheque.
 */
export function nextChequeNumber(current: string, step = 1): string | null {
  const trimmed = current.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  // Beyond this, JavaScript integers stop being exact and the "next" number
  // would be a lie.
  if (trimmed.length > 15) return null;

  const next = Number(trimmed) + step;
  if (next < 0) return null;

  return String(next).padStart(trimmed.length, '0');
}

/** One row of a serial batch: everything that differs from cheque to cheque. */
export interface SerialChequeRow {
  chequeNumber: string;
  amount: string;
  dueDate: string;
}

/**
 * The row to append to a batch that already holds `rows`.
 *
 * The due date is measured from the *first* row, not the last one. Stepping
 * from the previous row would creep: a book starting on 31 January would go
 * 31 Jan, 28 Feb, then 28 March and stay on the 28th for the rest of the year,
 * while the printed cheques all say 31. Anchoring on the first row keeps every
 * date on the day the customer actually wrote.
 *
 * The amount is deliberately absent: it is the one field the user must read off
 * the cheque in front of them, and pre-filling it invites a whole book of
 * cheques carrying the first one's amount.
 */
export function suggestNextRow(
  rows: readonly SerialChequeRow[],
  monthStep = 1,
): Omit<SerialChequeRow, 'amount'> {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return { chequeNumber: '', dueDate: '' };

  return {
    chequeNumber: nextChequeNumber(last.chequeNumber) ?? '',
    dueDate: addMonthsIso(first.dueDate, rows.length * monthStep),
  };
}

/** Upper bound on one batch, enforced by the API and mirrored in both clients. */
export const MAX_SERIAL_CHEQUES = 60;
