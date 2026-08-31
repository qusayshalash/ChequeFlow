/**
 * What happens after a cheque bounces, and how much one customer may owe.
 *
 * Both features exist to stop a customer's history reading cleaner than it
 * was: three replacements for one debt should not look like three unrelated
 * cheques, and a customer sitting on more uncollected cheques than the
 * business agreed to hold should be visible before the next one is taken.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('replacement chain and credit limit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;

  let bouncedId = '';
  let bouncedVersion = 0;
  let replacementId = '';

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

  const create = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        currency: 'USD',
        dueDate: '2026-09-30',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
        ...body,
      });

  /** Walks a cheque from DRAFT to BOUNCED, the way the state machine requires. */
  async function bounce(id: string, version: number): Promise<void> {
    const received = await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/receive`)
      .set(auth())
      .send({ fromContactId: fixtures.customerId, toLocationId: fixtures.safeLocationId, version })
      .expect(200);

    const deposited = await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/deposit`)
      .set(auth())
      .send({ toLocationId: fixtures.bankLocationId, version: received.body.version })
      .expect(200);

    await request(app.getHttpServer())
      .post(`${API}/cheques/${id}/bounce`)
      .set(auth())
      .send({ reason: 'رصيد غير كافٍ', fee: '25.00', version: deposited.body.version })
      .expect(200);
  }

  describe('replacement chain', () => {
    it('refuses to replace a cheque that has not come back', async () => {
      const created = await create({ chequeNumber: 'RC-1', amount: '1000.00' }).expect(201);
      bouncedId = created.body.cheque.id;
      bouncedVersion = created.body.cheque.version;

      // A cheque that cleared was not replaced — it was paid.
      const response = await create({
        chequeNumber: 'RC-BAD',
        amount: '500.00',
        replacesChequeId: bouncedId,
      }).expect(422);

      expect(response.body.error.fieldErrors[0].message).toBe(
        'validation.cheque.replacesNotBounced',
      );
    });

    it('links a replacement to the cheque it replaces', async () => {
      await bounce(bouncedId, bouncedVersion);

      const created = await create({
        chequeNumber: 'RC-2',
        amount: '1000.00',
        dueDate: '2026-11-30',
        replacesChequeId: bouncedId,
      }).expect(201);

      replacementId = created.body.cheque.id;
      expect(created.body.cheque.replaces.id).toBe(bouncedId);
      expect(created.body.cheque.replaces.chequeNumber).toBe('RC-1');
      expect(created.body.cheque.replaces.status).toBe(ChequeStatus.BOUNCED);
    });

    it('shows the chain from the bounced cheque too', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API}/cheques/${bouncedId}`)
        .set(auth())
        .expect(200);

      // Reading forwards is the direction someone chasing the debt needs.
      expect(response.body.replacedBy).toHaveLength(1);
      expect(response.body.replacedBy[0].chequeNumber).toBe('RC-2');
      expect(response.body.replaces).toBeNull();

      // The bank's reason and charge survive the replacement.
      expect(response.body.bounceReason).toBe('رصيد غير كافٍ');
      expect(response.body.bounceFee).toBe('25.00');
    });

    it('refuses a link that would make the chain loop', async () => {
      // Bounce the replacement too, then try to point the original at it.
      const current = await request(app.getHttpServer())
        .get(`${API}/cheques/${replacementId}`)
        .set(auth())
        .expect(200);
      await bounce(replacementId, current.body.version);

      const original = await request(app.getHttpServer())
        .get(`${API}/cheques/${bouncedId}`)
        .set(auth())
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`${API}/cheques/${bouncedId}`)
        .set(auth())
        .send({ replacesChequeId: replacementId, version: original.body.version })
        .expect(422);

      // A cycle makes every screen that walks the chain hang.
      expect(response.body.error.fieldErrors[0].message).toBe('validation.cheque.replacesLoop');
    });

    it('refuses a cheque from another tenant', async () => {
      await create({
        chequeNumber: 'RC-9',
        amount: '10.00',
        replacesChequeId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
    });

    it('applies one link to a whole replacement batch', async () => {
      // A customer often replaces one bounced cheque with several smaller ones.
      const response = await request(app.getHttpServer())
        .post(`${API}/cheques/batch`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          currency: 'USD',
          bankId: fixtures.bankId,
          originalSourceId: fixtures.customerId,
          replacesChequeId: bouncedId,
          cheques: [
            { chequeNumber: 'RCB-1', amount: '500.00', dueDate: '2027-01-31' },
            { chequeNumber: 'RCB-2', amount: '500.00', dueDate: '2027-02-28' },
          ],
        })
        .expect(201);

      expect(response.body.cheques).toHaveLength(2);

      const original = await request(app.getHttpServer())
        .get(`${API}/cheques/${bouncedId}`)
        .set(auth())
        .expect(200);
      expect(original.body.replacedBy).toHaveLength(3);
    });
  });

  describe('credit limit', () => {
    let contactId = '';

    it('needs a currency to mean anything', async () => {
      await request(app.getHttpServer())
        .post(`${API}/contacts`)
        .set(auth())
        .send({ type: 'CUSTOMER', name: 'بلا عملة', creditLimit: '5000.00' })
        .expect(422);
    });

    it('reports nothing at all when no limit is set', async () => {
      const created = await request(app.getHttpServer())
        .post(`${API}/contacts`)
        .set(auth())
        .send({ type: 'CUSTOMER', name: 'بلا سقف' })
        .expect(201);

      const statement = await request(app.getHttpServer())
        .get(`${API}/contacts/${created.body.id}/statement`)
        .set(auth())
        .expect(200);

      // Not "unlimited": nobody has decided, and the screen says so.
      expect(statement.body.creditLimit).toBeNull();
    });

    it('measures the limit against uncollected cheques only', async () => {
      const created = await request(app.getHttpServer())
        .post(`${API}/contacts`)
        .set(auth())
        .send({
          type: 'CUSTOMER',
          name: 'عميل بسقف',
          creditLimit: '5000.00',
          creditLimitCurrency: 'USD',
        })
        .expect(201);
      contactId = created.body.id;

      const cheque = await create({
        chequeNumber: 'CL-1',
        amount: '2000.00',
        originalSourceId: contactId,
      }).expect(201);

      await request(app.getHttpServer())
        .post(`${API}/cheques/${cheque.body.cheque.id}/receive`)
        .set(auth())
        .send({
          fromContactId: contactId,
          toLocationId: fixtures.safeLocationId,
          version: cheque.body.cheque.version,
        })
        .expect(200);

      const statement = await request(app.getHttpServer())
        .get(`${API}/contacts/${contactId}/statement`)
        .set(auth())
        .expect(200);

      expect(statement.body.creditLimit.limit).toBe('5000.00');
      expect(statement.body.creditLimit.used).toBe('2000.00');
      expect(statement.body.creditLimit.headroom).toBe('3000.00');
      expect(statement.body.creditLimit.exceeded).toBe(false);
    });

    it('reports how far over the limit is, rather than clamping at zero', async () => {
      const cheque = await create({
        chequeNumber: 'CL-2',
        amount: '3900.00',
        originalSourceId: contactId,
      }).expect(201);

      await request(app.getHttpServer())
        .post(`${API}/cheques/${cheque.body.cheque.id}/receive`)
        .set(auth())
        .send({
          fromContactId: contactId,
          toLocationId: fixtures.safeLocationId,
          version: cheque.body.cheque.version,
        })
        .expect(200);

      const statement = await request(app.getHttpServer())
        .get(`${API}/contacts/${contactId}/statement`)
        .set(auth())
        .expect(200);

      expect(statement.body.creditLimit.exceeded).toBe(true);
      // "Over by 900" is the number the person chasing the debt needs.
      expect(statement.body.creditLimit.headroom).toBe('-900.00');
    });

    it('leaves other currencies out of the arithmetic and lists them instead', async () => {
      const cheque = await create({
        chequeNumber: 'CL-3',
        amount: '7000.00',
        currency: 'ILS',
        originalSourceId: contactId,
      }).expect(201);

      await request(app.getHttpServer())
        .post(`${API}/cheques/${cheque.body.cheque.id}/receive`)
        .set(auth())
        .send({
          fromContactId: contactId,
          toLocationId: fixtures.safeLocationId,
          version: cheque.body.cheque.version,
        })
        .expect(200);

      const statement = await request(app.getHttpServer())
        .get(`${API}/contacts/${contactId}/statement`)
        .set(auth())
        .expect(200);

      // Converting at today's rate would make the headroom move on days when
      // nothing happened.
      expect(statement.body.creditLimit.used).toBe('5900.00');
      expect(statement.body.creditLimit.otherCurrencies).toHaveLength(1);
      expect(statement.body.creditLimit.otherCurrencies[0].currency).toBe('ILS');
      expect(statement.body.creditLimit.otherCurrencies[0].total).toBe('7000.00');
    });
  });
});
