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

/** Formats money for display. The value stays a decimal string end to end. */
export function formatMoney(locale: Locale, amount: string, currency: string): string {
  const numeric = Number(amount);
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Arabic-Indic digits hurt readability for finance staff scanning numbers.
    numberingSystem: 'latn',
  });
  return Number.isFinite(numeric) ? formatter.format(numeric) : `${amount} ${currency}`;
}

/** Formats a `YYYY-MM-DD` calendar date without shifting it by timezone. */
export function formatDate(locale: Locale, isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    calendar: 'gregory',
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
export function formatDateTime(locale: Locale, isoDateTime: string, timeZone?: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    calendar: 'gregory',
    numberingSystem: 'latn',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export { ar as arMessages, en as enMessages };
