/**
 * A contact's balance depends on its part in each cheque.
 *
 * The net was signed by direction alone, for every contact on a cheque, so a
 * customer's cheque endorsed over to a supplier counted as money the supplier
 * owed us. The supplier was paid with it; until it clears it is a payment of
 * ours outstanding, the same as a cheque we wrote them.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('contact balances by role (e2e)', () => {
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
    token = (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: fixtures.ownerEmail, password: fixtures.password })
        .expect(200)
    ).body.accessToken;

    // From the customer, 1,000; endorsed over to the supplier.
    const endorsed = (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          chequeNumber: `EN-${unique}`,
          amount: '1000.00',
          currency: 'USD',
          dueDate: '2027-05-01',
          originalSourceId: fixtures.customerId,
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };
    const received = await request(app.getHttpServer())
      .post(`${API}/cheques/${endorsed.id}/receive`)
      .set(auth())
      .send({ toLocationId: fixtures.safeLocationId, version: endorsed.version })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${API}/cheques/${endorsed.id}/handover`)
      .set(auth())
      .send({ toContactId: fixtures.supplierId, version: received.body.version })
      .expect(200);

    // A cheque of our own to the same supplier, 300.
    const own = (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'OUTGOING',
          chequeNumber: `OW-${unique}`,
          amount: '300.00',
          currency: 'USD',
          dueDate: '2027-05-10',
          originalSourceId: fixtures.supplierId,
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };
    await request(app.getHttpServer())
      .post(`${API}/cheques/${own.id}/receive`)
      .set(auth())
      .send({ toLocationId: fixtures.safeLocationId, version: own.version })
      .expect(200);
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const net = async (contactId: string) => {
    const statement = await request(app.getHttpServer())
      .get(`${API}/contacts/${contactId}/statement`)
      .set(auth())
      .expect(200);
    return (statement.body.currencies as { currency: string; net: string }[]).find(
      (entry) => entry.currency === 'USD',
    )?.net;
  };

  const listed = async (contactId: string) => {
    const list = await request(app.getHttpServer())
      .get(`${API}/contacts`)
      .query({ pageSize: 100 })
      .set(auth())
      .expect(200);
    const row = (
      list.body.data as { id: string; balances: { currency: string; net: string }[] }[]
    ).find((entry) => entry.id === contactId);
    return row?.balances.find((entry) => entry.currency === 'USD')?.net;
  };

  it('keeps the customer owing us for the cheque until it clears', async () => {
    expect(await net(fixtures.customerId)).toBe('1000.00');
    expect(await listed(fixtures.customerId)).toBe('1000.00');
  });

  it('counts what we endorsed to the supplier as ours outstanding, like our own cheque', async () => {
    // -1,000 endorsed to them and -300 written to them.
    expect(await net(fixtures.supplierId)).toBe('-1300.00');
    expect(await listed(fixtures.supplierId)).toBe('-1300.00');
  });
});
