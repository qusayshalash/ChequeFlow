/** Refresh token rotation, re-use detection and session revocation. */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('auth token rotation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;

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

  async function login(): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: fixtures.ownerEmail, password: fixtures.password })
      .expect(200);
    return response.body as { accessToken: string; refreshToken: string };
  }

  it('rotates the refresh token on every use', async () => {
    const first = await login();
    const refreshed = await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(first.refreshToken);
    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set({ Authorization: `Bearer ${refreshed.body.accessToken}` })
      .expect(200);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const session = await login();
    const rotated = await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    // Replaying the consumed token is treated as theft.
    await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: session.refreshToken })
      .expect(401);

    // ...which also kills the token that replaced it.
    await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('revokes a session on logout', async () => {
    const session = await login();
    await request(app.getHttpServer())
      .post(`${API}/auth/logout`)
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .send({ refreshToken: session.refreshToken, allDevices: false })
      .expect(204);

    await request(app.getHttpServer())
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('requires a bearer token on protected routes', async () => {
    const response = await request(app.getHttpServer()).get(`${API}/cheques`).expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
