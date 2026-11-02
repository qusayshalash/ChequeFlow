/**
 * The organization's time zone, used.
 *
 * `organizations.timezone` was set when an organization was created and read
 * by nothing: every "today" was the UTC day and every reminder was scheduled
 * for 08:00 UTC. These cases check that the zone now travels with the session
 * and decides when a reminder is delivered.
 *
 * The fixture organization is in `Asia/Riyadh` — UTC+3 with no daylight
 * saving, so every expected instant here holds on any day of the year.
 *
 * Requires a migrated PostgreSQL database in TEST_DATABASE_URL.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import type { PrismaService } from '../src/prisma/prisma.service';

describeWithDb('the organization time zone (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token: string;

  const me = () =>
    request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    fixtures = await seedFixtures(prisma);
    token = (
      await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: fixtures.ownerEmail, password: fixtures.password })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  it('travels with the session, so every screen knows what today is', async () => {
    expect((await me()).body.timeZone).toBe('Asia/Riyadh');
  });

  it('falls back to UTC when the stored zone is not one the runtime knows', async () => {
    // Wrong in a way the setting explains, rather than every date silently off.
    await prisma.db.organization.update({
      where: { id: fixtures.organizationId },
      data: { timezone: 'Mars/Olympus' },
    });
    try {
      expect((await me()).body.timeZone).toBe('UTC');
    } finally {
      await prisma.db.organization.update({
        where: { id: fixtures.organizationId },
        data: { timezone: 'Asia/Riyadh' },
      });
    }
  });

  it('schedules reminders for eight in the morning there, not in Greenwich', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API}/cheques`)
      .set({ Authorization: `Bearer ${token}` })
      .send({
        direction: 'INCOMING',
        chequeNumber: 'TZ-0001',
        amount: '250.00',
        currency: 'USD',
        dueDate: '2027-03-15',
        bankId: fixtures.bankId,
      })
      .expect(201);
    const chequeId: string = created.body.cheque.id;

    await app.get(RemindersService).syncForCheque(chequeId);

    const onDue = await prisma.db.reminder.findFirst({
      where: { chequeId, type: 'ON_DUE' },
    });
    // 08:00 in Riyadh is 05:00 UTC. The old schedule said 08:00 UTC — eleven
    // o'clock locally.
    expect(onDue?.remindAt.toISOString()).toBe('2027-03-15T05:00:00.000Z');

    const all = await prisma.db.reminder.findMany({ where: { chequeId } });
    expect(all.length).toBeGreaterThan(1);
    for (const reminder of all) {
      expect(reminder.remindAt.getUTCHours()).toBe(5);
    }
  });
});
