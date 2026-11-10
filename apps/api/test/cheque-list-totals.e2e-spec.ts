/**
 * The totals under the cheque list: every matching cheque, not only the
 * page shown, per currency and per direction, never one across them.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('cheque list totals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);
    token = (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: fixtures.ownerEmail, password: fixtures.password })
        .expect(200)
    ).body.accessToken;

    const add = (direction: string, number: string, amount: string, currency: string) =>
      request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set({ Authorization: `Bearer ${token}` })
        .send({
          direction,
          chequeNumber: number,
          amount,
          currency,
          dueDate: '2026-12-31',
          bankId: fixtures.bankId,
          originalSourceId: fixtures.customerId,
        })
        .expect(201);
    await add('INCOMING', 'LT-1', '100.10', 'ILS');
    await add('INCOMING', 'LT-2', '200.20', 'ILS');
    await add('INCOMING', 'LT-3', '50.00', 'USD');
    await add('OUTGOING', 'LT-4', '30.00', 'ILS');
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  it('adds up the whole filtered list, split by direction and currency', async () => {
    // One cheque a page: the totals must still cover all four.
    const response = await request(app.getHttpServer())
      .get(`${API}/cheques?pageSize=1`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.total).toBe(4);
    expect(response.body.totals).toEqual([
      { direction: 'INCOMING', currency: 'ILS', count: 2, total: '300.30' },
      { direction: 'INCOMING', currency: 'USD', count: 1, total: '50.00' },
      { direction: 'OUTGOING', currency: 'ILS', count: 1, total: '30.00' },
    ]);
  });

  it('follows the filter', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/cheques?search=LT-3`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(response.body.totals).toEqual([
      { direction: 'INCOMING', currency: 'USD', count: 1, total: '50.00' },
    ]);
  });
});
