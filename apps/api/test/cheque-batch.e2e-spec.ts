/**
 * Serial cheque batches: a customer hands over a whole cheque book at once.
 *
 * The rules under test are the ones that make a batch safe to use for money —
 * it is all-or-nothing, every row gets its own ledger entry and audit row, and
 * duplicates are reported for the whole batch before anything is written.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('serial cheque batch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let ownerToken: string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);

    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: fixtures.password })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

  /** Shared header for a batch, with `cheques` supplied per test. */
  const batch = (cheques: Array<{ chequeNumber: string; amount: string; dueDate: string }>) => ({
    direction: 'INCOMING',
    currency: 'USD',
    issueDate: '2026-01-01',
    bankId: fixtures.bankId,
    drawerName: 'شركة النور للتجارة',
    originalSourceId: fixtures.customerId,
    currentLocationId: fixtures.safeLocationId,
    cheques,
  });

  it('creates a run of serial cheques in one request', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send(
        batch([
          { chequeNumber: 'B-1001', amount: '3000.00', dueDate: '2026-08-31' },
          { chequeNumber: 'B-1002', amount: '3000.00', dueDate: '2026-09-30' },
          { chequeNumber: 'B-1003', amount: '2500.50', dueDate: '2026-10-31' },
        ]),
      )
      .expect(201);

    expect(response.body.cheques).toHaveLength(3);
    expect(response.body.duplicates).toEqual([]);

    // Every row carries the shared header, and its own number/amount/date.
    for (const cheque of response.body.cheques) {
      expect(cheque.status).toBe(ChequeStatus.DRAFT);
      expect(cheque.currency).toBe('USD');
      expect(cheque.direction).toBe('INCOMING');
    }
    expect(response.body.cheques.map((row: { chequeNumber: string }) => row.chequeNumber)).toEqual([
      'B-1001',
      'B-1002',
      'B-1003',
    ]);
    expect(response.body.cheques[2].amount).toBe('2500.50');
  });

  it('gives every cheque in the batch its own CREATED event', async () => {
    const created = await prisma.db.cheque.findMany({
      where: { organizationId: fixtures.organizationId, chequeNumber: { startsWith: 'B-100' } },
      select: { id: true, _count: { select: { events: true } } },
    });

    expect(created).toHaveLength(3);
    // A cheque without history is a cheque nobody can account for.
    for (const cheque of created) expect(cheque._count.events).toBe(1);
  });

  it('records one audit entry per cheque, marked with the batch size', async () => {
    const ids = (
      await prisma.db.cheque.findMany({
        where: { organizationId: fixtures.organizationId, chequeNumber: { startsWith: 'B-100' } },
        select: { id: true },
      })
    ).map((row) => row.id);

    const logs = await prisma.db.auditLog.findMany({
      where: { organizationId: fixtures.organizationId, entityId: { in: ids } },
      select: { afterJson: true },
    });

    expect(logs).toHaveLength(3);
    for (const log of logs) {
      expect((log.afterJson as { batchSize?: number }).batchSize).toBe(3);
    }
  });

  it('refuses the whole batch when any row duplicates an existing cheque', async () => {
    const before = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });

    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send(
        batch([
          { chequeNumber: 'B-2001', amount: '100.00', dueDate: '2026-08-31' },
          // Identical to the first cheque created above.
          { chequeNumber: 'B-1001', amount: '3000.00', dueDate: '2026-08-31' },
          { chequeNumber: 'B-2003', amount: '100.00', dueDate: '2026-10-31' },
        ]),
      )
      .expect(409);

    expect(response.body.error.code).toBe('DUPLICATE_CHEQUE');
    // The offending row is named by position, so the form can point at it.
    expect(response.body.error.details.duplicateRows).toBe('1');
    expect(response.body.error.details.duplicateNumbers).toBe('B-1001');

    // All or nothing: the two clean rows must not have been written either.
    const after = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });
    expect(after).toBe(before);
  });

  it('creates the batch when the duplicate is explicitly allowed', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/batch?allowDuplicate=true`)
      .set(auth())
      .send(
        batch([
          { chequeNumber: 'B-1001', amount: '3000.00', dueDate: '2026-08-31' },
          { chequeNumber: 'B-3002', amount: '400.00', dueDate: '2026-09-30' },
        ]),
      )
      .expect(201);

    expect(response.body.cheques).toHaveLength(2);
    // The matches are still reported, so the user sees what they overrode.
    expect(response.body.duplicates).toHaveLength(1);
    expect(response.body.duplicates[0].index).toBe(0);
    expect(response.body.duplicates[0].chequeNumber).toBe('B-1001');
  });

  it('rejects a batch whose rows repeat a number, before touching the database', async () => {
    const before = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });

    const response = await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send(
        batch([
          { chequeNumber: 'B-4001', amount: '10.00', dueDate: '2026-08-31' },
          { chequeNumber: 'B-4001', amount: '10.00', dueDate: '2026-09-30' },
        ]),
      )
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const after = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });
    expect(after).toBe(before);
  });

  it('rejects an empty batch', async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send(batch([]))
      .expect(422);
  });

  it('rejects a batch larger than the ceiling', async () => {
    const rows = Array.from({ length: 61 }, (_, index) => ({
      chequeNumber: `C-${index}`,
      amount: '5.00',
      dueDate: '2026-08-31',
    }));

    await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send(batch(rows))
      .expect(422);
  });

  it('refuses a location that does not belong to the tenant', async () => {
    const before = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });

    await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set(auth())
      .send({
        ...batch([{ chequeNumber: 'B-5001', amount: '10.00', dueDate: '2026-08-31' }]),
        currentLocationId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);

    // The shared references are checked before the transaction opens, so a bad
    // reference cannot leave a partial batch behind.
    const after = await prisma.db.cheque.count({
      where: { organizationId: fixtures.organizationId },
    });
    expect(after).toBe(before);
  });
});
