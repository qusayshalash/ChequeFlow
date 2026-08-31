/**
 * The day's deposit run.
 *
 * The rules that matter are about what the slip must *not* leave out: a cheque
 * that fell due last week and is still in the safe belongs on today's run more
 * urgently than one due today, and a cheque with no bank on file still has to
 * be deposited somewhere.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('deposit slip (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);

    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: fixtures.password })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Creates a cheque and walks it to IN_HAND, which is the only depositable state. */
  async function inHand(body: Record<string, unknown>): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        currency: 'USD',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
        ...body,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${API}/cheques/${created.body.cheque.id}/receive`)
      .set(auth())
      .send({
        fromContactId: fixtures.customerId,
        toLocationId: fixtures.safeLocationId,
        version: created.body.cheque.version,
      })
      .expect(200);

    return String(created.body.cheque.id);
  }

  const slip = (on: string) =>
    request(app.getHttpServer())
      .get(`${API}/reports/deposit-slip`)
      .query({ on })
      .set(auth())
      .expect(200);

  it('lists what is in hand and due, grouped by bank', async () => {
    await inHand({ chequeNumber: 'DS-1', amount: '1000.00', dueDate: '2026-09-30' });
    await inHand({ chequeNumber: 'DS-2', amount: '500.00', dueDate: '2026-09-30' });

    const response = await slip('2026-09-30');

    expect(response.body.on).toBe('2026-09-30');
    expect(response.body.totalCount).toBe(2);
    expect(response.body.banks).toHaveLength(1);
    expect(response.body.banks[0].bankName).toBe('E2E Bank');
    expect(response.body.banks[0].cheques).toHaveLength(2);

    // Totals per currency, never one mixed figure: the bank takes one envelope
    // per currency too.
    expect(response.body.banks[0].currencies).toEqual([
      { currency: 'USD', count: 2, total: '1500.00' },
    ]);
  });

  it('carries forward a cheque that fell due earlier and was never deposited', async () => {
    const response = await slip('2026-10-31');

    // Both are still there a month later — a slip that showed only that day's
    // date is how a cheque quietly ages in a drawer.
    expect(response.body.totalCount).toBe(2);
    expect(response.body.overdueCount).toBe(2);
  });

  it('leaves out a cheque that is not yet due', async () => {
    await inHand({ chequeNumber: 'DS-3', amount: '900.00', dueDate: '2027-06-30' });

    const response = await slip('2026-09-30');
    expect(response.body.totalCount).toBe(2);
    expect(
      response.body.banks[0].cheques.some(
        (cheque: { chequeNumber: string }) => cheque.chequeNumber === 'DS-3',
      ),
    ).toBe(false);
  });

  it('leaves out a cheque that is already at the bank', async () => {
    const id = await inHand({ chequeNumber: 'DS-4', amount: '700.00', dueDate: '2026-09-30' });

    const before = await slip('2026-09-30');
    expect(before.body.totalCount).toBe(3);

    const current = await request(app.getHttpServer())
      .get(`${API}/cheques/${id}`)
      .set(auth())
      .expect(200);

    await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/deposit`)
      .set(auth())
      .send({ toLocationId: fixtures.bankLocationId, version: current.body.version })
      .expect(200);

    // A cheque already handed over cannot be deposited again today.
    const after = await slip('2026-09-30');
    expect(after.body.totalCount).toBe(2);
  });

  it('keeps a cheque with no bank on file, in its own group', async () => {
    await inHand({
      chequeNumber: 'DS-5',
      amount: '300.00',
      dueDate: '2026-09-30',
      bankId: null,
      bankNameRaw: null,
    });

    const response = await slip('2026-09-30');

    // It still has to be deposited somewhere; dropping it from the run would
    // lose it silently.
    const unnamed = response.body.banks.find((bank: { bankName: string }) => bank.bankName === '');
    expect(unnamed).toBeDefined();
    expect(unnamed.cheques).toHaveLength(1);
    expect(unnamed.cheques[0].chequeNumber).toBe('DS-5');
  });

  it('separates currencies inside one bank', async () => {
    await inHand({
      chequeNumber: 'DS-6',
      amount: '4000.00',
      currency: 'ILS',
      dueDate: '2026-09-30',
    });

    const response = await slip('2026-09-30');
    const bank = response.body.banks.find(
      (entry: { bankName: string }) => entry.bankName === 'E2E Bank',
    );

    expect(bank.currencies).toHaveLength(2);
    const ils = bank.currencies.find((entry: { currency: string }) => entry.currency === 'ILS');
    expect(ils.total).toBe('4000.00');
  });

  it('records a WhatsApp reminder as already sent, not scheduled', async () => {
    const id = await inHand({ chequeNumber: 'DS-7', amount: '120.00', dueDate: '2026-09-30' });

    const created = await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/whatsapp-reminder`)
      .set(auth())
      .send({ note: 'اتصلت به وأرسلت تذكيرًا' })
      .expect(201);

    const reminder = await prisma.db.reminder.findUniqueOrThrow({
      where: { id: String(created.body.id) },
      select: { channel: true, status: true, sentAt: true, custom: true, note: true },
    });

    // By the time this is called the message has been sent, so scheduling it
    // would put a reminder in the future for something in the past.
    expect(reminder.channel).toBe('WHATSAPP');
    expect(reminder.status).toBe('SENT');
    expect(reminder.sentAt).not.toBeNull();
    // Custom, so the automatic schedule never deletes this record of a fact.
    expect(reminder.custom).toBe(true);
    expect(reminder.note).toBe('اتصلت به وأرسلت تذكيرًا');
  });

  it('will not log a reminder against a cheque in another tenant', async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/00000000-0000-4000-8000-000000000000/whatsapp-reminder`)
      .set(auth())
      .send({})
      .expect(404);
  });

  it('can be narrowed to one bank, for a trip that only visits that branch', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/reports/deposit-slip`)
      .query({ on: '2026-09-30', bankId: fixtures.bankId })
      .set(auth())
      .expect(200);

    expect(response.body.banks).toHaveLength(1);
    expect(response.body.banks[0].bankName).toBe('E2E Bank');
  });
});
