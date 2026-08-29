/**
 * Multi-tenant isolation: a token from one organization must never reach
 * another organization's data, even when the client supplies its ids.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: Fixtures;
  let orgB: Fixtures;
  let tokenA: string;
  let chequeInB: string;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    orgA = await seedFixtures(prisma);
    orgB = await seedFixtures(prisma);

    const loginA = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: orgA.ownerEmail, password: orgA.password })
      .expect(200);
    tokenA = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: orgB.ownerEmail, password: orgB.password })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set({ Authorization: `Bearer ${loginB.body.accessToken}` })
      .send({
        direction: 'INCOMING',
        chequeNumber: 'ORG-B-1',
        amount: '10.00',
        currency: 'USD',
        dueDate: '2026-12-31',
      })
      .expect(201);
    chequeInB = created.body.cheque.id;
  });

  afterAll(async () => {
    if (orgA) await cleanupFixtures(prisma, orgA.organizationId);
    if (orgB) await cleanupFixtures(prisma, orgB.organizationId);
    if (app) await app.close();
  });

  it("hides another organization's cheque", async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/cheques/${chequeInB}`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("refuses an action on another organization's cheque", async () => {
    await request(app.getHttpServer())
      .post(`${API}/cheques/${chequeInB}/receive`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ fromContactId: orgA.customerId, toLocationId: orgA.safeLocationId })
      .expect(404);
  });

  it("ignores a client supplied organizationId and rejects another tenant's contact", async () => {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({
        organizationId: orgB.organizationId,
        direction: 'INCOMING',
        chequeNumber: 'CROSS-1',
        amount: '10.00',
        currency: 'USD',
        dueDate: '2026-12-31',
        originalSourceId: orgB.customerId,
      })
      .expect(404);
    expect(response.body.error.details.entity).toBe('Contact');
  });

  it("does not list another organization's contacts", async () => {
    const response = await request(app.getHttpServer())
      .get(`${API}/contacts`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .expect(200);
    const ids = response.body.data.map((contact: { id: string }) => contact.id);
    expect(ids).not.toContain(orgB.customerId);
  });
});
