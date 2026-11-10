/**
 * A contact's track record: how many of its cheques cleared, how many came
 * back, and how many are still open.
 *
 * The case that matters is a cheque that bounced and was paid later: it is
 * one outcome, not two, and it still counts as having come back.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('contact reliability (e2e)', () => {
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
  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`${API}${path}`).set(auth()).send(body).expect(200);
  const version = async (id: string) =>
    (await prisma.db.cheque.findUniqueOrThrow({ where: { id } })).version;

  async function inHand(number: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        chequeNumber: number,
        amount: '100.00',
        currency: 'USD',
        dueDate: '2026-12-31',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
      })
      .expect(201);
    const id = created.body.cheque.id as string;
    await post(`/cheques/${id}/receive`, {
      fromContactId: fixtures.customerId,
      toLocationId: fixtures.safeLocationId,
      version: created.body.cheque.version,
    });
    return id;
  }

  const deposit = async (id: string) =>
    post(`/cheques/${id}/deposit`, {
      toLocationId: fixtures.bankLocationId,
      version: await version(id),
    });

  const reliability = async () =>
    (
      await request(app.getHttpServer())
        .get(`${API}/contacts/${fixtures.customerId}/reliability`)
        .set(auth())
        .expect(200)
    ).body as { decided: number; cleared: number; bounced: number; openBounced: number };

  let bouncedId = '';

  it('has no record for a contact whose cheques have no outcome yet', async () => {
    await inHand('RL-OPEN');
    expect(await reliability()).toEqual({ decided: 0, cleared: 0, bounced: 0, openBounced: 0 });
  });

  it('counts a cleared cheque and an open bounced one', async () => {
    const cleared = await inHand('RL-CLEARED');
    await deposit(cleared);
    await post(`/cheques/${cleared}/clear`, { version: await version(cleared) });

    bouncedId = await inHand('RL-BOUNCED');
    await deposit(bouncedId);
    await post(`/cheques/${bouncedId}/bounce`, {
      reason: 'رصيد غير كافٍ',
      version: await version(bouncedId),
    });

    expect(await reliability()).toEqual({ decided: 2, cleared: 1, bounced: 1, openBounced: 1 });
  });

  it('keeps a cheque that bounced and was paid later as one outcome that came back', async () => {
    await post(`/cheques/${bouncedId}/postpone`, {
      newDueDate: '2027-01-15',
      reason: 'وعد بالسداد',
      version: await version(bouncedId),
    });
    await post('/cheques/bulk-action', {
      chequeIds: [bouncedId],
      action: 'RESUME',
      toLocationId: fixtures.safeLocationId,
    });
    await deposit(bouncedId);
    await post(`/cheques/${bouncedId}/clear`, { version: await version(bouncedId) });

    expect(await reliability()).toEqual({ decided: 2, cleared: 2, bounced: 1, openBounced: 0 });
  });

  it('carries the same figures on the statement', async () => {
    const statement = await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/statement`)
      .set(auth())
      .expect(200);
    expect(statement.body.reliability).toEqual(await reliability());
  });

  it("does not answer for another organization's contact", async () => {
    await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/reliability`)
      .set({ Authorization: `Bearer ${otherToken}` })
      .expect(404);
  });

  it('lists the contact on the risk report by the same counts, and only for its organization', async () => {
    const risk = (token: string) =>
      request(app.getHttpServer())
        .get(`${API}/reports/contact-risk`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(200);

    const mine = (await risk(token)).body as Array<{
      contactId: string;
      level: string;
      decided: number;
      bounced: number;
      openBounced: number;
      outstanding: Array<{ currency: string; total: string }>;
    }>;
    const entry = mine.find((row) => row.contactId === fixtures.customerId);
    // Bounced once, since paid: it came back, but nothing is open.
    expect(entry).toMatchObject({
      level: 'medium',
      decided: 2,
      bounced: 1,
      openBounced: 0,
      outstanding: [{ currency: 'USD', total: '100.00' }],
    });

    expect((await risk(otherToken)).body).toEqual([]);
  });
});
