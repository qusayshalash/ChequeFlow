/**
 * Turning spreadsheet rows into cheques to import.
 *
 * Kept free of React and of the API so the rules that decide what a cell
 * means (which column is the amount, what "20/11/2026" is, whether «وارد»
 * is incoming) are plain functions with tests of their own.
 */
import { foldBankName } from '@cheque-flow/shared-types';
import { moneySchema } from '@cheque-flow/validation';

import type { Sheet } from './spreadsheet';

export type ImportField =
  'chequeNumber' | 'amount' | 'currency' | 'dueDate' | 'bank' | 'contact' | 'direction';

/**
 * Header words for each field, compared after folding (hamza, taa marbuta,
 * case, spacing), so «تاريخ الإستحقاق» and «تاريخ الاستحقاق» both match.
 */
const HEADERS: Record<ImportField, string[]> = {
  chequeNumber: [
    'رقم الشيك',
    'الرقم',
    'رقم',
    'cheque number',
    'check number',
    'cheque no',
    'number',
    'no',
  ],
  amount: ['المبلغ', 'القيمة', 'قيمة الشيك', 'amount', 'value'],
  currency: ['العملة', 'currency'],
  dueDate: ['تاريخ الاستحقاق', 'الاستحقاق', 'تاريخ', 'التاريخ', 'due date', 'due', 'date'],
  bank: ['البنك', 'اسم البنك', 'بنك', 'bank', 'bank name'],
  contact: [
    'الجهة',
    'العميل',
    'الزبون',
    'المورد',
    'الاسم',
    'اسم الجهة',
    'contact',
    'customer',
    'supplier',
    'name',
    'party',
  ],
  direction: ['النوع', 'الاتجاه', 'وارد صادر', 'direction', 'type'],
};

/** Which column holds which field, from the header row. */
export function detectColumns(header: string[]): Partial<Record<ImportField, number>> {
  const folded = header.map((cell) => foldBankName(cell));
  const columns: Partial<Record<ImportField, number>> = {};
  for (const field of Object.keys(HEADERS) as ImportField[]) {
    const words = HEADERS[field].map((word) => foldBankName(word));
    // Exact header first, so "date" does not grab a column named "due date"
    // before the due-date field has looked for it.
    const index = folded.findIndex(
      (cell, i) => words.includes(cell) && !Object.values(columns).includes(i),
    );
    if (index >= 0) columns[field] = index;
  }
  return columns;
}

