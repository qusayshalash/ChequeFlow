import { ReminderType } from '@cheque-flow/shared-types';

import { RemindersService } from './reminders.service';

describe('RemindersService.plan', () => {
  const due = new Date('2026-09-30T00:00:00.000Z');

  it('creates one reminder per configured offset, plus the overdue one', () => {
    const planned = RemindersService.plan(due, [7, 3, 1, 0], 1);
    expect(planned).toHaveLength(5);
    expect(planned.map((p) => p.offsetDays)).toEqual([7, 3, 1, 0, -1]);
  });

  it('marks the due-day reminder as ON_DUE and the trailing one as OVERDUE', () => {
    const planned = RemindersService.plan(due, [7, 0], 2);
    expect(planned.find((p) => p.offsetDays === 0)?.type).toBe(ReminderType.ON_DUE);
    expect(planned.find((p) => p.offsetDays === -2)?.type).toBe(ReminderType.OVERDUE);
    expect(planned.find((p) => p.offsetDays === 7)?.type).toBe(ReminderType.BEFORE_DUE);
  });

  it('places each reminder the right number of days before the due date', () => {
    const planned = RemindersService.plan(due, [7], 0);
    expect(planned[0]?.remindAt.toISOString()).toBe('2026-09-23T08:00:00.000Z');
  });

  it('de-duplicates repeated offsets', () => {
    expect(RemindersService.plan(due, [3, 3, 3], 0)).toHaveLength(1);
  });

  it('omits the overdue reminder when it is disabled', () => {
    const planned = RemindersService.plan(due, [1], 0);
    expect(planned.every((p) => p.type !== ReminderType.OVERDUE)).toBe(true);
  });
});
