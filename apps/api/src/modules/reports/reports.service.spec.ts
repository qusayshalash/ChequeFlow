import { ReportsService } from './reports.service';

describe('ReportsService.bucketKey', () => {
  it('buckets by calendar day', () => {
    expect(ReportsService.bucketKey(new Date('2026-09-30T00:00:00Z'), 'day')).toBe('2026-09-30');
  });

  it('buckets by month', () => {
    expect(ReportsService.bucketKey(new Date('2026-09-30T00:00:00Z'), 'month')).toBe('2026-09');
  });

  it('buckets weeks starting on Monday', () => {
    // 2026-09-30 is a Wednesday; its week starts on Monday 2026-09-28.
    expect(ReportsService.bucketKey(new Date('2026-09-30T00:00:00Z'), 'week')).toBe('2026-09-28');
    // A Monday maps to itself.
    expect(ReportsService.bucketKey(new Date('2026-09-28T00:00:00Z'), 'week')).toBe('2026-09-28');
    // A Sunday belongs to the week that started six days earlier.
    expect(ReportsService.bucketKey(new Date('2026-10-04T00:00:00Z'), 'week')).toBe('2026-09-28');
  });
});
