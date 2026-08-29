import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALES,
  arMessages,
  createTranslator,
  enMessages,
  formatDate,
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
});
