/**
 * Receiving a cheque keeps the source it was entered with.
 *
 * The form asked for the source again, and the server wrote
 * `fromContactId ?? null` into it: a bulk receive with no contact chosen
 * erased the source of every cheque it moved.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('receiving keeps the source (e2e)', () => {
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
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const create = async (chequeNumber: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(auth())
        .send({
          direction: 'INCOMING',
          chequeNumber,
          amount: '750.00',
          currency: 'USD',
          dueDate: '2027-04-01',
          originalSourceId: fixtures.customerId,
        })
        .expect(201)
    ).body.cheque as { id: string; version: number };

  const source = async (id: string) =>
    (
      await prisma.db.cheque.findUniqueOrThrow({
        where: { id },
        select: { originalSourceId: true, status: true },
      })
    ).originalSourceId;

  it('receives one cheque without asking for its source again', async () => {
    const cheque = await create(`RS-${unique}`);
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/${cheque.id}/receive`)
      .set(auth())
      .send({ toLocationId: fixtures.safeLocationId, version: cheque.version })
      .expect(200);

    expect(response.body.status).toBe(ChequeStatus.IN_HAND);
    expect(await source(cheque.id)).toBe(fixtures.customerId);
  });

  it('keeps every source through a bulk receive with no contact chosen', async () => {
    const a = await create(`RB-${unique}-1`);
    const b = await create(`RB-${unique}-2`);
    await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({ chequeIds: [a.id, b.id], action: 'RECEIVE', toLocationId: fixtures.safeLocationId })
      .expect(200);

    expect(await source(a.id)).toBe(fixtures.customerId);
    expect(await source(b.id)).toBe(fixtures.customerId);
  });

  it('still takes a different source when one is given', async () => {
    const cheque = await create(`RC-${unique}`);
    await request(app.getHttpServer())
      .post(`${API}/cheques/${cheque.id}/receive`)
      .set(auth())
      .send({
        fromContactId: fixtures.supplierId,
        toLocationId: fixtures.safeLocationId,
        version: cheque.version,
      })
      .expect(200);

    expect(await source(cheque.id)).toBe(fixtures.supplierId);
  });
});
