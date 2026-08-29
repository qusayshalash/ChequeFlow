import type { ChequeExtractedFields, ExtractedField } from '@cheque-flow/shared-types';

/**
 * Turns the raw text of a scanned cheque into typed fields.
 *
 * Plain OCR engines (Google Vision, Tesseract) return characters and boxes,
 * not meaning, so this module supplies the meaning. It is deliberately pure
 * and free of any vendor type, which keeps it unit-testable without a network
 * call and reusable by any text-only provider.
 *
 * The heuristics are conservative on purpose: a field is only reported when
 * the text actually supports it. Anything found by pattern alone is scored
 * below the review threshold so the reviewer is asked to confirm it.
 */

export interface ParseChequeTextInput {
  /** Full recognised text, newline separated. */
  text: string;
  /** The engine's own average confidence for the page, in [0, 1]. */
  engineConfidence?: number;
  /** Bank names the organization already has on file. */
  knownBankNames?: readonly string[];
  /** Currency the organization normally uses, as a tie-breaker. */
  expectedCurrency?: string;
}

/** Confidence assigned to a value found next to an explicit label. */
const ANCHORED = 0.7;
/** Confidence assigned to a value recognised by shape alone. */
const PATTERN_ONLY = 0.5;
/** Confidence for the cheque number read out of the MICR line. */
const MICR_DERIVED = 0.8;

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const ARABIC_DECIMAL_SEPARATOR = /٫/g;
const ARABIC_THOUSANDS_SEPARATOR = /٬/g;

/**
 * Currency words and codes that appear on cheques, most likely first.
 *
 * The shekel is listed first because it is the common case here and was
 * previously missing altogether — a shekel cheque came back with no currency
 * at all. `₪` and the NIS code are included because both are printed.
 */
const CURRENCY_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: 'ILS', pattern: /\bILS\b|\bNIS\b|₪|شيكل|شيقل|ش\.?\s*ج\b/i },
  { code: 'JOD', pattern: /\bJOD\b|دينار\s*أردني|د\.?\s*أ\b/i },
  { code: 'USD', pattern: /\bUSD\b|دولار|\$/i },
  { code: 'EUR', pattern: /\bEUR\b|يورو|€/i },
  { code: 'EGP', pattern: /\bEGP\b|جنيه/i },
  { code: 'AED', pattern: /\bAED\b|درهم|د\.?\s*إ\b/i },
  { code: 'KWD', pattern: /\bKWD\b|دينار\s*كويتي/i },
];

const DUE_DATE_LABELS = /استحقاق|يستحق|due\s*date|payable\s*on/i;
const ISSUE_DATE_LABELS = /تحرير|إصدار|اصدار|issue\s*date|date\s*of\s*issue/i;
const PAYEE_LABELS = /ادفعوا?\s*لأمر|ادفعوا?\s*إلى|لأمر\b|pay\s*(to\s*the\s*order\s*of|to)/i;
const DRAWER_LABELS = /الساحب|اسم\s*العميل|drawer|account\s*holder/i;
const CHEQUE_NUMBER_LABELS = /رقم\s*الشيك|شيك\s*رقم|cheque\s*(no|number)|check\s*(no|number)/i;
const WRITTEN_AMOUNT_MARKERS = /فقط|لا\s*غير|only\b/i;

