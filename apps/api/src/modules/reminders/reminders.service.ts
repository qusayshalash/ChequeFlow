import { Injectable, Logger } from '@nestjs/common';

import {
  ChequeStatus,
  ReminderType,
  type MoneyString,
  type ReminderChannel,
  type ReminderStatus,
} from '@cheque-flow/shared-types';
import { moneyToString } from '@cheque-flow/database';

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
  cheque: {
    id: string;
    chequeNumber: string;
    amount: MoneyString;
    currency: string;
    dueDate: string;
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

    await this.prisma.db.reminder.deleteMany({
      where: { chequeId, status: 'SCHEDULED' },
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

  /** In-app notification feed for the current user. */
  async listForUser(userId: string, limit = 50): Promise<ReminderView[]> {
    const rows = await this.prisma.db.reminder.findMany({
      where: { recipientUserId: userId, status: { in: ['SCHEDULED', 'SENT'] } },
      include: {
        cheque: {
          select: { id: true, chequeNumber: true, amount: true, currency: true, dueDate: true },
        },
      },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      channel: row.channel,
      status: row.status,
      remindAt: row.remindAt.toISOString(),
      cheque: {
        id: row.cheque.id,
        chequeNumber: row.cheque.chequeNumber,
        amount: moneyToString(row.cheque.amount),
        currency: row.cheque.currency,
        dueDate: row.cheque.dueDate.toISOString().slice(0, 10),
      },
    }));
  }
}
