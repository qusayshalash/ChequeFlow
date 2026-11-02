import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { instantAt, isValidTimeZone, todayIn, utcToday } from './outstanding.js';

/**
 * Which day it is, for the business rather than for Greenwich.
 *
 * The organization record carried `Asia/Hebron` from the start and nothing
 * read it. Every "today" was the UTC day, so for two hours a night in winter
 * and three in summer the books thought it was still yesterday — a cheque due
 * today was not due, and "overdue" switched on late.
 */
describe('todayIn', () => {
  it('turns over at local midnight, not at UTC midnight', () => {
    // 00:30 in Hebron on 3 November is still 22:30 on the 2nd in UTC.
    const now = new Date('2026-11-02T22:30:00Z');
    expect(utcToday(now)).toBe('2026-11-02');
    expect(todayIn('Asia/Hebron', now)).toBe('2026-11-03');
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // UTC+3 in summer: 21:30 UTC is already 00:30 the next day.
    expect(todayIn('Asia/Hebron', new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02');
    expect(todayIn('Asia/Hebron', new Date('2026-07-01T20:30:00Z'))).toBe('2026-07-01');
  });

  it('falls back to UTC for a zone the runtime does not know', () => {
    // A misconfigured setting must not take the dashboard down.
    const now = new Date('2026-11-02T22:30:00Z');
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(todayIn('Mars/Olympus', now)).toBe('2026-11-02');
  });
});

describe('instantAt', () => {
  it('puts eight in the morning at eight in the morning, locally', () => {
    // Reminders were scheduled for 08:00 UTC: ten or eleven o'clock in Hebron.
    expect(instantAt('2026-11-02', 8, 'Asia/Hebron').toISOString()).toBe(
      '2026-11-02T06:00:00.000Z',
    );
    expect(instantAt('2026-07-01', 8, 'Asia/Hebron').toISOString()).toBe(
      '2026-07-01T05:00:00.000Z',
    );
  });

  it('lands on the right hour on the days the clocks move', () => {
    // New York, because its transition dates are fixed and well known.
    expect(instantAt('2026-03-08', 8, 'America/New_York').toISOString()).toBe(
      '2026-03-08T12:00:00.000Z',
    );
    expect(instantAt('2026-11-01', 8, 'America/New_York').toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    );
  });

  it('is UTC for a zone the runtime does not know', () => {
    expect(instantAt('2026-11-02', 8, 'Mars/Olympus').toISOString()).toBe(
      '2026-11-02T08:00:00.000Z',
    );
  });
});

/**
 * Nothing that means the business day may ask for the UTC day.
 *
 * The fault was not one call but the default: `utcToday()` was the only
 * "today" there was, so every screen and every report used it. Scanning for it
 * is what keeps the next screen from reaching for it again.
 */
describe('the business day is never the UTC day', () => {
  // `process.cwd()` is this package under vitest; the repo root is two up.
  const ROOT = join(process.cwd(), '..', '..');
  const SOURCES = [
    'apps/api/src',
    'apps/web/app',
    'apps/web/components',
    'apps/web/lib',
    'apps/mobile/app',
    'apps/mobile/src',
  ];

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) ? [full] : [];
    });

  it('has no caller of utcToday in the apps', () => {
    const callers = SOURCES.flatMap((dir) => walk(join(ROOT, dir))).filter((file) =>
      /\butcToday\(/.test(readFileSync(file, 'utf8')),
    );
    expect(callers.map((file) => file.replace(ROOT, ''))).toEqual([]);
  });
});
