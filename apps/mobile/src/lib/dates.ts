/**
 * Calendar-date helpers for the capture and edit forms.
 *
 * The app deliberately does not use a native date picker: it would add a
 * platform dependency for a field that finance staff type faster than they
 * scroll, and cheque dates are read off a printed cheque digit by digit.
 * Instead the input is masked to `YYYY-MM-DD` and validated here.
 */

/** The device's current calendar date as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` shifted by whole days, staying on the calendar. */
export function addDaysIso(isoDate: string, days: number): string {
  const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return isoDate;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Formats keystrokes into `YYYY-MM-DD` as the user types.
 *
 * Everything that is not a digit is dropped, then separators are re-inserted,
 * so paste, backspace and typing the dashes by hand all behave the same.
 */
export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/**
 * Whether a string is a real calendar date.
 *
 * Checks the round trip rather than just the pattern, so `2026-02-31` — which
 * matches the shape and is a date a person can easily mistype — is rejected.
 */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
