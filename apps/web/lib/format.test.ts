import { describe, expect, it } from 'vitest';

import { daysUntil } from './format';

const today = new Date('2026-09-30T12:00:00.000Z');

describe('due date helpers', () => {
  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil('2026-09-30', today)).toBe(0);
    expect(daysUntil('2026-10-07', today)).toBe(7);
    expect(daysUntil('2026-09-29', today)).toBe(-1);
  });
});
