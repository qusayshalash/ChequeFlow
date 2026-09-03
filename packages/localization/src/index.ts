/**
 * Framework-agnostic localization layer.
 *
 * UI strings never live inside components; they are looked up here by key.
 * Arabic is the default locale and the default text direction is RTL.
 */

import ar from './messages/ar.json';
import en from './messages/en.json';

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export type Direction = 'rtl' | 'ltr';

export const LOCALE_DIRECTION: Readonly<Record<Locale, Direction>> = {
  ar: 'rtl',
  en: 'ltr',
};

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  ar: 'العربية',
  en: 'English',
};

/** Shape of a dictionary, derived from the Arabic catalogue (source of truth). */
export type Messages = typeof ar;

export const messages: Readonly<Record<Locale, Messages>> = {
  ar,
  // `en` is validated against `ar` by `localization.test.ts`; the cast keeps
  // the two catalogues structurally identical without duplicating the type.
  en: en,
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): Direction {
  return LOCALE_DIRECTION[locale];
}

export function isRtl(locale: Locale): boolean {
  return LOCALE_DIRECTION[locale] === 'rtl';
}

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

type MessageValue = string | { [key: string]: MessageValue };

function lookup(dictionary: MessageValue, path: readonly string[]): string | undefined {
  let current: MessageValue | undefined = dictionary;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

export type TranslationValues = Record<string, string | number>;

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

/**
 * Resolves a dotted message key, e.g. `translate('ar', 'cheque.dueDate')`.
 * Falls back to the default locale, then to the key itself, so a missing
 * translation degrades to something visible rather than crashing a screen.
 */
export function translate(locale: Locale, key: string, values?: TranslationValues): string {
  const path = key.split('.');
  const template = lookup(messages[locale], path) ?? lookup(messages[DEFAULT_LOCALE], path);
  return template === undefined ? key : interpolate(template, values);
}

/** Creates a bound translator for a locale, the form components consume. */
export function createTranslator(locale: Locale) {
  return (key: string, values?: TranslationValues): string => translate(locale, key, values);
}

export type Translator = ReturnType<typeof createTranslator>;

/**
 * Calendars the interface can render dates in.
 *
 * Gregorian is the default because cheque due dates are legal dates written on
 * the cheque itself, and banks work in Gregorian. Hijri is offered alongside it
 * for readers who think in it — never instead of it.
 */
export const CALENDARS = ['gregory', 'islamic-umalqura'] as const;
export type CalendarPreference = (typeof CALENDARS)[number];

export const DEFAULT_CALENDAR: CalendarPreference = 'gregory';

export const CALENDAR_LABELS: Readonly<Record<CalendarPreference, Record<Locale, string>>> = {
  gregory: { ar: 'ميلادي', en: 'Gregorian' },
  'islamic-umalqura': { ar: 'هجري', en: 'Hijri' },
};

export function isCalendar(value: string): value is CalendarPreference {
  return (CALENDARS as readonly string[]).includes(value);
}

/**
 * Money and calendar dates are formatted by hand rather than through `Intl`.
 *
 * This is not a preference. React Native ships a minimal `Intl` that silently
 * ignores `numberingSystem`, `calendar` and `currencyDisplay`, and falls back
 * to the locale's own defaults. On a device an amount came out as
 * `ILS ٤٠٠,٠٠` — Arabic-Indic digits, a comma where the decimal point belongs —
 * and a Gregorian due date rendered as `١٨ صفر ١٤٤٨ هـ`, a Hijri date the user
 * had not asked for. Node has full ICU, so every test passed while the phone
 * was wrong.
 *
 * For a system of record about money and legal dates, "renders differently
 * depending on the device" is not acceptable. These formatters produce the same
 * bytes everywhere.
 */

/** Groups the integer part in threes: 1234567.5 -> "1,234,567.50". */
function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Renders a decimal string with exactly two fraction digits.
 *
 * Works on the string, never on a `number`: the value arrives as a decimal
 * string precisely so it never passes through binary floating point, and
 * parsing it here to format it would throw that away.
 */
function formatDecimal(amount: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!match) return null;

  const [, sign = '', whole = '0', fraction = ''] = match;
  const cents = `${fraction}00`.slice(0, 2);
  return `${sign}${groupDigits(whole)}.${cents}`;
}