/** Normalises Arabic-Indic digits and separators to their ASCII equivalents. */
export function normalizeDigits(value: string): string {
  return value
    .replace(ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(ARABIC_DECIMAL_SEPARATOR, '.')
    .replace(ARABIC_THOUSANDS_SEPARATOR, ',');
}

function empty<T>(): ExtractedField<T> {
  return { value: null, confidence: 0 };
}

function found<T>(value: T, confidence: number, rawText?: string): ExtractedField<T> {
  return {
    value,
    confidence: Number(Math.min(1, Math.max(0, confidence)).toFixed(3)),
    ...(rawText === undefined ? {} : { rawText }),
  };
}

/**
 * The magnetic line along the bottom edge. It is the most reliable part of a
 * cheque for a text engine: a fixed font, digits only, and no handwriting.
 */
export function findMicrLine(lines: readonly string[]): string | null {
  const candidates = lines
    .map((line) => normalizeDigits(line).trim())
    // MICR delimiters survive OCR as these symbols or as punctuation.
    .filter((line) => /^[\d\s⑆-⑉:;<>@#|/-]+$/.test(line))
    .filter((line) => (line.match(/\d/g) ?? []).length >= 12);

  if (candidates.length === 0) return null;
  // The longest run of digits is the most likely to be the real MICR line.
  return candidates.reduce((best, line) =>
    (line.match(/\d/g) ?? []).length > (best.match(/\d/g) ?? []).length ? line : best,
  );
}

/** Digit groups of the MICR line, longest-lived first. */
function micrGroups(micr: string): string[] {
  return micr.split(/[^\d]+/).filter((group) => group.length > 0);
}

function extractChequeNumber(
  lines: readonly string[],
  micr: string | null,
): ExtractedField<string> {
  const labelled = findAfterLabel(lines, CHEQUE_NUMBER_LABELS);
  const labelledDigits = labelled ? /(\d{4,12})/.exec(normalizeDigits(labelled)) : null;
  if (labelledDigits?.[1]) {
    return found(labelledDigits[1], ANCHORED, labelled ?? undefined);
  }

  if (micr) {
    const groups = micrGroups(micr);
    // On most Gulf cheque layouts the leading MICR group is the serial number.
    const serial = groups.find((group) => group.length >= 5 && group.length <= 10);
    if (serial) return found(serial, MICR_DERIVED, micr);
  }

  // A standalone 6-10 digit run anywhere on the cheque, as a last resort.
  for (const line of lines) {
    const match = /(?<!\d)(\d{6,10})(?!\d)/.exec(normalizeDigits(line));
    if (match?.[1]) return found(match[1], PATTERN_ONLY, line);
  }

  return empty<string>();
}

function extractAccountNumber(
  lines: readonly string[],
  micr: string | null,
  chequeNumber: string | null,
): ExtractedField<string> {
  if (micr) {
    const groups = micrGroups(micr).filter((group) => group !== chequeNumber);
    const account = groups.find((group) => group.length >= 8 && group.length <= 20);
    if (account) return found(account, MICR_DERIVED, micr);
  }

  for (const line of lines) {
    const match = /(?<!\d)(\d{10,20})(?!\d)/.exec(normalizeDigits(line));
    if (match?.[1] && match[1] !== chequeNumber) {
      return found(match[1], PATTERN_ONLY, line);
    }
  }

  return empty<string>();
}

/**
 * Picks the monetary amount.
 *
 * A value written with two decimals is preferred, because that is how the
 * amount box is filled in; bare integers are far more likely to be a date
 * part, an account fragment, or a cheque number.
 */
function extractNumericAmount(lines: readonly string[]): ExtractedField<string> {
  const candidates: Array<{ value: string; decimals: boolean; line: string }> = [];

  for (const line of lines) {
    const normalized = normalizeDigits(line);
    // Skip the MICR line and anything that is clearly a date.
    if (/^[\d\s⑆-⑉:;<>@#|/-]+$/.test(normalized.trim())) continue;

    const pattern =
      /(?<![\d./-])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d{2,9})(?![\d/-])/g;
    for (const match of normalized.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const cleaned = raw.replace(/,/g, '');
      const numeric = Number(cleaned);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      candidates.push({ value: cleaned, decimals: cleaned.includes('.'), line });
    }
  }

  if (candidates.length === 0) return empty<string>();

  const withDecimals = candidates.filter((candidate) => candidate.decimals);
  if (withDecimals.length > 0) {
    // Several decimal amounts usually means the figure box and a duplicate;
    // the largest is the amount, the smaller ones are fragments.
    const best = withDecimals.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
    return found(best.value, ANCHORED, best.line.trim());
  }

  const best = candidates.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
  // No decimal point is a weak signal — never let it pass review unchecked.
  return found(best.value, PATTERN_ONLY - 0.1, best.line.trim());
}

function extractWrittenAmount(lines: readonly string[]): ExtractedField<string> {
  const candidate = lines.find((line) => WRITTEN_AMOUNT_MARKERS.test(line) && line.length > 8);
  return candidate ? found(candidate.trim(), PATTERN_ONLY, candidate.trim()) : empty<string>();
}

function extractCurrency(text: string, expected?: string): ExtractedField<string> {
  for (const { code, pattern } of CURRENCY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      // An explicit ISO code beats a currency word, which can be ambiguous.
      const isCode = /^[A-Z]{3}$/.test(match[0].trim().toUpperCase());
      return found(code, isCode ? 0.9 : ANCHORED, match[0].trim());
    }
  }
  // Fall back to the organization's currency, but flag it for review.
  return expected ? found(expected, 0.3) : empty<string>();
}

/** `dd/mm/yyyy`, `yyyy-mm-dd` and the two-digit-year variants. */
const DATE_PATTERN = /(\d{1,4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/;

export function parseDate(raw: string): string | null {
  const match = DATE_PATTERN.exec(normalizeDigits(raw));
  if (!match) return null;

  const [, first = '', second = '', third = ''] = match;
  let year: number;
  let month: number;
  let day: number;

  if (first.length === 4) {
    // yyyy-mm-dd
    year = Number(first);
    month = Number(second);
    day = Number(third);
  } else {
    // dd/mm/yyyy — the day-first order used across the Gulf.
    day = Number(first);
    month = Number(second);
    year = Number(third);
    if (year < 100) year += year < 70 ? 2000 : 1900;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A Hijri year would land far outside the Gregorian range; refuse it rather
  // than silently producing a wrong date.
  if (year < 1900 || year > 2200) return null;

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Reject impossible calendar days such as 31 February.
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function extractDates(lines: readonly string[]): {
  issueDate: ExtractedField<string>;
  dueDate: ExtractedField<string>;
} {
  const dated = lines
    .map((line) => ({ line, date: parseDate(line) }))
    .filter((entry): entry is { line: string; date: string } => entry.date !== null);

  if (dated.length === 0) {
    return { issueDate: empty<string>(), dueDate: empty<string>() };
  }

  const labelledDue = dated.find((entry) => DUE_DATE_LABELS.test(entry.line));
  const labelledIssue = dated.find((entry) => ISSUE_DATE_LABELS.test(entry.line));

  if (labelledDue || labelledIssue) {
    return {
      issueDate: labelledIssue
        ? found(labelledIssue.date, ANCHORED, labelledIssue.line.trim())
        : empty<string>(),
      dueDate: labelledDue
        ? found(labelledDue.date, ANCHORED, labelledDue.line.trim())
        : empty<string>(),
    };
  }

  if (dated.length === 1) {
    const only = dated[0] as { line: string; date: string };
    // One unlabelled date on a cheque is the date it is payable.
    return {
      issueDate: empty<string>(),
      dueDate: found(only.date, PATTERN_ONLY, only.line.trim()),
    };
  }

  const sorted = [...dated].sort((a, b) => a.date.localeCompare(b.date));
  const earliest = sorted[0] as { line: string; date: string };
  const latest = sorted[sorted.length - 1] as { line: string; date: string };
  return {
    issueDate: found(earliest.date, PATTERN_ONLY, earliest.line.trim()),
    dueDate: found(latest.date, PATTERN_ONLY, latest.line.trim()),
  };
}

/** Returns the text following a label, on the same line or the next one. */
function findAfterLabel(lines: readonly string[], label: RegExp): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const match = label.exec(line);
    if (!match) continue;

    const after = line.slice(match.index + match[0].length).replace(/^[\s:：.-]+/, '');
    if (after.trim().length > 0) return after.trim();

    const next = lines[index + 1];
    if (next && next.trim().length > 0) return next.trim();
  }
  return null;
}

function extractName(lines: readonly string[], label: RegExp): ExtractedField<string> {
  const value = findAfterLabel(lines, label);
  if (!value) return empty<string>();
  // A name made mostly of digits is a misread label, not a name.
  const digits = (value.match(/\d/g) ?? []).length;
  if (digits > value.length / 3) return empty<string>();
  return found(value, ANCHORED, value);
}

function extractBankName(
  text: string,
  lines: readonly string[],
  knownBankNames: readonly string[],
): ExtractedField<string> {
  const haystack = text.toLowerCase();
  for (const name of knownBankNames) {
    if (name.trim().length > 0 && haystack.includes(name.toLowerCase())) {
      // Matching a bank the organization already has on file is strong evidence.
      return found(name, 0.85, name);
    }
  }

  const candidate = lines.find((line) => /بنك|مصرف|\bbank\b/i.test(line));
  return candidate ? found(candidate.trim(), PATTERN_ONLY, candidate.trim()) : empty<string>();
}

/**
 * Runs every heuristic and scales the result by the engine's own confidence,
 * so a blurry scan never produces confident-looking fields.
 */
export function parseChequeText(input: ParseChequeTextInput): ChequeExtractedFields {
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const micr = findMicrLine(lines);
  const chequeNumber = extractChequeNumber(lines, micr);
  const { issueDate, dueDate } = extractDates(lines);

  const fields: ChequeExtractedFields = {
    chequeNumber,
    numericAmount: extractNumericAmount(lines),
    writtenAmount: extractWrittenAmount(lines),
    currency: extractCurrency(input.text, input.expectedCurrency),
    issueDate,
    dueDate,
    drawerName: extractName(lines, DRAWER_LABELS),
    payeeName: extractName(lines, PAYEE_LABELS),
    bankName: extractBankName(input.text, lines, input.knownBankNames ?? []),
    bankBranch: empty<string>(),
    accountNumber: extractAccountNumber(lines, micr, chequeNumber.value),
    micr: micr ? found(micr, MICR_DERIVED, micr) : empty<string>(),
    // Text recognition cannot see a signature. Saying "no" would be a lie, so
    // the field is reported as unread and the reviewer decides.
    signatureDetected: empty<boolean>(),
  };

  const engineConfidence = input.engineConfidence ?? 1;
  if (engineConfidence >= 1) return fields;

  // Scaling only ever lowers a real reading; an unread field stays at zero.
  const scale = <T>(field: ExtractedField<T>): ExtractedField<T> =>
    field.value === null
      ? field
      : { ...field, confidence: Number((field.confidence * engineConfidence).toFixed(3)) };

  return {
    chequeNumber: scale(fields.chequeNumber),
    numericAmount: scale(fields.numericAmount),
    writtenAmount: scale(fields.writtenAmount),
    currency: scale(fields.currency),
    issueDate: scale(fields.issueDate),
    dueDate: scale(fields.dueDate),
    drawerName: scale(fields.drawerName),
    payeeName: scale(fields.payeeName),
    bankName: scale(fields.bankName),
    bankBranch: scale(fields.bankBranch),
    accountNumber: scale(fields.accountNumber),
    micr: scale(fields.micr),
    signatureDetected: scale(fields.signatureDetected),
  };
}
