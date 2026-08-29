import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALES,
  arMessages,
  createTranslator,
  enMessages,
  daysUntil,
  formatDate,
  formatDueDistance,
  formatMoney,
  getDirection,
  isRtl,
  translate,
} from './index.js';

type Nested = { [key: string]: string | Nested };

function collectKeys(object: Nested, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : collectKeys(value, path);
  });
}

describe('localization', () => {
  it('defaults to Arabic and RTL', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(getDirection('ar')).toBe('rtl');
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });

  it('keeps both catalogues structurally identical', () => {
    const arKeys = collectKeys(arMessages).sort();
    const enKeys = collectKeys(enMessages).sort();
    expect(enKeys).toEqual(arKeys);
  });

  it('has no empty translations', () => {
    for (const locale of LOCALES) {
      const dictionary = locale === 'ar' ? arMessages : enMessages;
      for (const key of collectKeys(dictionary)) {
        expect(translate(locale, key).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('translates every cheque status and event type', () => {
    for (const status of Object.keys(arMessages.status)) {
      expect(translate('ar', `status.${status}`)).not.toBe(`status.${status}`);
      expect(translate('en', `status.${status}`)).not.toBe(`status.${status}`);
    }
  });

  it('interpolates values', () => {
    expect(translate('ar', 'reminders.beforeDue', { days: 3 })).toContain('3');
  });

  it('falls back to the key when a translation is missing', () => {
    expect(translate('ar', 'does.not.exist')).toBe('does.not.exist');
  });

  it('creates a bound translator', () => {
    const t = createTranslator('en');
    expect(t('common.save')).toBe('Save');
  });

  it('formats a calendar date without timezone drift', () => {
    expect(formatDate('en', '2026-01-01')).toContain('2026');
    expect(formatDate('en', '2026-01-01')).toContain('01');
  });

  it('renders the Hijri calendar when asked, without changing the stored date', () => {
    const gregorian = formatDate('ar', '2026-08-29', 'gregory');
    const hijri = formatDate('ar', '2026-08-29', 'islamic-umalqura');
    expect(gregorian).toContain('2026');
    expect(hijri).toContain('1448');
    expect(hijri).not.toBe(gregorian);
  });
});

/**
 * `Intl` separates the amount from the currency code with a non-breaking
 * space, and prefixes RTL output with U+200F so the whole string renders in
 * the right order. Both are wanted in the UI but make literal comparison
 * awkward, so they are normalised away for assertions.
 */
function plain(value: string): string {
  return value.replaceAll('\u00a0', ' ').replaceAll('\u200f', '');
}

describe('formatMoney', () => {
  it('writes the ISO code, never a symbol', () => {
    // The regression this guards: in Arabic, `Intl` renders USD as "US$",
    // which an RTL line displays as "$US" — a currency that does not exist.
    for (const locale of LOCALES) {
      const formatted = plain(formatMoney(locale, '4000', 'USD'));
      expect(formatted).toContain('USD');
      expect(formatted).not.toContain('$');
      expect(formatted).toContain('4,000.00');
    }
  });

  it('uses Latin digits in Arabic so figures stay scannable', () => {
    expect(plain(formatMoney('ar', '1234.5', 'ILS'))).toContain('1,234.50');
  });

  it('keeps the RTL mark that makes Arabic render in the right order', () => {
    // Without U+200F the amount and the code swap places on screen.
    expect(formatMoney('ar', '4000', 'USD').startsWith('\u200f')).toBe(true);
  });

  it('always shows two decimal places', () => {
    expect(plain(formatMoney('en', '10', 'JOD'))).toBe('JOD 10.00');
  });

  it('degrades readably rather than printing NaN', () => {
    expect(plain(formatMoney('en', 'not-a-number', 'USD'))).toBe('USD not-a-number');
  });
});

describe('daysUntil / formatDueDistance', () => {
  it('counts calendar days in both directions', () => {
    expect(daysUntil('2026-08-29', '2026-08-29')).toBe(0);
    expect(daysUntil('2026-08-30', '2026-08-29')).toBe(1);
    expect(daysUntil('2026-08-27', '2026-08-29')).toBe(-2);
    // Across a month boundary, where naive arithmetic goes wrong.
    expect(daysUntil('2026-09-01', '2026-08-30')).toBe(2);
  });

  it('describes the distance in words', () => {
    expect(formatDueDistance('en', '2026-08-29', '2026-08-29')).toBe('Due today');
    expect(formatDueDistance('en', '2026-08-30', '2026-08-29')).toBe('Due tomorrow');
    expect(formatDueDistance('en', '2026-09-03', '2026-08-29')).toContain('5');
    expect(formatDueDistance('en', '2026-08-24', '2026-08-29')).toContain('5');
  });
});
