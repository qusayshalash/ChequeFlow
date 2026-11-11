/**
 * Correcting a cheque's currency.
 *
 * The currency is part of the value: 1,000 dinars changed to 1,000 shekels is
 * as much a change of what the cheque is worth as a new amount. So it is held
 * to the same rule once the cheque has been reviewed (a reason, recorded as a
 * correction), and a rate given for the old currency never carries over.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('currency correction (e2e)', () => {
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
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const create = async (number: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          chequeNumber: number,
          amount: '1000.00',
          currency: 'JOD',
          // The organization keeps its books in dollars.
          exchangeRate: '1.41',
          dueDate: '2026-12-31',
          bankId: fixtures.bankId,
          originalSourceId: fixtures.customerId,
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };

  it('corrects the currency of an unreviewed cheque, dropping the old rate', async () => {
    const cheque = await create('CUR-1');
    const updated = await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ currency: 'ILS', version: cheque.version })
      .expect(200);

    expect(updated.body.currency).toBe('ILS');
    // The dinar's rate is not a shekel's rate: the cheque starts unconverted.
    expect(updated.body.exchangeRate).toBeNull();
    expect(updated.body.amountBase).toBeNull();
  });

  it('asks for a reason once the cheque has been reviewed, as for the amount', async () => {
    const cheque = await create('CUR-2');
    await prisma.db.cheque.update({
      where: { id: cheque.id },
      data: { reviewedAt: new Date() },
    });

    const refused = await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ currency: 'ILS', version: cheque.version })
      .expect(422);
    expect(refused.body.error.fieldErrors[0].message).toBe('validation.reason.required');

    await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ currency: 'ILS', version: cheque.version, reason: 'أُدخلت بالدينار خطأً' })
      .expect(200);

    // Recorded as a correction of the value, with the reason, in the ledger
    // and the audit trail.
    const event = await prisma.db.chequeEvent.findFirstOrThrow({
      where: { chequeId: cheque.id, eventType: 'DATA_CORRECTED' },
    });
    expect(event.notes).toBe('أُدخلت بالدينار خطأً');
    expect(
      await prisma.db.auditLog.count({
        where: { entityId: cheque.id, action: 'cheque.amount_changed' },
      }),
    ).toBe(1);
  });

  it('leaves the rate alone when the currency is sent unchanged', async () => {
    const cheque = await create('CUR-3');
    const updated = await request(app.getHttpServer())
      .patch(`${API}/cheques/${cheque.id}`)
      .set(auth())
      .send({ currency: 'JOD', notes: 'ملاحظة', version: cheque.version })
      .expect(200);
    expect(updated.body.exchangeRate).toBe('1.41');
  });
});
