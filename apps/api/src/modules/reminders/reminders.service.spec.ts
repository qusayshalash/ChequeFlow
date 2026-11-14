import { ReminderType } from '@cheque-flow/shared-types';

import { RemindersService, type ReminderView } from './reminders.service';

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

  it('delivers at eight in the morning in the organization\u2019s zone, not in UTC', () => {
    // 08:00 UTC is ten o'clock in Hebron in winter. A reminder about a cheque
    // due today arrived halfway through the morning it was meant to start.
    const planned = RemindersService.plan(
      new Date('2026-12-15T00:00:00.000Z'),
      [0],
      0,
      'Asia/Hebron',
    );
    expect(planned[0]?.remindAt.toISOString()).toBe('2026-12-15T06:00:00.000Z');
  });

  it('follows the summer clock too', () => {
    const planned = RemindersService.plan(
      new Date('2026-07-10T00:00:00.000Z'),
      [0],
      0,
      'Asia/Hebron',
    );
    expect(planned[0]?.remindAt.toISOString()).toBe('2026-07-10T05:00:00.000Z');
  });

  it('stays at eight across a night the clocks move', () => {
    // Stepping back in fixed 24-hour blocks lands on seven or nine on the far
    // side of a transition. New York, for its fixed transition dates: the
    // clocks go forward on 8 March 2026.
    const planned = RemindersService.plan(
      new Date('2026-03-10T00:00:00.000Z'),
      [3],
      0,
      'America/New_York',
    );
    // 7 March is still standard time (UTC-5): eight is 13:00 UTC.
    expect(planned[0]?.remindAt.toISOString()).toBe('2026-03-07T13:00:00.000Z');
  });
});

describe('RemindersService.fold', () => {
  // A cheque due on the 15th, alerted three days before and the day before
  // (both arrived) and on the day (still to come): it showed as three cards.
  const view = (
    id: string,
    chequeId: string,
    remindAt: string,
    isDue: boolean,
    custom = false,
  ): ReminderView =>
    ({
      id,
      remindAt,
      isDue,
      custom,
      cheque: { id: chequeId },
    }) as unknown as ReminderView;

  it('shows a cheque once, by its latest alert that has arrived', () => {
    const folded = RemindersService.fold([
      view('d3', 'c1', '2026-11-12T06:00:00.000Z', true),
      view('d1', 'c1', '2026-11-14T06:00:00.000Z', true),
      view('d0', 'c1', '2026-11-15T06:00:00.000Z', false),
    ]);
    expect(folded.map((row) => row.id)).toEqual(['d1']);
  });

  it('shows the nearest upcoming alert when none has arrived', () => {
    const folded = RemindersService.fold([
      view('d0', 'c1', '2026-11-15T06:00:00.000Z', false),
      view('d1', 'c1', '2026-11-14T06:00:00.000Z', false),
    ]);
    expect(folded.map((row) => row.id)).toEqual(['d1']);
  });

  it('keeps cheques apart, and a hand-set reminder as its own entry', () => {
    const folded = RemindersService.fold([
      view('a', 'c1', '2026-11-14T06:00:00.000Z', true),
      view('b', 'c2', '2026-11-13T06:00:00.000Z', true),
      view('mine', 'c1', '2026-11-13T09:00:00.000Z', true, true),
      view('later', 'c3', '2026-11-20T06:00:00.000Z', false),
    ]);
    expect(folded.map((row) => row.id)).toEqual(['b', 'mine', 'a', 'later']);
  });
});
