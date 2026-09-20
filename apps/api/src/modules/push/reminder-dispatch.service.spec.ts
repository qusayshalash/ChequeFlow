import { ReminderDispatchService } from './reminder-dispatch.service';
import type { DevicesService } from './devices.service';
import type { ExpoPushService, PushMessage, PushOutcome } from './expo-push.service';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Delivering a reminder exactly once.
 *
 * The reminder rows have always existed; nothing ever sent them. Now that
 * something does, the fault that matters is not a missed notification — the
 * row stays in the in-app feed either way — but a repeated one. A phone buzzed
 * twice about the same cheque is how somebody turns the feature off, and two
 * API instances sweeping the same second is the ordinary way that happens.
 *
 * So the sweep claims before it sends. These tests hold that claim.
 */

interface Row {
  id: string;
  status: 'SCHEDULED' | 'SENT';
}

/**
 * A Prisma stand-in holding reminder rows, with `updateMany` behaving as the
 * database does: it only touches rows that still match the `where`.
 */
function fakePrisma(rows: Row[], onUpdate?: () => void) {
  const due = rows.map((row) => ({
    id: row.id,
    type: 'ON_DUE',
    remindAt: new Date('2026-09-20T08:00:00.000Z'),
    recipientUserId: 'u1',
    cheque: {
      id: `c-${row.id}`,
      chequeNumber: '4410',
      amount: '1500.00',
      currency: 'ILS',
      dueDate: new Date('2026-09-20T00:00:00.000Z'),
    },
  }));

  const reminder = {
    findMany: async () =>
      due.filter((row) => rows.find((r) => r.id === row.id)?.status === 'SCHEDULED'),
    updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      onUpdate?.();
      let count = 0;
      for (const id of where.id.in) {
        const row = rows.find((r) => r.id === id);
        if (row && row.status === 'SCHEDULED') {
          row.status = 'SENT';
          count += 1;
        }
      }
      return { count };
    },
  };

  return { db: { reminder } } as unknown as PrismaService;
}

function fakeDevices(tokens: string[]) {
  const dropped: string[] = [];
  const service = {
    tokensFor: async () => new Map(tokens.length > 0 ? [['u1', tokens]] : []),
    dropDead: async (gone: readonly string[]) => {
      dropped.push(...gone);
    },
  } as unknown as DevicesService;
  return { service, dropped };
}

function fakePush(outcome: (message: PushMessage) => PushOutcome) {
  const sent: PushMessage[][] = [];
  const service = {
    enabled: true,
    send: async (messages: readonly PushMessage[]) => {
      sent.push([...messages]);
      return messages.map(outcome);
    },
  } as unknown as ExpoPushService;
  return { service, sent };
}

const config = {
  push: { enabled: true, endpoint: 'https://example.invalid', sweepSeconds: 60, tokenTtlDays: 90 },
} as unknown as AppConfigService;

const delivered = (message: PushMessage): PushOutcome => ({
  token: message.to,
  delivered: true,
  gone: false,
});

