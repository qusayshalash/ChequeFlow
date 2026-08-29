/**
 * End-to-end coverage of the endpoints added in phase 2.
 *
 * These were verified by hand against a running API first; this suite exists
 * so CI catches a regression in them, which the phase-1 suites do not touch.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ChequeStatus, SystemRole, UserStatus } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Yesterday, so a cheque due then is unambiguously late. */
function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function nextYear(): string {
  return new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
}

describeWithDb('phase 2 surface (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;
  let ownUserId: string;

  /** A suffix so re-runs against a persistent database never collide. */
  const unique = Date.now().toString().slice(-6);

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

    const me = await request(app.getHttpServer()).get(`${API}/auth/me`).set(auth()).expect(200);
    ownUserId = me.body.id;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Creates a cheque and returns its id and version. */
  async function createCheque(overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set(auth())
      .send({
        direction: 'INCOMING',
        chequeNumber: `${unique}${Math.floor(Math.random() * 1000)}`,
        amount: '100.00',
        currency: 'SAR',
        dueDate: nextYear(),
        originalSourceId: fixtures.customerId,
        currentLocationId: fixtures.safeLocationId,
        ...overrides,
      })
      .expect(201);
    return { id: response.body.cheque.id, version: response.body.cheque.version };
  }

  describe('written amount', () => {
    it('stores the amount in words verbatim', async () => {
      const { id } = await createCheque({ amountInWords: 'مائة ريال فقط لا غير' });

      const response = await request(app.getHttpServer())
        .get(`${API}/cheques/${id}`)
        .set(auth())
        .expect(200);

      // Kept exactly as written: in a dispute the written amount prevails.
      expect(response.body.amountInWords).toBe('مائة ريال فقط لا غير');
    });
  });

  describe('overdue', () => {
    it('flags a late outstanding cheque and finds it through the filter', async () => {
      const { id, version } = await createCheque({ dueDate: yesterday() });

      const received = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({
          fromContactId: fixtures.customerId,
          toLocationId: fixtures.safeLocationId,
          version,
        })
        .expect(200);
      expect(received.body.isOverdue).toBe(true);

      const overdue = await request(app.getHttpServer())
        .get(`${API}/cheques?overdue=true`)
        .set(auth())
        .expect(200);
      expect(overdue.body.data.map((row: { id: string }) => row.id)).toContain(id);

      const notOverdue = await request(app.getHttpServer())
        .get(`${API}/cheques?overdue=false`)
        .set(auth())
        .expect(200);
      // `overdue=false` must exclude, not merely "not filter".
      expect(notOverdue.body.data.map((row: { id: string }) => row.id)).not.toContain(id);
    });

    it('never flags a cleared cheque, however old its due date', async () => {
      const { id, version } = await createCheque({ dueDate: yesterday() });

      const received = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({
          fromContactId: fixtures.customerId,
          toLocationId: fixtures.safeLocationId,
          version,
        })
        .expect(200);

      const deposited = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/deposit`)
        .set(auth())
        .send({ toLocationId: fixtures.bankLocationId, version: received.body.version })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/clear`)
        .set(auth())
        .send({ version: deposited.body.version })
        .expect(200);

      expect(cleared.body.status).toBe(ChequeStatus.CLEARED);
      expect(cleared.body.isOverdue).toBe(false);
    });
  });

  describe('bounce details', () => {
    it('records the bank reason and fee, and keeps them on the cheque', async () => {
      const { id, version } = await createCheque();

      const received = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({
          fromContactId: fixtures.customerId,
          toLocationId: fixtures.safeLocationId,
          version,
        })
        .expect(200);

      const deposited = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/deposit`)
        .set(auth())
        .send({ toLocationId: fixtures.bankLocationId, version: received.body.version })
        .expect(200);

      const bounced = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/bounce`)
        .set(auth())
        .send({ reason: 'رصيد غير كاف', fee: '25.00', version: deposited.body.version })
        .expect(200);

      expect(bounced.body.status).toBe(ChequeStatus.BOUNCED);
      expect(bounced.body.bounceReason).toBe('رصيد غير كاف');
      expect(bounced.body.bounceFee).toBe('25.00');
    });

    it('refuses to bounce a cheque that never reached the bank', async () => {
      const { id, version } = await createCheque();
      const received = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({
          fromContactId: fixtures.customerId,
          toLocationId: fixtures.safeLocationId,
          version,
        })
        .expect(200);

      // A cheque bounces at the bank; IN_HAND → BOUNCED is not a real event.
      const refused = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/bounce`)
        .set(auth())
        .send({ reason: 'x', version: received.body.version })
        .expect(409);
      expect(refused.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(refused.body.error.details.from).toBe(ChequeStatus.IN_HAND);
    });
  });

  describe('dashboard', () => {
    it('keeps each currency separate and reports a currency with only drafts', async () => {
      await createCheque({ currency: 'USD', amount: '50.00' });

      const response = await request(app.getHttpServer())
        .get(`${API}/dashboard`)
        .set(auth())
        .expect(200);

      const currencies: string[] = response.body.currencies.map(
        (entry: { currency: string }) => entry.currency,
      );
      expect(currencies).toContain('SAR');
      // The regression this guards: a currency whose cheques are all DRAFT used
      // to vanish from the dashboard entirely, so the page showed zeros while
      // the cheque list was full.
      expect(currencies).toContain('USD');

      // Reporting currency first.
      expect(currencies[0]).toBe(response.body.defaultCurrency);

      const usd = response.body.currencies.find(
        (entry: { currency: string }) => entry.currency === 'USD',
      );
      expect(usd.draft.count).toBeGreaterThan(0);
      expect(usd.draft.total).toBe('50.00');

      // Every bucket the UI renders must be present, not just the ones with data.
      for (const bucket of [
        'draft',
        'inHand',
        'dueToday',
        'dueWithin7Days',
        'dueWithin30Days',
        'overdue',
        'deposited',
        'cleared',
        'bounced',
        'returned',
        'incoming',
        'outgoing',
      ]) {
        expect(usd[bucket]).toEqual({ count: expect.any(Number), total: expect.any(String) });
      }
    });

    it('gives every activity row the cheque it belongs to', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API}/dashboard`)
        .set(auth())
        .expect(200);

      for (const event of response.body.recentEvents) {
        expect(typeof event.chequeId).toBe('string');
        expect(typeof event.chequeNumber).toBe('string');
      }
    });
  });

  describe('CSV export', () => {
    it('returns a downloadable CSV and audits the disclosure', async () => {
      await createCheque();

      const response = await request(app.getHttpServer())
        .get(`${API}/cheques/export?locale=en`)
        .set(auth())
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment; filename=');
      // The BOM is what makes Excel read it as UTF-8 rather than the local codepage.
      expect(response.text.startsWith('﻿')).toBe(true);
      expect(response.text).toContain('Cheque number');

      const audits = await prisma.db.auditLog.count({
        where: { organizationId: fixtures.organizationId, action: 'cheque.exported' },
      });
      expect(audits).toBeGreaterThan(0);
    });

    it('reports the true cheque count on a statement, not just what fits', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API}/contacts/${fixtures.supplierId}/statement`)
        .set(auth())
        .expect(200);

      // The per-currency figures cover every cheque while the list is capped,
      // so the count has to be reported or the two look contradictory.
      expect(typeof response.body.totalCheques).toBe('number');
      expect(response.body.totalCheques).toBeGreaterThanOrEqual(response.body.cheques.length);
    });

    it('neutralises a formula smuggled in through a drawer name', async () => {
      await createCheque({ drawerName: '=cmd|/c calc' });

      const response = await request(app.getHttpServer())
        .get(`${API}/cheques/export`)
        .set(auth())
        .expect(200);

      // Quoted because it contains a separator, and prefixed so no spreadsheet
      // treats it as a live formula.
      expect(response.text).toContain("'=cmd|/c calc");
      expect(response.text).not.toContain('\n=cmd');
    });
  });

  describe('contacts', () => {
    it('reports a per-currency statement for one contact', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API}/contacts/${fixtures.customerId}/statement`)
        .set(auth())
        .expect(200);

      expect(response.body.contact.id).toBe(fixtures.customerId);
      expect(Array.isArray(response.body.currencies)).toBe(true);
      expect(Array.isArray(response.body.cheques)).toBe(true);

      const sar = response.body.currencies.find(
        (entry: { currency: string }) => entry.currency === 'SAR',
      );
      expect(sar.pending.count).toBeGreaterThan(0);
      // The cheque bounced earlier in this suite came from this contact, so
      // the statement must show it rather than only counting what is pending.
      expect(sar.bounced.count).toBeGreaterThan(0);
      expect(Number(sar.bounced.total)).toBeGreaterThan(0);
    });

    it('deletes an unreferenced contact but only deactivates a referenced one', async () => {
      const created = await request(app.getHttpServer())
        .post(`${API}/contacts`)
        .set(auth())
        .send({ type: 'CUSTOMER', name: `Throwaway ${unique}` })
        .expect(201);

      const removed = await request(app.getHttpServer())
        .delete(`${API}/contacts/${created.body.id}`)
        .set(auth())
        .expect(200);
      expect(removed.body.deleted).toBe(true);

      // The seeded customer is named all over the cheque history above.
      const kept = await request(app.getHttpServer())
        .delete(`${API}/contacts/${fixtures.customerId}`)
        .set(auth())
        .expect(200);
      expect(kept.body.deleted).toBe(false);
      expect(kept.body.contact.isActive).toBe(false);
    });

    it('merges a duplicate without touching the append-only ledger', async () => {
      const duplicate = await request(app.getHttpServer())
        .post(`${API}/contacts`)
        .set(auth())
        .send({ type: 'CUSTOMER', name: `Duplicate ${unique}` })
        .expect(201);

      const { id, version } = await createCheque({ originalSourceId: duplicate.body.id });
      const eventsBefore = await prisma.db.chequeEvent.findMany({
        where: { chequeId: id },
        orderBy: { createdAt: 'asc' },
      });

      await request(app.getHttpServer())
        .post(`${API}/contacts/merge`)
        .set(auth())
        .send({ sourceId: duplicate.body.id, targetId: fixtures.supplierId })
        .expect(200);

      const cheque = await prisma.db.cheque.findUniqueOrThrow({ where: { id } });
      expect(cheque.originalSourceId).toBe(fixtures.supplierId);

      // The ledger records what actually happened at the time; a later
      // bookkeeping merge does not get to rewrite it.
      const eventsAfter = await prisma.db.chequeEvent.findMany({
        where: { chequeId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(eventsAfter).toEqual(eventsBefore);
      expect(version).toBeGreaterThan(0);

      // The duplicate survives, deactivated, so old rows still resolve to a name.
      const source = await prisma.db.contact.findUniqueOrThrow({
        where: { id: duplicate.body.id },
      });
      expect(source.isActive).toBe(false);
    });

    it('refuses to merge a contact into itself', async () => {
      await request(app.getHttpServer())
        .post(`${API}/contacts/merge`)
        .set(auth())
        .send({ sourceId: fixtures.supplierId, targetId: fixtures.supplierId })
        .expect(422);
    });
  });

  describe('users', () => {
    it('creates a member, rejects a duplicate sign-in name, and never returns a hash', async () => {
      const login = `member${unique}`;

      const created = await request(app.getHttpServer())
        .post(`${API}/users`)
        .set(auth())
        .send({
          name: 'محاسب',
          email: login,
          password: 'ValidPassword1',
          roles: [SystemRole.ACCOUNTANT],
        })
        .expect(201);

      expect(created.body.roles).toContain(SystemRole.ACCOUNTANT);
      expect(created.body.status).toBe(UserStatus.ACTIVE);
      expect(JSON.stringify(created.body)).not.toContain('passwordHash');
      expect(JSON.stringify(created.body)).not.toContain('$argon2');

      await request(app.getHttpServer())
        .post(`${API}/users`)
        .set(auth())
        .send({
          name: 'x',
          email: login,
          password: 'ValidPassword1',
          roles: [SystemRole.VIEWER],
        })
        .expect(422);
    });

    it('refuses to let a user disable their own account', async () => {
      // Recovering from this needs a second administrator, who may not exist.
      await request(app.getHttpServer())
        .patch(`${API}/users/${ownUserId}`)
        .set(auth())
        .send({ status: UserStatus.DISABLED })
        .expect(422);
    });

    it('revokes every session when an administrator resets a password', async () => {
      const login = `reset${unique}`;
      const created = await request(app.getHttpServer())
        .post(`${API}/users`)
        .set(auth())
        .send({
          name: 'موظف',
          email: login,
          password: 'ValidPassword1',
          roles: [SystemRole.VIEWER],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: login, password: 'ValidPassword1' })
        .expect(200);

      expect(
        await prisma.db.refreshToken.count({
          where: { userId: created.body.id, revokedAt: null },
        }),
      ).toBe(1);

      await request(app.getHttpServer())
        .patch(`${API}/users/${created.body.id}`)
        .set(auth())
        .send({ newPassword: 'AnotherPassword1', reason: 'lost device' })
        .expect(200);

      // The previous holder must not still be signed in somewhere.
      expect(
        await prisma.db.refreshToken.count({
          where: { userId: created.body.id, revokedAt: null },
        }),
      ).toBe(0);
    });
  });

  describe('reminders', () => {
    it('creates, snoozes and acknowledges a reminder of your own', async () => {
      const { id } = await createCheque();

      const created = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/reminders`)
        .set(auth())
        .send({ remindAt: new Date(Date.now() + 3_600_000).toISOString(), note: 'اتصل بالعميل' })
        .expect(201);

      const feed = await request(app.getHttpServer())
        .get(`${API}/notifications`)
        .set(auth())
        .expect(200);

      const row = feed.body.data.find((entry: { id: string }) => entry.id === created.body.id);
      expect(row.custom).toBe(true);
      expect(row.note).toBe('اتصل بالعميل');
      expect(row.isDue).toBe(false);

      const snoozed = await request(app.getHttpServer())
        .post(`${API}/notifications/${created.body.id}/snooze`)
        .set(auth())
        .send({ minutes: 60 })
        .expect(200);
      expect(new Date(snoozed.body.remindAt).getTime()).toBeGreaterThan(
        new Date(row.remindAt).getTime(),
      );

      await request(app.getHttpServer())
        .post(`${API}/notifications/${created.body.id}/acknowledge`)
        .set(auth())
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`${API}/notifications`)
        .set(auth())
        .expect(200);
      expect(after.body.data.map((entry: { id: string }) => entry.id)).not.toContain(
        created.body.id,
      );
    });

    it('keeps a manual reminder when the cheque moves', async () => {
      const { id, version } = await createCheque();

      const created = await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/reminders`)
        .set(auth())
        .send({ remindAt: new Date(Date.now() + 7_200_000).toISOString() })
        .expect(201);

      // Moving a cheque rebuilds its automatic schedule. A reminder a person
      // set by hand must survive that.
      await request(app.getHttpServer())
        .post(`${API}/cheques/${id}/receive`)
        .set(auth())
        .send({
          fromContactId: fixtures.supplierId,
          toLocationId: fixtures.safeLocationId,
          version,
        })
        .expect(200);

      const survivor = await prisma.db.reminder.findUnique({ where: { id: created.body.id } });
      expect(survivor).not.toBeNull();
      expect(survivor?.custom).toBe(true);
    });
  });
});
