import { Injectable, Logger } from '@nestjs/common';

import {
  ChequeStatus,
  ReminderType,
  type ChequeDirection,
  type MoneyString,
  type ReminderChannel,
  type ReminderStatus,
} from '@cheque-flow/shared-types';
import { moneyToString, type Prisma } from '@cheque-flow/database';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Statuses that still need a due-date reminder. */
const ACTIVE_STATUSES: readonly ChequeStatus[] = [
  ChequeStatus.DRAFT,
  ChequeStatus.PENDING_REVIEW,
  ChequeStatus.IN_HAND,
  ChequeStatus.RESERVED,
  ChequeStatus.DEPOSITED,
  ChequeStatus.TRANSFERRED,
  ChequeStatus.POSTPONED,
  ChequeStatus.BOUNCED,
];

/** One row of the in-app notification feed. */
export interface ReminderView {
  id: string;
  type: ReminderType;
  channel: ReminderChannel;
  status: ReminderStatus;
  remindAt: string;
  /** Its moment has arrived — the row is actionable now, not upcoming. */
  isDue: boolean;
  custom: boolean;
  note: string | null;
  acknowledgedAt: string | null;
  cheque: {
    id: string;
    chequeNumber: string;
    amount: MoneyString;
    currency: string;
    dueDate: string;
    status: ChequeStatus;
    direction: ChequeDirection;
  };
}

/** Everything a reminder view needs from the cheque it belongs to. */
const reminderInclude = {
  cheque: {
    select: {
      id: true,
      chequeNumber: true,
      amount: true,
      currency: true,
      dueDate: true,
      status: true,
      direction: true,
    },
  },
} satisfies Prisma.ReminderInclude;

type ReminderRow = Prisma.ReminderGetPayload<{ include: typeof reminderInclude }>;

function toReminderView(row: ReminderRow, now: number): ReminderView {
  return {
    id: row.id,
    type: row.type,
    channel: row.channel,
    status: row.status,
    remindAt: row.remindAt.toISOString(),
    isDue: row.remindAt.getTime() <= now,
    custom: row.custom,
    note: row.note,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    cheque: {
      id: row.cheque.id,
      chequeNumber: row.cheque.chequeNumber,
      amount: moneyToString(row.cheque.amount),
      currency: row.cheque.currency,
      dueDate: row.cheque.dueDate.toISOString().slice(0, 10),
      status: row.cheque.status,
      direction: row.cheque.direction,
    },
  };
}

export interface PlannedReminder {
  type: ReminderType;
  remindAt: Date;
  offsetDays: number;
}

