import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { ReminderType } from '@cheque-flow/shared-types';
import { moneyToString } from '@cheque-flow/database';
import { DEFAULT_LOCALE, formatMoney, translate } from '@cheque-flow/localization';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { ExpoPushService, type PushMessage } from './expo-push.service';

/** How many reminders one sweep will take, so a backlog cannot stall a tick. */
const BATCH = 200;

/**
 * Telling a phone that a cheque has come due.
 *
 * The reminder rows have existed since the beginning and nothing ever sent
 * them: a reminder was a line in a feed that had to be opened to be seen,
 * which is the opposite of what a reminder is for. This is the half that was
 * missing.
 *
 * It runs in the API process on a timer rather than on a queue. The work is one
 * indexed query and one HTTP call a minute, and a queue would mean Redis, a
 * worker and a second thing to deploy for that. What a queue would have given
 * for free — never sending the same reminder twice — is bought here instead by
 * claiming rows before sending: the sweep flips SCHEDULED to SENT in a single
 * conditional update and delivers only what that update actually claimed, so a
 * second instance sweeping the same second claims nothing and sends nothing.
 *
 * A claimed reminder that then fails to deliver is not put back. The row stays
 * in the in-app feed either way — it is the same row the notification screen
 * reads — so the reminder is never lost, only its buzz is, and a reminder that
 * retries for an hour against a phone that is off is worse than one that does
 * not.
 */
