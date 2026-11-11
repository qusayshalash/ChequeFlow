/**
 * Statement share links.
 *
 * A link opens part of the books to someone without an account, so what is
 * pinned here is mostly what it must not do: show another contact's cheques,
 * an account number, a cheque nobody confirmed; outlive its expiry or its
 * revocation; be made by someone who may not manage contacts; or be kept in
 * the database in a form that works.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import { createHash } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('statement share links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let other: Fixtures;
  let owner: string;
  let viewer: string;
  let otherOwner: string;
  let token = '';
  let linkId = '';

  const login = async (email: string, password: string) =>
    (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;
  const as = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);
    other = await seedFixtures(prisma);
    owner = await login(fixtures.ownerEmail, fixtures.password);
    viewer = await login(fixtures.viewerEmail, fixtures.password);
    otherOwner = await login(other.ownerEmail, other.password);

    const create = async (body: Record<string, unknown>, receive: boolean) => {
      const created = await request(app.getHttpServer())
        .post(`${API}/cheques`)
        .set(as(owner))
        .send({
          direction: 'INCOMING',
          currency: 'USD',
          dueDate: '2026-12-31',
          bankId: fixtures.bankId,
          ...body,
        })
        .expect(201);
      if (receive) {
        await request(app.getHttpServer())
          .post(`${API}/cheques/${created.body.cheque.id}/receive`)
          .set(as(owner))
          .send({
            fromContactId: body.originalSourceId,
            toLocationId: fixtures.safeLocationId,
            version: created.body.cheque.version,
          })
          .expect(200);
      }
    };
    // Theirs, in hand, carrying an account number that must not leak.
    await create(
      {
        chequeNumber: 'SL-1',
        amount: '700.00',
        originalSourceId: fixtures.customerId,
        accountNumber: '0011223344',
      },
      true,
    );
    // Theirs, but only typed in: not part of an account they are shown.
    await create(
      { chequeNumber: 'SL-DRAFT', amount: '50.00', originalSourceId: fixtures.customerId },
      false,
    );
    // Someone else's.
    await create(
      { chequeNumber: 'SL-OTHER', amount: '900.00', originalSourceId: fixtures.supplierId },
      true,
    );
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (other) await cleanupFixtures(prisma, other.organizationId);
    if (app) await app.close();
  });

  const read = (value: string) =>
    request(app.getHttpServer()).get(`${API}/public/statements/${value}`);

  it('makes a link, handing the token out once and keeping only its hash', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(owner))
      .send({ days: 7 })
      .expect(201);
    token = created.body.token;
    linkId = created.body.id;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await prisma.db.statementLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(
      await prisma.db.auditLog.count({
        where: { entityId: linkId, action: 'statement_link.created' },
      }),
    ).toBe(1);

    // The list shows the link, never the token.
    const listed = await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(owner))
      .expect(200);
    expect(listed.body[0].id).toBe(linkId);
    expect(JSON.stringify(listed.body)).not.toContain(token);
  });

  it('shows the holder only their own confirmed cheques, without an account', async () => {
    const response = await read(token).expect(200);
    const body = response.body as {
      contactName: string;
      organizationName: string;
      cheques: Array<{ chequeNumber: string; part: string }>;
      currencies: Array<{ currency: string; net: string }>;
    };

    expect(body.cheques.map((cheque) => cheque.chequeNumber)).toEqual(['SL-1']);
    expect(body.cheques[0]?.part).toBe('FROM_THEM');
    expect(body.organizationName).toBeTruthy();
    // The same balance the contact page shows.
    const statement = await request(app.getHttpServer())
      .get(`${API}/contacts/${fixtures.customerId}/statement`)
      .set(as(owner))
      .expect(200);
    expect(body.currencies.map((entry) => entry.net)).toEqual(
      (statement.body.currencies as Array<{ net: string }>).map((entry) => entry.net),
    );

    const text = JSON.stringify(response.body);
    for (const secret of ['0011223344', '3344', 'SL-OTHER', 'SL-DRAFT', fixtures.safeLocationId]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/accountNumber|notes|Location|holder|drawer/i);

    const row = await prisma.db.statementLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(row.viewCount).toBe(1);
  });

  it('answers the same "not found" for a wrong, short, expired or revoked token', async () => {
    await read('x'.repeat(43)).expect(404);
    await read('short').expect(404);

    const soon = await request(app.getHttpServer())
      .post(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(owner))
      .send({ days: 1 })
      .expect(201);
    await prisma.db.statementLink.update({
      where: { id: soon.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await read(soon.body.token).expect(404);

    await request(app.getHttpServer())
      .delete(`${API}/contacts/${fixtures.customerId}/statement-links/${linkId}`)
      .set(as(owner))
      .expect(200);
    await read(token).expect(404);
    expect(
      await prisma.db.auditLog.count({
        where: { entityId: linkId, action: 'statement_link.revoked' },
      }),
    ).toBe(1);
  });

  it('refuses a link length the server never makes', async () => {
    await request(app.getHttpServer())
      .post(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(owner))
      .send({ days: 365 })
      .expect(422);
  });

  it('is made only by someone who may manage contacts, in their own organization', async () => {
    await request(app.getHttpServer())
      .post(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(viewer))
      .send({ days: 7 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${API}/contacts/${fixtures.customerId}/statement-links`)
      .set(as(otherOwner))
      .send({ days: 7 })
      .expect(404);
  });
});
