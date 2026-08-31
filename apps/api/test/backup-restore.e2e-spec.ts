/**
 * Restoring a backup.
 *
 * A backup you cannot restore is not a backup. What matters here is not that
 * the happy path works, but that the refusals do: a restore that quietly
 * doubled an organization's cheques, or half-finished, would be worse than no
 * restore at all.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('backup restore (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let source: Fixtures;
  let sourceToken: string;
  let archive: Record<string, unknown>;

  /** A second, deliberately empty organization to restore into. */
  let target: Fixtures;
  let targetToken: string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;

    source = await seedFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: source.ownerEmail, password: source.password })
      .expect(200);
    sourceToken = login.body.accessToken;

    // Give the source organization something worth losing.
    await request(app.getHttpServer())
      .post(`${API}/cheques/batch`)
      .set({ Authorization: `Bearer ${sourceToken}` })
      .send({
        direction: 'INCOMING',
        currency: 'USD',
        bankId: source.bankId,
        originalSourceId: source.customerId,
        currentLocationId: source.safeLocationId,
        cheques: [
          { chequeNumber: 'R-1', amount: '1000.00', dueDate: '2026-09-30' },
          { chequeNumber: 'R-2', amount: '2000.00', dueDate: '2026-10-31' },
        ],
      })
      .expect(201);

    const exported = await request(app.getHttpServer())
      .get(`${API}/backup/export`)
      .set({ Authorization: `Bearer ${sourceToken}` })
      .expect(200);
    archive = JSON.parse(exported.text);
  });

  afterAll(async () => {
    if (target) await cleanupFixtures(prisma, target.organizationId);
    if (source) await cleanupFixtures(prisma, source.organizationId);
    if (app) await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('refuses an organization that already holds records', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(sourceToken))
      .send({ archive, confirm: true })
      .expect(409);

    // There is no merge: the append-only ledger cannot be cleared to make room
    // for one, so a restore over live data could only add a second copy.
    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.details.reason).toBe('ORGANIZATION_NOT_EMPTY');
  });

  it('refuses an archive whose format it does not understand', async () => {
    target = await seedFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: target.ownerEmail, password: target.password })
      .expect(200);
    targetToken = login.body.accessToken;

    // The target's own fixtures include contacts, so empty it first.
    await prisma.db.contact.deleteMany({ where: { organizationId: target.organizationId } });
    await prisma.db.location.deleteMany({ where: { organizationId: target.organizationId } });
    await prisma.db.branch.deleteMany({ where: { organizationId: target.organizationId } });

    await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(targetToken))
      .send({ archive: { ...archive, format: 99 }, confirm: true })
      .expect(422);
  });

  it('refuses without an explicit confirmation', async () => {
    await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(targetToken))
      .send({ archive })
      .expect(422);
  });

  it('puts the records back, rebased onto the restoring organization', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(targetToken))
      .send({ archive, confirm: true })
      .expect(200);

    expect(response.body.restored.cheques).toBe(2);
    expect(response.body.restored.contacts).toBeGreaterThan(0);
    expect(response.body.restored.chequeEvents).toBe(2);

    // The archive's users already exist in this database — this is a copy, not
    // a recovery — so they are reported as skipped rather than duplicated.
    expect(response.body.skippedUsers).toBeGreaterThan(0);

    // Every restored row must belong to the organization that did the restore,
    // not to the one the archive came from.
    const cheques = await prisma.db.cheque.findMany({
      where: { organizationId: target.organizationId },
      select: { chequeNumber: true, amount: true, organizationId: true },
      orderBy: { chequeNumber: 'asc' },
    });

    expect(cheques.map((row) => row.chequeNumber)).toEqual(['R-1', 'R-2']);
    expect(cheques[0]?.amount.toFixed(2)).toBe('1000.00');
    expect(cheques.every((row) => row.organizationId === target.organizationId)).toBe(true);
  });

  it('brings the ledger back with the cheques', async () => {
    const events = await prisma.db.chequeEvent.findMany({
      where: { cheque: { organizationId: target.organizationId } },
      select: { eventType: true },
    });

    // A cheque without its history is a cheque nobody can account for.
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.eventType === 'CREATED')).toBe(true);
  });

  it('leaves restored users unable to sign in until given a password', async () => {
    // A real recovery restores into a database where the archive's users no
    // longer exist, so give them addresses nobody holds.
    const fresh = await seedFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fresh.ownerEmail, password: fresh.password })
      .expect(200);

    await prisma.db.contact.deleteMany({ where: { organizationId: fresh.organizationId } });
    await prisma.db.location.deleteMany({ where: { organizationId: fresh.organizationId } });
    await prisma.db.branch.deleteMany({ where: { organizationId: fresh.organizationId } });

    const users = (archive.data as { users: Array<Record<string, unknown>> }).users;
    // Unique per run: a fixed address would collide with a stray row left by
    // an earlier failed run and fail for a reason that looks nothing like it.
    const tag = Date.now();
    const recovery = {
      ...archive,
      data: {
        ...(archive.data as Record<string, unknown>),
        users: users.map((row, index) => ({
          ...row,
          email: `recovered-${tag}-${index}@e2e.local`,
        })),
      },
    };

    const response = await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(login.body.accessToken))
      .send({ archive: recovery, confirm: true })
      .expect(200);

    expect(response.body.restored.users).toBe(users.length);
    expect(response.body.usersNeedPasswords).toBe(true);

    const restored = await prisma.db.user.findMany({
      where: { organizationId: fresh.organizationId, status: 'INVITED' },
      select: { email: true, passwordHash: true },
    });
    expect(restored).toHaveLength(users.length);

    // The archive carries no password hashes by design, so a restore must not
    // be a way to obtain a working account.
    for (const restoredUser of restored) {
      expect(restoredUser.passwordHash).toBe('');
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: restoredUser.email, password: source.password })
        .expect(401);
    }

    await cleanupFixtures(prisma, fresh.organizationId);
  });

  it('records the restore in the audit log', async () => {
    const logs = await prisma.db.auditLog.findMany({
      where: { organizationId: target.organizationId, action: 'backup.restored' },
      select: { afterJson: true },
    });

    expect(logs).toHaveLength(1);
    expect((logs[0]?.afterJson as { cheques?: number }).cheques).toBe(2);
  });

  it('writes nothing at all when one row in the archive is bad', async () => {
    const empty = await seedFixtures(prisma);
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: empty.ownerEmail, password: empty.password })
      .expect(200);

    await prisma.db.contact.deleteMany({ where: { organizationId: empty.organizationId } });
    await prisma.db.location.deleteMany({ where: { organizationId: empty.organizationId } });
    await prisma.db.branch.deleteMany({ where: { organizationId: empty.organizationId } });

    const archiveData = archive.data as { cheques: Array<Record<string, unknown>> };
    const broken = {
      ...archive,
      data: {
        ...archiveData,
        cheques: [
          archiveData.cheques[0],
          // A status the enum does not have: the database refuses the row, and
          // the whole transaction must go with it.
          { ...archiveData.cheques[1], status: 'NOT_A_STATUS' },
        ],
      },
    };

    await request(app.getHttpServer())
      .post(`${API}/backup/restore`)
      .set(auth(login.body.accessToken))
      .send({ archive: broken, confirm: true })
      .expect(500);

    // A half-restored organization looks like a working one, which is the
    // worst possible outcome of a disaster recovery.
    const count = await prisma.db.cheque.count({
      where: { organizationId: empty.organizationId },
    });
    expect(count).toBe(0);

    await cleanupFixtures(prisma, empty.organizationId);
  });
});