@Injectable()
export class ReminderDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderDispatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly devices: DevicesService,
    private readonly push: ExpoPushService,
  ) {}

  onModuleInit(): void {
    if (!this.config.push.enabled) {
      this.logger.log('Push delivery is off; reminders stay in the in-app feed only');
      return;
    }

    const every = this.config.push.sweepSeconds * 1000;
    this.timer = setInterval(() => void this.sweep(), every);
    // Never hold the process open for a timer: this must not keep a shutting
    // down API alive.
    this.timer.unref?.();
    this.logger.log(`Delivering due reminders every ${this.config.push.sweepSeconds}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One pass: claim what is due, then deliver it.
   *
   * Guarded against overlapping itself. A sweep that runs long — a slow push
   * service, a big backlog — must not have the next tick start beside it.
   */
  async sweep(now = new Date()): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const due = await this.findDue(now);
      if (due.length === 0) return 0;

      // Who could actually be reached, before anything is written. A reminder
      // marked SENT with no phone to send it to is a lie in the record and a
      // notification nobody will ever get: turning push on later would find
      // the row already spent.
      const tokensByUser = await this.devices.tokensFor([
        ...new Set(due.map((row) => row.recipientUserId as string)),
      ]);
      const deliverable = due.filter((row) => tokensByUser.has(row.recipientUserId as string));
      if (deliverable.length === 0) return 0;

      // A backlog holds several alerts per cheque — three days before, the day
      // before, the day itself, overdue — and a phone registering for the
      // first time received them all in one burst. Send the latest; the older
      // ones are retired unsent, as the feed already folds them.
      const { send, superseded } = ReminderDispatchService.latestPerCheque(deliverable);
      await this.retire(superseded);

      const claimed = await this.claim(send, now);
      return await this.deliver(claimed, tokensByUser);
    } catch (caught) {
      this.logger.error(`Reminder sweep failed: ${String(caught)}`);
      return 0;
    } finally {
      this.sweeping = false;
    }
  }

  /** Reminders whose moment has come, for a recipient who still exists. */
  private async findDue(now: Date) {
    return this.prisma.db.reminder.findMany({
      where: {
        status: 'SCHEDULED',
        remindAt: { lte: now },
        acknowledgedAt: null,
        recipientUserId: { not: null },
        cheque: { deletedAt: null },
      },
      orderBy: { remindAt: 'asc' },
      take: BATCH,
      select: {
        id: true,
        type: true,
        remindAt: true,
        recipientUserId: true,
        custom: true,
        cheque: {
          select: { id: true, chequeNumber: true, amount: true, currency: true, dueDate: true },
        },
      },
    });
  }

  /**
   * One alert per cheque and recipient: the latest of its automatic ones.
   *
   * The same rule the in-app feed folds by. A reminder someone set by hand
   * carries their own note and is always sent. Pure, so it is unit tested
   * without a database.
   */
  static latestPerCheque<
    T extends {
      remindAt: Date;
      recipientUserId: string | null;
      custom: boolean;
      cheque: { id: string };
    },
  >(rows: readonly T[]): { send: T[]; superseded: T[] } {
    const latest = new Map<string, T>();
    const send: T[] = [];
    const superseded: T[] = [];
    for (const row of rows) {
      if (row.custom) {
        send.push(row);
        continue;
      }
      const key = `${row.recipientUserId ?? ''}:${row.cheque.id}`;
      const current = latest.get(key);
      if (!current) {
        latest.set(key, row);
      } else if (row.remindAt >= current.remindAt) {
        superseded.push(current);
        latest.set(key, row);
      } else {
        superseded.push(row);
      }
    }
    return { send: [...send, ...latest.values()], superseded };
  }

  /**
   * Retires alerts a later one on the same cheque has overtaken.
   *
   * CANCELLED, not SENT: nothing was delivered, and the record should say so.
   * Only rows still SCHEDULED are touched, so a row another sweep has already
   * claimed keeps its status.
   */
  private async retire(rows: ReadonlyArray<{ id: string }>): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.db.reminder.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Takes ownership of what is about to be sent.
   *
   * The update is the claim, and it happens before the push service is called.
   * Sending first and marking after is the same bug with a smaller window: a
   * crash in between buzzes the phone again on the next tick.
   */
  private async claim(
    rows: Awaited<ReturnType<typeof this.findDue>>,
    now: Date,
  ): Promise<Awaited<ReturnType<typeof this.findDue>>> {
    const claimed = await this.prisma.db.reminder.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: 'SCHEDULED' },
      data: { status: 'SENT', sentAt: now },
    });

    // Another instance got there first for some or all of them. Only a full
    // claim is safe to deliver, because `updateMany` reports how many rows it
    // touched but not which — and buzzing a phone twice is worse than waiting
    // a minute.
    return claimed.count === rows.length ? rows : [];
  }

  private async deliver(
    claimed: Awaited<ReturnType<typeof this.claim>>,
    tokensByUser: Map<string, string[]>,
  ): Promise<number> {
    if (claimed.length === 0) return 0;

    const messages: PushMessage[] = [];
    for (const row of claimed) {
      const tokens = tokensByUser.get(row.recipientUserId as string);
      if (!tokens) continue;

      for (const token of tokens) {
        messages.push({
          to: token,
          title: titleFor(row.type, row.cheque.dueDate),
          body: translate(DEFAULT_LOCALE, 'reminders.pushBody', {
            number: row.cheque.chequeNumber,
            amount: formatMoney(
              DEFAULT_LOCALE,
              moneyToString(row.cheque.amount),
              row.cheque.currency,
            ),
          }),
          // The tap has to land on the cheque, not on the home screen: a
          // notification that only opens the app has made the person do the
          // finding themselves.
          data: { chequeId: row.cheque.id, reminderId: row.id },
        });
      }
    }

    const outcomes = await this.push.send(messages);
    await this.devices.dropDead(
      outcomes.filter((outcome) => outcome.gone).map((outcome) => outcome.token),
    );

    const delivered = outcomes.filter((outcome) => outcome.delivered).length;
    if (delivered > 0) this.logger.log(`Delivered ${delivered} reminder notification(s)`);
    return delivered;
  }
}

/** The one line a phone shows on its lock screen, from the reminder's kind. */
function titleFor(type: string, dueDate: Date): string {
  const days = Math.round((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (type === ReminderType.OVERDUE) {
    return translate(DEFAULT_LOCALE, 'reminders.overdue', { days: String(Math.max(-days, 1)) });
  }
  if (type === ReminderType.BEFORE_DUE) {
    return translate(DEFAULT_LOCALE, 'reminders.beforeDue', { days: String(Math.max(days, 1)) });
  }
  return translate(DEFAULT_LOCALE, 'reminders.onDue');
}
