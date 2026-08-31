/**
 * One action applied to a selection of cheques.
 *
 * The rules under test are the ones that keep a bulk screen safe to point at
 * money: a selection containing a cheque that cannot take the action writes
 * nothing at all, every cheque that is changed still gets its own ledger event
 * and audit row, and a missing permission fails the request outright rather
 * than quietly skipping cheques.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('bulk cheque actions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let ownerToken: string;
  let viewerToken: string;
  let chequeIds: string[] = [];

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);

    const ownerLogin = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: fixtures.password })
      .expect(200);
    ownerToken = ownerLogin.body.accessToken;

    const viewerLogin = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.viewerEmail, password: fixtures.password })
      .expect(200);
    viewerToken = viewerLogin.body.accessToken;

    // Four cheques from one book, so the selection is the realistic one: a
    // customer's whole batch, being deposited together.
    const created = await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .send({
        direction: 'INCOMING',
        currency: 'USD',
        bankId: fixtures.bankId,
        originalSourceId: fixtures.customerId,
        currentLocationId: fixtures.safeLocationId,
        cheques: [
          { chequeNumber: 'K-1', amount: '100.00', dueDate: '2026-09-30' },
          { chequeNumber: 'K-2', amount: '200.00', dueDate: '2026-10-31' },
          { chequeNumber: 'K-3', amount: '300.00', dueDate: '2026-11-30' },
          { chequeNumber: 'K-4', amount: '400.00', dueDate: '2026-12-31' },
        ],
      })
      .expect(201);

    chequeIds = created.body.cheques.map((cheque: { id: string }) => cheque.id);
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = (token = ownerToken) => ({ Authorization: `Bearer ${token}` });

  it('moves the whole selection through one action', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({
        chequeIds,
        action: 'RECEIVE',
        fromContactId: fixtures.customerId,
        toLocationId: fixtures.safeLocationId,
      })
      .expect(200);

    expect(response.body.status).toBe('APPLIED');
    expect(response.body.applied).toHaveLength(4);
    expect(response.body.skipped).toEqual([]);
    for (const cheque of response.body.applied) {
      expect(cheque.status).toBe(ChequeStatus.IN_HAND);
    }
  });

  it('writes a ledger event for every cheque it changed', async () => {
    const cheques = await prisma.db.cheque.findMany({
      where: { id: { in: chequeIds } },
      select: { id: true, version: true, _count: { select: { events: true } } },
    });

    // CREATED from the batch, then RECEIVED from the bulk action.
    for (const cheque of cheques) {
      expect(cheque._count.events).toBe(2);
      expect(cheque.version).toBe(2);
    }
  });

  it('writes nothing when one cheque in the selection cannot take the action', async () => {
    // Take one cheque out of IN_HAND, so DEPOSIT is illegal for it alone.
    const odd = chequeIds[0]!;
    await request(app.getHttpServer())
      .post(`${API}/cheques/${odd}/postpone`)
      .set(auth())
      .send({ newDueDate: '2027-01-31', reason: 'طلب العميل تأجيل الإيداع' })
      .expect(200);

    const before = await prisma.db.chequeEvent.count({
      where: { chequeId: { in: chequeIds } },
    });

    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({
        chequeIds,
        action: 'DEPOSIT',
        toLocationId: fixtures.bankLocationId,
      })
      .expect(200);

    // A refusal, not an error: the caller is told exactly what to deselect.
    expect(response.body.status).toBe('BLOCKED');
    expect(response.body.applied).toEqual([]);
    expect(response.body.skipped).toHaveLength(1);
    expect(response.body.skipped[0].chequeId).toBe(odd);
    expect(response.body.skipped[0].chequeNumber).toBe('K-1');
    expect(response.body.skipped[0].reason).toBe('errors.INVALID_STATE_TRANSITION');

    // The three cheques that *could* have been deposited must be untouched.
    const after = await prisma.db.chequeEvent.count({
      where: { chequeId: { in: chequeIds } },
    });
    expect(after).toBe(before);
  });

  it('applies the rest only when skipInvalid is asked for', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({
        chequeIds,
        action: 'DEPOSIT',
        toLocationId: fixtures.bankLocationId,
        skipInvalid: true,
      })
      .expect(200);

    expect(response.body.status).toBe('APPLIED');
    expect(response.body.applied).toHaveLength(3);
    expect(response.body.skipped).toHaveLength(1);
    for (const cheque of response.body.applied) {
      expect(cheque.status).toBe(ChequeStatus.DEPOSITED);
    }

    // And the postponed one really was left alone.
    const untouched = await prisma.db.cheque.findUniqueOrThrow({
      where: { id: chequeIds[0]! },
      select: { status: true },
    });
    expect(untouched.status).toBe(ChequeStatus.POSTPONED);
  });

  it('refuses the request outright when the caller lacks the permission', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth(viewerToken))
      .send({ chequeIds, action: 'CLEAR' })
      .expect(403);

    // Not reported as a per-cheque skip: that would confirm to someone without
    // the permission that the cheques exist.
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('reports an id from another tenant as not found, without saying more', async () => {
    const stranger = await prisma.db.cheque.create({
      data: {
        organization: {
          create: { name: 'منشأة أخرى', country: 'PS', defaultCurrency: 'ILS' },
        },
        direction: 'INCOMING',
        chequeNumber: 'X-9',
        amount: '10',
        currency: 'ILS',
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        status: ChequeStatus.IN_HAND,
      },
      select: { id: true, organizationId: true },
    });

    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({ chequeIds: [stranger.id], action: 'DEPOSIT', toLocationId: fixtures.bankLocationId })
      .expect(200);

    expect(response.body.status).toBe('BLOCKED');
    expect(response.body.skipped[0].reason).toBe('errors.NOT_FOUND');
    // The other tenant's cheque number is not echoed back.
    expect(response.body.skipped[0].chequeNumber).toBe('');

    await prisma.db.cheque.delete({ where: { id: stranger.id } });
    await prisma.db.organization.delete({ where: { id: stranger.organizationId } });
  });

  it('rejects a selection that repeats the same cheque', async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({
        chequeIds: [chequeIds[1]!, chequeIds[1]!],
        action: 'CLEAR',
      })
      .expect(422);
  });

  it('rejects an action that is not safe to apply in bulk', async () => {
    // BOUNCE carries a per-cheque reason and fee; one payload cannot honestly
    // describe twenty of them.
    await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({ chequeIds, action: 'BOUNCE', reason: 'رصيد غير كاف' })
      .expect(422);
  });

  it('rejects an empty selection and one past the ceiling', async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({ chequeIds: [], action: 'CLEAR' })
      .expect(422);

    const tooMany = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    await request(app.getHttpServer())
      .post(`${API}/cheques/bulk-action`)
      .set(auth())
      .send({ chequeIds: tooMany, action: 'CLEAR' })
      .expect(422);
  });
});