describe('ReminderDispatchService.sweep', () => {
  const now = new Date('2026-09-20T09:00:00.000Z');

  it('delivers a due reminder to the recipient’s phone', async () => {
    const rows: Row[] = [{ id: 'r1', status: 'SCHEDULED' }];
    const push = fakePush(delivered);
    const devices = fakeDevices(['ExponentPushToken[aaa]']);

    const service = new ReminderDispatchService(
      fakePrisma(rows),
      config,
      devices.service,
      push.service,
    );

    expect(await service.sweep(now)).toBe(1);
    expect(push.sent[0]?.[0]?.to).toBe('ExponentPushToken[aaa]');
    expect(rows[0]?.status).toBe('SENT');
  });

  it('never sends the same reminder twice', async () => {
    // The second sweep is the next tick, or another instance. Either way the
    // row is already SENT and there is nothing left to claim.
    const rows: Row[] = [{ id: 'r1', status: 'SCHEDULED' }];
    const push = fakePush(delivered);
    const service = new ReminderDispatchService(
      fakePrisma(rows),
      config,
      fakeDevices(['ExponentPushToken[aaa]']).service,
      push.service,
    );

    await service.sweep(now);
    expect(await service.sweep(now)).toBe(0);
    expect(push.sent).toHaveLength(1);
  });

  it('claims the row before handing it to the push service', async () => {
    // Sending first and marking after is the same bug with a smaller window:
    // a crash between the two buzzes the phone again on the next tick.
    const order: string[] = [];
    const rows: Row[] = [{ id: 'r1', status: 'SCHEDULED' }];
    const push = {
      enabled: true,
      send: async (messages: readonly PushMessage[]) => {
        order.push('send');
        return messages.map(delivered);
      },
    } as unknown as ExpoPushService;

    const service = new ReminderDispatchService(
      fakePrisma(rows, () => order.push('claim')),
      config,
      fakeDevices(['ExponentPushToken[aaa]']).service,
      push,
    );

    await service.sweep(now);
    expect(order).toEqual(['claim', 'send']);
  });

  it('carries the cheque, so the tap lands on the record', async () => {
    const push = fakePush(delivered);
    const service = new ReminderDispatchService(
      fakePrisma([{ id: 'r1', status: 'SCHEDULED' }]),
      config,
      fakeDevices(['ExponentPushToken[aaa]']).service,
      push.service,
    );

    await service.sweep(now);
    expect(push.sent[0]?.[0]?.data).toEqual({ chequeId: 'c-r1', reminderId: 'r1' });
    expect(push.sent[0]?.[0]?.body).toContain('4410');
  });

  it('forgets a token the push service says is gone', async () => {
    // A wiped phone keeps its row forever otherwise, and every sweep pays to
    // tell it nothing.
    const devices = fakeDevices(['ExponentPushToken[dead]']);
    const push = fakePush((message) => ({ token: message.to, delivered: false, gone: true }));
    const service = new ReminderDispatchService(
      fakePrisma([{ id: 'r1', status: 'SCHEDULED' }]),
      config,
      devices.service,
      push.service,
    );

    await service.sweep(now);
    expect(devices.dropped).toEqual(['ExponentPushToken[dead]']);
  });

  it('sends nothing, and spends nothing, when nobody has registered a phone', async () => {
    // Marking a reminder SENT with no phone to send it to is a lie in the
    // record and a notification nobody will ever get: switching push on later
    // would find the row already spent.
    const rows: Row[] = [{ id: 'r1', status: 'SCHEDULED' }];
    const push = fakePush(delivered);
    const service = new ReminderDispatchService(
      fakePrisma(rows),
      config,
      fakeDevices([]).service,
      push.service,
    );

    expect(await service.sweep(now)).toBe(0);
    expect(push.sent).toHaveLength(0);
    expect(rows[0]?.status).toBe('SCHEDULED');
  });

  it('sends nothing when another instance claimed part of the batch', async () => {
    // `updateMany` reports how many rows it touched but not which. A partial
    // claim means somebody else is already delivering some of these, and
    // guessing which would buzz a phone twice.
    const rows: Row[] = [
      { id: 'r1', status: 'SCHEDULED' },
      { id: 'r2', status: 'SENT' },
    ];
    const push = fakePush(delivered);
    const prisma = fakePrisma(rows);
    // Both rows look due to the read; only one is still claimable by the time
    // the update runs, which is exactly the race between two sweeps.
    (
      prisma as unknown as { db: { reminder: { findMany: () => Promise<unknown> } } }
    ).db.reminder.findMany = async () =>
      rows.map((row) => ({
        id: row.id,
        type: 'ON_DUE',
        remindAt: new Date('2026-09-20T08:00:00.000Z'),
        recipientUserId: 'u1',
        cheque: {
          id: `c-${row.id}`,
          chequeNumber: '4410',
          amount: '1500.00',
          currency: 'ILS',
          dueDate: new Date('2026-09-20T00:00:00.000Z'),
        },
      }));

    const service = new ReminderDispatchService(
      prisma,
      config,
      fakeDevices(['ExponentPushToken[aaa]']).service,
      push.service,
    );

    expect(await service.sweep(now)).toBe(0);
    expect(push.sent).toHaveLength(0);
  });

  it('survives a push service that throws', async () => {
    // A sweep that propagates is an unhandled rejection on a timer, which
    // takes the API down over a notification.
    const push = {
      enabled: true,
      send: async () => {
        throw new Error('push is down');
      },
    } as unknown as ExpoPushService;

    const service = new ReminderDispatchService(
      fakePrisma([{ id: 'r1', status: 'SCHEDULED' }]),
      config,
      fakeDevices(['ExponentPushToken[aaa]']).service,
      push,
    );

    await expect(service.sweep(now)).resolves.toBe(0);
  });
});
