/**
 * Changing a password, against a real database.
 *
 * Nobody could change their own password at all, and the administrator's
 * reset existed only in the API. These cases are the ones that decide whether
 * the new paths are safe rather than merely present: a wrong current password
 * changes nothing, a right one ends every other session, the change is
 * audited without the password in it, and an administrator cannot use the
 * reset path to skip the current-password check on their own account.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

const NEW_PASSWORD = 'Changed-Password-2026';

describeWithDb('changing a password (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let session: { accessToken: string; refreshToken: string };
  let otherDevice: { accessToken: string; refreshToken: string };

  const login = async (email: string, password: string, expected = 200) =>
    request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email, password })
      .expect(expected);

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);

    session = (await login(fixtures.ownerEmail, fixtures.password)).body;
    // A second sign-in stands for a phone, or a laptop left open elsewhere.
    otherDevice = (await login(fixtures.ownerEmail, fixtures.password)).body;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const change = (body: object, token = session.accessToken) =>
    request(app.getHttpServer())
      .post(`${API}/auth/change-password`)
      .set({ Authorization: `Bearer ${token}` })
      .send(body);

  it('refuses a wrong current password, under that field, and changes nothing', async () => {
    const response = await change({
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    }).expect(422);

    expect(response.body.error.fieldErrors[0].path).toBe('currentPassword');
    // Still the old password.
    await login(fixtures.ownerEmail, fixtures.password);
  });

  it('refuses a new password that breaks the rules', async () => {
    await change({ currentPassword: fixtures.password, newPassword: 'short' }).expect(422);
  });

  it('refuses a new password identical to the current one', async () => {
    await change({
      currentPassword: fixtures.password,
      newPassword: fixtures.password,
    }).expect(422);
  });

  it('changes it and keeps this device signed in with new tokens', async () => {
    const response = await change({
      currentPassword: fixtures.password,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
    session = response.body;

    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .expect(200);
  });

  it('ends the session on every other device', async () => {
    // The point of changing a password that someone else may know is that
    // the session they already hold stops working.
    await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: otherDevice.refreshToken })
      .expect(401);
  });

  it('signs in with the new password and not the old', async () => {
    await login(fixtures.ownerEmail, fixtures.password, 401);
    await login(fixtures.ownerEmail, NEW_PASSWORD);
  });

  it('records the change without the password in it', async () => {
    const rows = await prisma.db.auditLog.findMany({
      where: { organizationId: fixtures.organizationId, action: 'auth.password.changed' },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(rows)).not.toContain(fixtures.password);

    const failed = await prisma.db.auditLog.count({
      where: { organizationId: fixtures.organizationId, action: 'auth.password.change_failed' },
    });
    expect(failed).toBe(1);
  });

  it('refuses an administrator resetting their own password without the current one', async () => {
    // Otherwise a session left open would be enough to take the account over,
    // which is the one thing asking for the current password prevents.
    const me = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`${API}/users/${me.body.id}`)
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .send({ newPassword: 'Another-Password-2026' })
      .expect(422);
    expect(response.body.error.fieldErrors[0].path).toBe('newPassword');
  });

  it('lets an administrator reset someone else, ending their sessions, audited as a reset', async () => {
    const viewerSession = (await login(fixtures.viewerEmail, fixtures.password)).body;
    const viewer = await prisma.db.user.findFirstOrThrow({
      where: { organizationId: fixtures.organizationId, email: fixtures.viewerEmail },
    });

    await request(app.getHttpServer())
      .patch(`${API}/users/${viewer.id}`)
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .send({ newPassword: 'Reset-By-Admin-2026' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: viewerSession.refreshToken })
      .expect(401);
    await login(fixtures.viewerEmail, 'Reset-By-Admin-2026');

    // It used to be written as a status change.
    const resets = await prisma.db.auditLog.count({
      where: {
        organizationId: fixtures.organizationId,
        action: 'user.password_reset',
        entityId: viewer.id,
      },
    });
    expect(resets).toBe(1);
  });
});
