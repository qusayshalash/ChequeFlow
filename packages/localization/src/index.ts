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

/** BCP-47 tag used for number and date formatting in each locale. */
function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA' : 'en-GB';
}

/**
 * Formats money for display. The value stays a decimal string end to end.
 *
 * The currency is rendered as its ISO code (`USD 4,000.00`) rather than as a
 * symbol. In Arabic, `Intl` renders the USD symbol as `US$`, which a
 * right-to-left line then displays as `$US` — a currency that does not exist.
 * The three-letter code is unambiguous in both directions and is what finance
 * staff read anyway.
 */
export function formatMoney(locale: Locale, amount: string, currency: string): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${currency} ${amount}`;

  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Arabic-Indic digits hurt readability for finance staff scanning numbers.
    numberingSystem: 'latn',
  }).format(numeric);
}

/**
 * Formats a `YYYY-MM-DD` calendar date without shifting it by timezone.
 *
 * `calendar` chooses the reckoning shown to the reader. The stored value never
 * changes — only its presentation.
 */
export function formatDate(
  locale: Locale,
  isoDate: string,
  calendar: CalendarPreference = DEFAULT_CALENDAR,
): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;

  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    calendar,
    numberingSystem: 'latn',
    // A calendar date has no timezone: format it in UTC so it never shifts
    // by a day depending on where the viewer is.
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Formats a UTC instant. Timestamps are stored in UTC and rendered in the
 * viewer's timezone, or in `timeZone` when the organization pins one.
 */
export function formatDateTime(
  locale: Locale,
  isoDateTime: string,
  options: { timeZone?: string; calendar?: CalendarPreference } = {},
): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;

  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    calendar: options.calendar ?? DEFAULT_CALENDAR,
    numberingSystem: 'latn',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
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
  if (days > 1) return translate(locale, 'due.inDays', { days });
  return translate(locale, 'due.lateDays', { days: Math.abs(days) });
}

export { ar as arMessages, en as enMessages };
