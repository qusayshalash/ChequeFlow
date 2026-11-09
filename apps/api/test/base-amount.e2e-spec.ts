/**
 * The converted amount follows the cheque.
 *
 * Two writes left it behind: confirming a photographed cheque's real amount
 * kept the 1.00 placeholder's conversion, and changing a cheque's currency
 * kept the old currency's rate. One organization's dashboard read 64,005
 * under "all" and 73,002 under "USD" for the same dollar cheques.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('converted amounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const unique = Date.now().toString().slice(-6);

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

  const create = async (chequeNumber: string, amount: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          chequeNumber,
          amount,
          currency: 'USD',
          dueDate: '2027-03-01',
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };

  const stored = (id: string) =>
    prisma.db.cheque.findUniqueOrThrow({
      where: { id },
      select: { amount: true, amountBase: true, exchangeRate: true },
    });

  it('follows the amount a review confirms', async () => {
    // A photographed cheque starts at a placeholder amount.
    const cheque = await create(`TMP-${unique}`, '1.00');
    await prisma.db.cheque.update({
      where: { id: cheque.id },
      data: { status: ChequeStatus.PENDING_REVIEW },
    });

    await request(app.getHttpServer())
      .post(`${API}/cheques/${cheque.id}/review`)
      .set(auth())
      .send({
        confirmed: { chequeNumber: `RV-${unique}`, amount: '2500.00' },
        rejectedFields: [],
        version: cheque.version,
      })
      .expect(200);

    const row = await stored(cheque.id);
    expect(row.amountBase?.toFixed(2)).toBe('2500.00');
  });

  it('does not carry a rate over to a new currency', async () => {
    const cheque = await create(`CUR-${unique}`, '10000.00');

    await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ currency: 'ILS', version: cheque.version })
      .expect(200);

    // Shekels in a dollar book, with no rate given: unconverted, not 10,000 dollars.
    const row = await stored(cheque.id);
    expect(row.exchangeRate).toBeNull();
    expect(row.amountBase).toBeNull();
  });
});
