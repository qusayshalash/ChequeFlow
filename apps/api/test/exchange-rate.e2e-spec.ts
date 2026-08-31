/**
 * Converting foreign-currency cheques into the books' currency.
 *
 * The dashboard still refuses to add shekels to dollars. What this adds is a
 * second, separate figure — everything outstanding expressed in one currency —
 * built only from rates that were actually recorded, with an honest count of
 * the cheques it could not include.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('exchange rate and base currency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;
  /** Set by the tests below, then put into an outstanding state for the dashboard. */
  let convertedId = '';
  let unconvertedId = '';

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

  /** The fixture organization keeps its books in USD. */
  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        dueDate: '2026-10-31',
        bankId: fixtures.bankId,
        ...body,
      });

  it('converts a cheque already in the base currency at 1, unasked', async () => {
    const response = await create({
      chequeNumber: 'FX-1',
      amount: '1000.00',
      currency: 'USD',
    }).expect(201);

    // Nobody should have to type "1" for every domestic cheque.
    expect(response.body.cheque.exchangeRate).toBe('1');
    expect(response.body.cheque.amountBase).toBe('1000.00');
  });

  it('converts a foreign cheque at the rate given', async () => {
    const response = await create({
      chequeNumber: 'FX-2',
      amount: '1000.00',
      currency: 'ILS',
      exchangeRate: '0.27',
    }).expect(201);

    expect(response.body.cheque.exchangeRate).toBe('0.27');
    expect(response.body.cheque.amountBase).toBe('270.00');
    convertedId = response.body.cheque.id;
  });

  it('leaves a foreign cheque unconverted rather than inventing a rate', async () => {
    const response = await create({
      chequeNumber: 'FX-3',
      amount: '5000.00',
      currency: 'ILS',
    }).expect(201);

    // Applying today's rate to a cheque taken in last year is a number no
    // document supports; the columns stay empty instead.
    expect(response.body.cheque.exchangeRate).toBeNull();
    expect(response.body.cheque.amountBase).toBeNull();
    unconvertedId = response.body.cheque.id;
  });

  it('keeps six decimals of a rate and rounds the money once', async () => {
    const response = await create({
      chequeNumber: 'FX-4',
      amount: '333.33',
      currency: 'ILS',
      exchangeRate: '0.271834',
    }).expect(201);

    expect(response.body.cheque.exchangeRate).toBe('0.271834');
    // 333.33 × 0.271834 = 90.61042722, rounded once at the end → 90.61
    expect(response.body.cheque.amountBase).toBe('90.61');
  });

  it('refuses a rate that is not positive', async () => {
    await create({
      chequeNumber: 'FX-5',
      amount: '10.00',
      currency: 'ILS',
      exchangeRate: '0',
    }).expect(422);

    await create({
      chequeNumber: 'FX-6',
      amount: '10.00',
      currency: 'ILS',
      exchangeRate: '-1',
    }).expect(422);
  });

  it('applies one rate to a whole serial batch', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        currency: 'ILS',
        exchangeRate: '0.27',
        bankId: fixtures.bankId,
        cheques: [
          { chequeNumber: 'FXB-1', amount: '1000.00', dueDate: '2026-09-30' },
          { chequeNumber: 'FXB-2', amount: '2000.00', dueDate: '2026-10-31' },
        ],
      })
      .expect(201);

    expect(response.body.cheques.map((row: { amountBase: string }) => row.amountBase)).toEqual([
      '270.00',
      '540.00',
    ]);
  });

  it('recomputes the converted amount when the amount changes', async () => {
    const created = await create({
      chequeNumber: 'FX-7',
      amount: '100.00',
      currency: 'ILS',
      exchangeRate: '0.27',
    }).expect(201);

    const cheque = created.body.cheque;
    expect(cheque.amountBase).toBe('27.00');

    const updated = await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ amount: '200.00', version: cheque.version })
      .expect(200);

    // Leaving the old figure would put a number in the books that no longer
    // follows from the cheque it sits on.
    expect(updated.body.amountBase).toBe('54.00');
    expect(updated.body.exchangeRate).toBe('0.27');
  });

  it('clears the conversion when the rate is removed', async () => {
    const created = await create({
      chequeNumber: 'FX-8',
      amount: '100.00',
      currency: 'ILS',
      exchangeRate: '0.27',
    }).expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`${API}/cheques/${created.body.cheque.id}`)
      .set(auth())
      .send({ exchangeRate: null, version: created.body.cheque.version })
      .expect(200);

    expect(updated.body.exchangeRate).toBeNull();
    expect(updated.body.amountBase).toBeNull();
  });

  it('reports a base total beside the per-currency blocks, and what it omits', async () => {
    // The dashboard reports outstanding money, so the two cheques have to be
    // received before they count — a draft is not yet money anyone is owed.
    for (const id of [convertedId, unconvertedId]) {
      await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({ fromContactId: fixtures.customerId, toLocationId: fixtures.safeLocationId })
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .get(`${API}/dashboard`)
      .set(auth())
      .expect(200);

    expect(response.body.baseCurrency).toBe('USD');
    expect(response.body.baseTotal.currency).toBe('USD');

    // The per-currency blocks are still there and still separate: this figure
    // is an addition, not a replacement.
    expect(Array.isArray(response.body.currencies)).toBe(true);
    expect(response.body.currencies.length).toBeGreaterThan(1);

    // FX-3 has no rate and must be counted as missing rather than silently
    // dropped; FX-2 has one and must be in the figure.
    expect(response.body.baseTotal.unconvertedCount).toBe(1);
    expect(response.body.baseTotal.count).toBe(1);
    expect(response.body.baseTotal.total).toBe('270.00');
  });

  it('refuses a conversion the database would consider half-written', async () => {
    // The CHECK constraint is the last line of defence: a rate without an
    // amount, or the reverse, must never reach a row.
    await expect(
      prisma.db.$executeRawUnsafe(
        `UPDATE cheques SET exchange_rate = 2 WHERE organization_id = $1 AND cheque_number = 'FX-3'`,
        fixtures.organizationId,
      ),
    ).rejects.toThrow();
  });
});