/** Arabic-Indic and Persian digits, and the Arabic decimal and thousands marks. */
function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/** "1,500.50", "١٥٠٠", "1500 ₪" → "1500.50"; null when it is not an amount. */
export function parseAmount(cell: string): string | null {
  const text = westernDigits(cell).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(text)) return null;
  // A comma followed by exactly two digits at the end is a decimal comma
  // ("1.500,50"); otherwise commas are thousands separators.
  const normalized =
    /,\d{2}$/.test(text) && !/\.\d{2}$/.test(text)
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  const parsed = moneySchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoIfValid(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * A due date, as YYYY-MM-DD.
 *
 * Accepts ISO dates, day-first dates (20/11/2026, 20-11-2026, 20.11.2026: the
 * order used in the region, so 03/04 is the 3rd of April), and Excel's date
 * serial numbers, which is how a date cell arrives from an .xlsx file.
 */
export function parseDueDate(cell: string): string | null {
  const text = westernDigits(cell).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoIfValid(year, Number(m[2]), Number(m[1]));
  }
  // Excel counts days from 1899-12-30. 20000–80000 is 1954–2119: any number
  // in a date column outside that is not a date.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial < 20_000 || serial > 80_000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

const CURRENCY_WORDS: Record<string, string> = {
  '₪': 'ILS',
  شيكل: 'ILS',
  شيقل: 'ILS',
  شاقل: 'ILS',
  nis: 'ILS',
  $: 'USD',
  دولار: 'USD',
  دينار: 'JOD',
  '€': 'EUR',
  يورو: 'EUR',
};

/** "₪", "شيكل", "usd" → ISO code; null when it is not one. */
export function parseCurrency(cell: string): string | null {
  const text = cell.trim();
  if (text === '') return null;
  const word = CURRENCY_WORDS[foldBankName(text)] ?? CURRENCY_WORDS[text];
  if (word) return word;
  return /^[A-Za-z]{3}$/.test(text) ? text.toUpperCase() : null;
}

/** «وارد» / «صادر», in either language; null when the cell says neither. */
export function parseDirection(cell: string): 'INCOMING' | 'OUTGOING' | null {
  const text = foldBankName(cell);
  if (['وارد', 'incoming', 'in', 'received', 'مستلم'].includes(text)) return 'INCOMING';
  if (['صادر', 'outgoing', 'out', 'issued', 'مدفوع'].includes(text)) return 'OUTGOING';
  return null;
}

export interface ImportRow {
  /** The spreadsheet line, 1-based, so a message can point at it. */
  line: number;
  chequeNumber: string;
  amount: string | null;
  currency: string | null;
  dueDate: string | null;
  bankName: string;
  contactName: string;
  direction: 'INCOMING' | 'OUTGOING' | null;
  /** Translation keys of what is wrong with the row; empty when it can go in. */
  errors: string[];
}

export interface ParsedImport {
  columns: Partial<Record<ImportField, number>>;
  /** Required columns the header row did not name. */
  missing: ImportField[];
  rows: ImportRow[];
}

const REQUIRED: ImportField[] = ['chequeNumber', 'amount', 'dueDate'];

/**
 * Reads the sheet. The first non-empty row is the header; the currency and
 * direction fall back to the defaults chosen on the page when a row (or the
 * whole sheet) does not say.
 */
export function parseChequeSheet(
  sheet: Sheet,
  defaults: { currency: string; direction: 'INCOMING' | 'OUTGOING' },
): ParsedImport {
  const headerIndex = sheet.findIndex((row) => row.some((cell) => cell !== ''));
  if (headerIndex < 0) return { columns: {}, missing: REQUIRED, rows: [] };
  const columns = detectColumns(sheet[headerIndex]!);
  const missing = REQUIRED.filter((field) => columns[field] === undefined);
  if (missing.length > 0) return { columns, missing, rows: [] };

  const cell = (row: string[], field: ImportField) => {
    const index = columns[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  const rows: ImportRow[] = [];
  sheet.slice(headerIndex + 1).forEach((row, offset) => {
    if (row.every((value) => value.trim() === '')) return;
    const errors: string[] = [];
    const chequeNumber = westernDigits(cell(row, 'chequeNumber'));
    if (chequeNumber === '') errors.push('import.error.number');

    const amountCell = cell(row, 'amount');
    const amount = parseAmount(amountCell);
    if (amount === null || Number(amount) <= 0) errors.push('import.error.amount');

    const dueDate = parseDueDate(cell(row, 'dueDate'));
    if (dueDate === null) errors.push('import.error.dueDate');

    const currencyCell = cell(row, 'currency');
    const currency = currencyCell === '' ? defaults.currency : parseCurrency(currencyCell);
    if (currency === null) errors.push('import.error.currency');

    const directionCell = cell(row, 'direction');
    const direction = directionCell === '' ? defaults.direction : parseDirection(directionCell);
    if (direction === null) errors.push('import.error.direction');

    rows.push({
      line: headerIndex + offset + 2,
      chequeNumber,
      amount,
      currency,
      dueDate,
      bankName: cell(row, 'bank'),
      contactName: cell(row, 'contact'),
      direction,
      errors,
    });
  });

  // The same number twice in one file is a typo, as it is in a batch.
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    if (row.chequeNumber === '') continue;
    const key = `${row.chequeNumber.toUpperCase()}|${foldBankName(row.bankName)}`;
    if (seen.has(key)) row.errors.push('import.error.repeated');
    else seen.set(key, row);
  }

  return { columns, missing, rows };
}

/** The template offered for download: the headers the import reads best. */
export const IMPORT_TEMPLATE_CSV =
  '\uFEFFرقم الشيك,المبلغ,العملة,تاريخ الاستحقاق,البنك,الجهة,النوع\n' +
  '100231,1500.00,ILS,2026-12-15,بنك فلسطين,محلات الأمل,وارد\n';