/**
 * Schedules in-app reminders around a cheque's due date.
 *
 * Offsets default to `REMINDER_OFFSET_DAYS` and can be overridden per
 * organization through `settings_json.reminderOffsetDays`.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Pure planning function — no I/O, so the schedule is easy to unit test.
   * Reminders fire at 08:00 UTC on the offset day.
   */
  static plan(
    dueDate: Date,
    offsetDays: readonly number[],
    overdueDays: number,
  ): PlannedReminder[] {
    const planned: PlannedReminder[] = [];
    const dueMidnight = Date.UTC(
      dueDate.getUTCFullYear(),
      dueDate.getUTCMonth(),
      dueDate.getUTCDate(),
      8,
    );

    for (const offset of [...new Set(offsetDays)].sort((a, b) => b - a)) {
      planned.push({
        type: offset === 0 ? ReminderType.ON_DUE : ReminderType.BEFORE_DUE,
        remindAt: new Date(dueMidnight - offset * 86_400_000),
        offsetDays: offset,
      });
    }

    if (overdueDays > 0) {
      planned.push({
        type: ReminderType.OVERDUE,
        remindAt: new Date(dueMidnight + overdueDays * 86_400_000),
        offsetDays: -overdueDays,
      });
    }

    return planned;
  }

  /**
   * Recomputes the scheduled reminders for a cheque.
   *
   * Only reminders that have not been sent yet are replaced, so history is
   * preserved when a due date moves.
   */
  async syncForCheque(chequeId: string): Promise<number> {
    const cheque = await this.prisma.db.cheque.findUnique({
      where: { id: chequeId },
      select: {
        id: true,
        dueDate: true,
        status: true,
        currentHolderId: true,
        createdBy: true,
        organization: { select: { settingsJson: true } },
      },
    });
    if (!cheque) return 0;

    // Only the automatic schedule is rebuilt. A reminder someone set by hand
    // is theirs to keep, and must not vanish because the cheque moved.
    await this.prisma.db.reminder.deleteMany({
      where: { chequeId, status: 'SCHEDULED', custom: false },
    });

    if (!ACTIVE_STATUSES.includes(cheque.status)) {
      return 0;
    }

    const settings = cheque.organization.settingsJson as { reminderOffsetDays?: unknown } | null;
    const configured = Array.isArray(settings?.reminderOffsetDays)
      ? settings.reminderOffsetDays.filter(
          (value): value is number => typeof value === 'number' && Number.isInteger(value),
        )
      : null;

    const planned = RemindersService.plan(
      cheque.dueDate,
      configured && configured.length > 0 ? configured : this.config.reminders.offsetDays,
      this.config.reminders.overdueDays,
    );

    const recipientUserId = cheque.currentHolderId ?? cheque.createdBy;
    const now = Date.now();

    const rows = planned
      // Skip reminders whose moment has already passed.
      .filter((reminder) => reminder.remindAt.getTime() > now)
      .map((reminder) => ({
        chequeId,
        type: reminder.type,
        remindAt: reminder.remindAt,
        channel: 'IN_APP' as const,
        recipientUserId,
      }));

    if (rows.length === 0) return 0;

    const created = await this.prisma.db.reminder.createMany({ data: rows });
    this.logger.debug(`Scheduled ${created.count} reminders for cheque ${chequeId}`);
    return created.count;
  }

  /**
   * In-app notification feed for the current user.
   *
   * Reminders whose moment has arrived come first — those are the ones that
   * need action today — followed by the upcoming ones in date order.
   * Acknowledged reminders drop out of the feed entirely.
   */
  async listForUser(userId: string, limit = 50): Promise<ReminderView[]> {
    const rows = await this.prisma.db.reminder.findMany({
      where: {
        recipientUserId: userId,
        status: { in: ['SCHEDULED', 'SENT'] },
        acknowledgedAt: null,
        cheque: { deletedAt: null },
      },
      include: reminderInclude,
      orderBy: { remindAt: 'asc' },
      take: limit,
    });

    const now = Date.now();
    const views = rows.map((row) => toReminderView(row, now));

    // Due first (most overdue at the top), then everything still upcoming.
    return views.sort((a, b) => {
      if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
      return a.remindAt.localeCompare(b.remindAt);
    });
  }

  /**
   * Pushes a reminder into the future.
   *
   * The row is reused rather than replaced so the reminder keeps its identity;
   * snoozing is a postponement, not a new alert.
   */
  async snooze(userId: string, reminderId: string, minutes: number): Promise<ReminderView | null> {
    const reminder = await this.prisma.db.reminder.findFirst({
      where: { id: reminderId, recipientUserId: userId },
    });
    if (!reminder) return null;

    // Snooze from now, not from the original time: snoozing an alert that is
    // already three days late by "one day" must not leave it still in the past.
    const base = Math.max(Date.now(), reminder.remindAt.getTime());
    await this.prisma.db.reminder.update({
      where: { id: reminderId },
      data: { remindAt: new Date(base + minutes * 60_000), status: 'SCHEDULED' },
    });

    // Read the one row back directly. Going through `listForUser` meant a
    // successful snooze reported 404 whenever the reminder fell outside that
    // feed — an acknowledged one, or one whose cheque was soft-deleted.
    return this.viewById(reminderId);
  }

  /** One reminder, mapped exactly as the feed maps it. */
  private async viewById(reminderId: string): Promise<ReminderView | null> {
    const row = await this.prisma.db.reminder.findUnique({
      where: { id: reminderId },
      include: reminderInclude,
    });
    return row ? toReminderView(row, Date.now()) : null;
  }

  /** Marks a reminder as dealt with, removing it from the feed. */
  async acknowledge(userId: string, reminderId: string): Promise<boolean> {
    const result = await this.prisma.db.reminder.updateMany({
      where: { id: reminderId, recipientUserId: userId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), status: 'READ' },
    });
    return result.count > 0;
  }

  /** A reminder a person set by hand on a specific cheque. */
  async createCustom(
    organizationId: string,
    userId: string,
    chequeId: string,
    remindAt: Date,
    note: string | null,
  ): Promise<{ id: string } | null> {
    const cheque = await this.prisma.db.cheque.findFirst({
      where: { id: chequeId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!cheque) return null;

    const created = await this.prisma.db.reminder.create({
      data: {
        chequeId,
        type: ReminderType.BEFORE_DUE,
        remindAt,
        channel: 'IN_APP',
        recipientUserId: userId,
        custom: true,
        note,
      },
      select: { id: true },
    });
    return created;
  }
}
