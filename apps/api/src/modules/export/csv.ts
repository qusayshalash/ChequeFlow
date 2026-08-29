/**
 * Minimal RFC 4180 CSV writer.
 *
 * Written by hand rather than pulled from a dependency because the rules are
 * short and the two that matter are easy to get wrong:
 *
 *  - a field containing a comma, quote, CR or LF must be quoted, and quotes
 *    inside it doubled;
 *  - a field that starts with `=`, `+`, `-` or `@` is treated as a formula by
 *    Excel and Google Sheets. Exported cheque data is attacker-influenced
 *    (drawer names, notes), so such fields are prefixed with a single quote.
 *    This is CSV injection, and it is a real vulnerability, not a nicety.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvRow(values: readonly (string | number | null | undefined)[]): string {
  return values.map(csvField).join(',');
}

/**
 * Renders a full CSV document.
 *
 * The UTF-8 BOM is deliberate: without it Excel on Windows opens the file in
 * the local ANSI codepage and every Arabic name turns to mojibake.
 */
/** U+FEFF, written as an escape because the literal character is invisible. */
const BOM = '\uFEFF';

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return `${BOM}${[csvRow(headers), ...rows.map(csvRow)].join('\r\n')}\r\n`;
}
