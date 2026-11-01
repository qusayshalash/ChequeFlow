/**
 * Editing a cheque into a copy of another one.
 *
 * Creating a cheque compares its number, bank, amount and due date with every
 * other cheque in the organization, and reviewing a photographed one does too.
 * Editing did not: those same four fields could be changed to match a cheque
 * already on file, and nothing said so. These are the cases that decide
 * whether the gap is closed without making edits tiresome.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('editing a cheque into a duplicate (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;
  let firstId: string;
  let secondId: string;
  let secondVersion: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const cheque = (chequeNumber: string) => ({
    direction: 'INCOMING',
    chequeNumber,
    amount: '700.00',
    currency: 'USD',
    dueDate: '2027-01-15',
  });

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

    // Two cheques identical except for the number: one edit away from being
    // the same cheque twice.
    const first = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({ ...cheque('EDIT-0001'), bankId: fixtures.bankId })
      .expect(201);
    firstId = first.body.cheque.id;

    const second = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({ ...cheque('EDIT-0002'), bankId: fixtures.bankId })
      .expect(201);
    secondId = second.body.cheque.id;
    secondVersion = second.body.cheque.version;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  it('refuses an edit that makes a cheque match one already on file', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${API}/cheques/${secondId}`)
      .set(auth())
      .send({ chequeNumber: 'EDIT-0001', version: secondVersion })
      .expect(409);

    expect(response.body.error.code).toBe('DUPLICATE_CHEQUE');
    // The person is asked about a specific cheque, not warned in general.
    expect(response.body.error.details.duplicates[0].chequeId).toBe(firstId);
  });

  it('writes nothing when it refuses', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/cheques/${secondId}`)
      .set(auth())
      .expect(200);

    expect(response.body.chequeNumber).toBe('EDIT-0002');
    expect(response.body.version).toBe(secondVersion);
  });

  it('saves the edit once the person says both cheques are real', async () => {
    // A re-issued cheque can legitimately repeat a number, and only the person
    // holding it knows which this is.
    const response = await request(app.getHttpServer())
      .patch(`${API}/cheques/${secondId}?allowDuplicate=true`)
      .set(auth())
      .send({ chequeNumber: 'EDIT-0001', version: secondVersion })
      .expect(200);

    expect(response.body.chequeNumber).toBe('EDIT-0001');
    secondVersion = response.body.version;
  });

  it('does not ask again when an edit leaves the key alone', async () => {
    // The pair is now a duplicate a person chose to keep. Adding a note to one
    // of them changes nothing the check is about, so it must not re-ask.
    await request(app.getHttpServer())
      .patch(`${API}/cheques/${secondId}`)
      .set(auth())
      .send({ notes: 'confirmed as a re-issue', version: secondVersion })
      .expect(200);
  });

  it('checks each field of the key, not only the number', async () => {
    // A third cheque one due date away from the first.
    const third = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({ ...cheque('EDIT-0001'), dueDate: '2027-02-15', bankId: fixtures.bankId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(`${API}/cheques/${third.body.cheque.id}`)
      .set(auth())
      .send({ dueDate: '2027-01-15', version: third.body.cheque.version })
      .expect(409);
    expect(response.body.error.code).toBe('DUPLICATE_CHEQUE');
  });
});
