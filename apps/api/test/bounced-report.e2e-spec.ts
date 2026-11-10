/**
 * The bounced cheques still to be recovered, and the full printed statement.
 *
 * The report is money owed to the business, so what it counts as "covered"
 * is the thing to pin: a replacement covers only once it is received and
 * alive, only in its own currency, and a replacement that bounced in turn
 * covers nothing.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('bounced report and full statement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let other: Fixtures;
  let token: string;
  let otherToken: string;

  const login = async (email: string, password: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);
    other = await seedFixtures(prisma);
    token = await login(fixtures.ownerEmail, fixtures.password);
    otherToken = await login(other.ownerEmail, other.password);
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (other) await cleanupFixtures(prisma, other.organizationId);
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const create = async (body: Record<string, unknown>) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          currency: 'USD',
          dueDate: '2026-09-30',
          bankId: fixtures.bankId,
          originalSourceId: fixtures.customerId,
          ...body,
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };

  async function receive(id: string, version: number): Promise<number> {
    const received = await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/receive`)
      .set(auth())
      .send({ fromContactId: fixtures.customerId, toLocationId: fixtures.safeLocationId, version })
      .expect(200);
    return (received.body as { version: number }).version;
  }

  async function bounce(id: string, version: number): Promise<void> {
    const inHand = await receive(id, version);
    const deposited = await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/deposit`)
      .set(auth())
      .send({ toLocationId: fixtures.bankLocationId, version: inHand })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/bounce`)
      .set(auth())
      .send({ reason: 'رصيد غير كافٍ', version: deposited.body.version })
      .expect(200);
  }

  const report = async () =>
    (await request(app.getHttpServer()).get(`${API}/reports/bounced`).set(auth()).expect(200))
      .body as {
      count: number;
      byCurrency: Array<{ currency: string; count: number; remaining: string }>;
      cheques: Array<{
        chequeNumber: string;
        remaining: string;
        covered: string;
        daysSince: number;
        contactName: string | null;
      }>;
    };
  const row = async (number: string) =>
    (await report()).cheques.find((entry) => entry.chequeNumber === number);

  it('lists a bounced cheque with nothing to cover it, in full', async () => {
    const cheque = await create({ chequeNumber: 'BR-1', amount: '1000.00' });
    await bounce(cheque.id, cheque.version);

    const entry = await row('BR-1');
    expect(entry).toMatchObject({ remaining: '1000.00', covered: '0.00', daysSince: 0 });
    expect(entry?.contactName).not.toBeNull();
  });

  it('does not count a replacement until it is received', async () => {
    const original = await prisma.db.cheque.findFirstOrThrow({
      where: { organizationId: fixtures.organizationId, chequeNumber: 'BR-1' },
    });
    const replacement = await create({
      chequeNumber: 'BR-1-R',
      amount: '400.00',
      replacesChequeId: original.id,
    });
    // Still a draft: typed in, not in hand.
    expect((await row('BR-1'))?.remaining).toBe('1000.00');

    await receive(replacement.id, replacement.version);
    expect(await row('BR-1')).toMatchObject({ covered: '400.00', remaining: '600.00' });
  });

  it('ignores a replacement in another currency, and drops a cheque replaced in full', async () => {
    const bouncedTwice = await create({ chequeNumber: 'BR-2', amount: '500.00' });
    await bounce(bouncedTwice.id, bouncedTwice.version);

    const shekels = await create({
      chequeNumber: 'BR-2-ILS',
      amount: '5000.00',
      currency: 'ILS',
      replacesChequeId: bouncedTwice.id,
    });
    await receive(shekels.id, shekels.version);
    expect((await row('BR-2'))?.remaining).toBe('500.00');

    const dollars = await create({
      chequeNumber: 'BR-2-USD',
      amount: '500.00',
      replacesChequeId: bouncedTwice.id,
    });
    await receive(dollars.id, dollars.version);
    expect(await row('BR-2')).toBeUndefined();
  });

  it('stops counting a replacement that bounced in turn', async () => {
    const original = await create({ chequeNumber: 'BR-3', amount: '300.00' });
    await bounce(original.id, original.version);
    const replacement = await create({
      chequeNumber: 'BR-3-R',
      amount: '300.00',
      replacesChequeId: original.id,
    });
    await receive(replacement.id, replacement.version);
    expect(await row('BR-3')).toBeUndefined();

    const fresh = await prisma.db.cheque.findUniqueOrThrow({ where: { id: replacement.id } });
    const deposited = await request(app.getHttpServer())
      .post(`${API}/cheques/${replacement.id}/deposit`)
      .set(auth())
      .send({ toLocationId: fixtures.bankLocationId, version: fresh.version })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${API}/cheques/${replacement.id}/bounce`)
      .set(auth())
      .send({ reason: 'موقوف', version: deposited.body.version })
      .expect(200);

    // Both are owed now: the original, uncovered again, and the replacement.
    expect((await row('BR-3'))?.remaining).toBe('300.00');
    expect((await row('BR-3-R'))?.remaining).toBe('300.00');
  });

  it('totals what is left per currency, and keeps organizations apart', async () => {
    const { byCurrency, count } = await report();
    // BR-1 600 + BR-3 300 + BR-3-R 300.
    expect(byCurrency).toEqual([{ currency: 'USD', count: 3, remaining: '1200.00' }]);
    expect(count).toBe(3);

    const theirs = await request(app.getHttpServer())
      .get(`${API}/reports/bounced`)
      .set({ Authorization: `Bearer ${otherToken}` })
      .expect(200);
    expect(theirs.body.count).toBe(0);
  });

  it('lists every cheque on a full statement, and the latest fifty otherwise', async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        currency: 'USD',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
        cheques: Array.from({ length: 50 }, (_, index) => ({
          chequeNumber: `ST-${index + 1}`,
          amount: '10.00',
          dueDate: '2026-12-31',
        })),
      })
      .expect(201);

    const screen = await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/statement`)
      .set(auth())
      .expect(200);
    expect(screen.body.cheques).toHaveLength(50);
    expect(screen.body.totalCheques).toBeGreaterThan(50);

    const full = await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/statement?full=true`)
      .set(auth())
      .expect(200);
    expect(full.body.cheques).toHaveLength(full.body.totalCheques);
  });
});