/**
 * Formats money for display: `400.00 ILS`.
 *
 * The currency is its ISO code, never a symbol — in Arabic `Intl` renders USD
 * as `US$`, which a right-to-left line then shows as `$US`, a currency that
 * does not exist. The result is prefixed with U+200F so the amount and the code
 * keep their order in a right-to-left paragraph.
 */
export function formatMoney(locale: Locale, amount: string, currency: string): string {
  const formatted = formatDecimal(amount);
  if (formatted === null) return `${currency}\u00a0${amount}`;

  // Code first in both languages: it reads the same way in English and, with
  // the right-to-left mark, keeps the code and the amount together as one run
  // in an Arabic line instead of letting them drift apart.
  const body = `${currency}\u00a0${formatted}`;
  return locale === 'ar' ? `\u200f${body}` : body;
}

/** Month name for 1-12, from the catalogue so it stays translatable. */
function monthName(locale: Locale, month: number): string {
  return translate(locale, `month.${month}`);
}

/**
 * Formats a `YYYY-MM-DD` calendar date without shifting it by timezone.
 *
 * Gregorian is produced directly, so it is identical on every device. Hijri
 * needs a real calendar conversion and so goes through `Intl`; if the runtime
 * cannot do it, the Gregorian form is returned rather than a wrong date.
 */
export function formatDate(
  locale: Locale,
  isoDate: string,
  calendar: CalendarPreference = DEFAULT_CALENDAR,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return isoDate;

  const gregorian = `${String(day).padStart(2, '0')} ${monthName(locale, month)} ${year}`;
  if (calendar === 'gregory') return gregorian;

  try {
    const rendered = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      calendar: 'islamic-umalqura',
      numberingSystem: 'latn',
      // A calendar date has no timezone: format it in UTC so it never shifts
      // by a day depending on where the viewer is.
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
    return rendered;
  } catch {
    // Better the right day in the wrong calendar than the wrong day.
    return gregorian;
  }
}

/** `HH:MM` in 24-hour form, which is unambiguous in both languages. */
function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats a UTC instant in the viewer's own timezone.
 *
 * Unlike a due date, a timestamp is a moment in time, so it is deliberately
 * rendered in local time — "who moved this cheque, and when, from where I am
 * standing".
 */
/**
 * "26 May" — a date without its year.
 *
 * For axes and other places where thirty dates sit side by side and the year
 * is the same on all of them, so printing it four hundred times costs width
 * and says nothing. Gregorian only: this is a chart tick, not a record, and a
 * Hijri conversion per point would be thirty `Intl` formatters for labels
 * nobody reads individually.
 */
export function formatDayMonth(locale: Locale, isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;

  const month = Number(match[2]);
  if (month < 1 || month > 12) return isoDate;

  return `${Number(match[3])} ${monthName(locale, month)}`;
}

export function formatDateTime(
  locale: Locale,
  isoDateTime: string,
  options: { calendar?: CalendarPreference } = {},
): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;

  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  return `${formatDate(locale, day, options.calendar)} ${formatClock(date)}`;
}

/**
 * Whole days from `today` to `isoDate`; negative when the date has passed.
 *
 * Both arguments are calendar dates, so this counts days on the calendar
 * rather than 24-hour periods — "due tomorrow" stays 1 regardless of the hour.
 */
export function daysUntil(isoDate: string, today: string): number {
  const target = Date.parse(`${isoDate}T00:00:00.000Z`);
  const from = Date.parse(`${today}T00:00:00.000Z`);
  if (Number.isNaN(target) || Number.isNaN(from)) return 0;
  return Math.round((target - from) / 86_400_000);
}

/**
 * "Due today" / "in 3 days" / "5 days late", in the reader's language.
 * Written against the message catalogue so neither app has to build it.
 */
export function formatDueDistance(locale: Locale, isoDate: string, today: string): string {
  const days = daysUntil(isoDate, today);
  if (days === 0) return translate(locale, 'due.today');
  if (days === 1) return translate(locale, 'due.tomorrow');
  if (days === -1) return translate(locale, 'due.yesterday');
  // Arabic has a dual: "خلال ٢ يوم" is wrong where "بعد يومين" is right, and
  // the same applies to two days late.
  if (days === 2) return translate(locale, 'due.twoDays');
  if (days === -2) return translate(locale, 'due.twoDaysLate');
  if (days > 2) return translate(locale, 'due.inDays', { days });
  return translate(locale, 'due.lateDays', { days: Math.abs(days) });
}

export { ar as arMessages, en as enMessages };
