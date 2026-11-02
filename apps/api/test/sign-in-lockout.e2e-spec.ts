/**
 * Locking an account after repeated failed sign-ins.
 *
 * The per-minute limit on sign-in is per IP address, so guessing at one
 * account from several addresses had no limit, and every failure was recorded
 * and acted on by nothing. These cases decide whether the lock is safe as well
 * as present: it refuses even the right password while it lasts, it says how
 * long is left, it does not punish the owner for an old typo, and it can be
 * lifted.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL. Uses the
 * default threshold of five.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('sign-in lockout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;

  const attempt = (email: string, password: string) =>
    request(app.getHttpServer()).post(`${API}/auth/login`).send({ email, password });

  const viewer = () =>
    prisma.db.user.findFirstOrThrow({
      where: { organizationId: fixtures.organizationId, email: fixtures.viewerEmail },
    });

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  it('forgives an old mistake: a success clears the run', async () => {
    for (let i = 0; i < 4; i += 1) await attempt(fixtures.viewerEmail, 'wrong').expect(401);
    await attempt(fixtures.viewerEmail, fixtures.password).expect(200);
    // Four more wrong after a success is not nine in a row.
    for (let i = 0; i < 4; i += 1) await attempt(fixtures.viewerEmail, 'wrong').expect(401);
    await attempt(fixtures.viewerEmail, fixtures.password).expect(200);
  });

  it('locks after five wrong passwords in a row', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(fixtures.viewerEmail, 'wrong').expect(401);
    expect((await viewer()).lockedUntil).not.toBeNull();
  });

  it('refuses even the right password while locked, and says for how long', async () => {
    // Checking the password here would let a guesser tell right from wrong.
    const response = await attempt(fixtures.viewerEmail, fixtures.password).expect(423);
    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(response.body.error.details.minutes).toBeGreaterThan(0);
  });

  it('writes the lock to the audit trail', async () => {
    const locks = await prisma.db.auditLog.count({
      where: { organizationId: fixtures.organizationId, action: 'auth.account.locked' },
    });
    expect(locks).toBe(1);
  });

  it('lets the owner back in once the lock has passed', async () => {
    const user = await viewer();
    await prisma.db.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await attempt(fixtures.viewerEmail, fixtures.password).expect(200);
    const after = await viewer();
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('is lifted by an administrator resetting the password', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(fixtures.viewerEmail, 'wrong').expect(401);
    await attempt(fixtures.viewerEmail, fixtures.password).expect(423);

    const owner = await attempt(fixtures.ownerEmail, fixtures.password).expect(200);
    const user = await viewer();
    await request(app.getHttpServer())
      .patch(`${API}/users/${user.id}`)
      .set({ Authorization: `Bearer ${owner.body.accessToken}` })
      .send({ newPassword: 'Unlocked-By-Admin-2026' })
      .expect(200);

    await attempt(fixtures.viewerEmail, 'Unlocked-By-Admin-2026').expect(200);
  });

  it('never claims an account that does not exist is locked', async () => {
    // A lock is only ever reported for an account that is really there.
    for (let i = 0; i < 6; i += 1) {
      const response = await attempt('nobody@example.invalid', 'wrong').expect(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    }
  });
});
