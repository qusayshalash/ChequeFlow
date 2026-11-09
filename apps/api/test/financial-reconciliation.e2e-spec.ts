/**
 * Every figure the system shows, checked against the database directly.
 *
 * Built after a run of financial faults that each came from one write path or
 * one screen disagreeing with the rest: converted amounts left at a 1.00
 * placeholder, a rate kept across a currency change, a source erased by a
 * bulk receive, a supplier owing us for a cheque we endorsed to them. This
 * drives a mixed book through the real endpoints, then recomputes each total
 * in SQL from the rows themselves and holds the API to it, and checks the
 * invariants that must hold for every row whatever path wrote it.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { OUTSTANDING_CHEQUE_STATUSES } from '@cheque-flow/shared-types';

import { API, createTestApp, describeWithDb } from './test-app';
import { cleanupFixtures, seedFixtures, type Fixtures } from './seed-fixtures';
import type { PrismaService } from '../src/prisma/prisma.service';

type Summary = {
  currencies: Array<
    Record<
      | 'draft'
      | 'dueWithin7Days'
      | 'overdue'
      | 'deposited'
      | 'cleared'
      | 'bounced'
      | 'incoming'
      | 'outgoing',
      { count: number; total: string }
    > & {
      currency: string;
    }
  >;
};

describeWithDb('financial reconciliation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const tag = Date.now().toString().slice(-6);
  let n = 0;

  const day = (offset: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const post = async (path: string, body: object, expected = 200) =>
    (
      await request(app.getHttpServer())
        .post(`${API}${path}`)
        .set(auth())
        .send(body)
        .expect(expected)
    ).body as { version: number; cheque?: { id: string; version: number } };

  /** A cheque entered and, unless told otherwise, received. */
  const cheque = async (
    direction: 'INCOMING' | 'OUTGOING',
    amount: string,
    currency: string,
    due: number,
    options: { source?: string; receive?: boolean; rate?: string } = {},
  ) => {
    const created = (
      await post(
        '/cheques',
        {
          direction,
          chequeNumber: `RC-${tag}-${(n += 1)}`,
          amount,
          currency,
          dueDate: day(due),
          originalSourceId: options.source ?? fixtures.customerId,
          ...(options.rate ? { exchangeRate: options.rate } : {}),
        },
        201,
      )
    ).cheque!;
    if (options.receive === false) return created;
    const received = await post(`/cheques/${created.id}/receive`, {
      toLocationId: fixtures.safeLocationId,
      version: created.version,
    });
    return { id: created.id, version: received.version };
  };

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

    // A book with something in every bucket, in two currencies.
    await cheque('INCOMING', '1250.50', 'USD', 3);
    await cheque('INCOMING', '980.25', 'USD', -10); // overdue
    await cheque('INCOMING', '4000.00', 'USD', 20, { receive: false }); // draft
    await cheque('INCOMING', '7500.00', 'ILS', 5, { rate: '0.27' });
    await cheque('OUTGOING', '600.00', 'USD', 15, { source: fixtures.supplierId });

    const toDeposit = await cheque('INCOMING', '2222.22', 'USD', 1);
    await post(`/cheques/${toDeposit.id}/deposit`, {
      toLocationId: fixtures.bankLocationId,
      version: toDeposit.version,
    });

    const toClear = await cheque('INCOMING', '333.33', 'USD', 2);
    const deposited = await post(`/cheques/${toClear.id}/deposit`, {
      toLocationId: fixtures.bankLocationId,
      version: toClear.version,
    });
    await post(`/cheques/${toClear.id}/clear`, { version: deposited.version });

    const toBounce = await cheque('INCOMING', '444.44', 'USD', 2);
    const sent = await post(`/cheques/${toBounce.id}/deposit`, {
      toLocationId: fixtures.bankLocationId,
      version: toBounce.version,
    });
    await post(`/cheques/${toBounce.id}/bounce`, {
      reason: 'insufficient funds',
      fee: '15.5',
      version: sent.version,
    });

    // Endorsed to the supplier: outstanding, owed by the customer, a payment to the supplier.
    const toEndorse = await cheque('INCOMING', '1500.00', 'USD', 25);
    await post(`/cheques/${toEndorse.id}/handover`, {
      toContactId: fixtures.supplierId,
      version: toEndorse.version,
    });

    const toPostpone = await cheque('INCOMING', '800.00', 'USD', 4);
    await post(`/cheques/${toPostpone.id}/postpone`, {
      newDueDate: day(40),
      reason: 'customer asked',
      version: toPostpone.version,
    });

    // Bulk receive with no contact chosen must keep each source.
    const bulkA = await cheque('INCOMING', '100.00', 'USD', 30, { receive: false });
    const bulkB = await cheque('INCOMING', '200.00', 'USD', 30, { receive: false });
    await post('/cheques/bulk-action', {
      chequeIds: [bulkA.id, bulkB.id],
      action: 'RECEIVE',
      toLocationId: fixtures.safeLocationId,
    });

    // A cheque whose amount and currency are edited after entry.
    const edited = await cheque('INCOMING', '50.00', 'USD', 9);
    const changed = (
      await request(app.getHttpServer())
        .patch(`${API}/cheques/${edited.id}`)
        .set(auth())
        .send({ amount: '75.5', version: edited.version })
        .expect(200)
    ).body as { version: number };
    await request(app.getHttpServer())
      .patch(`${API}/cheques/${edited.id}`)
      .set(auth())
      .send({ currency: 'ILS', version: changed.version })
      .expect(200);
  });

  afterAll(async () => {
    if (fixtures) await cleanupFixtures(prisma, fixtures.organizationId);
    if (app) await app.close();
  });

  const org = () => fixtures.organizationId;

  it('reports the same per-currency buckets the rows add up to', async () => {
    const summary = (
      await request(app.getHttpServer()).get(`${API}/dashboard`).set(auth()).expect(200)
    ).body as Summary;

    const expected = await prisma.db.$queryRaw<
      { currency: string; bucket: string; count: bigint; total: string }[]
    >`
      WITH tz AS (SELECT (now() AT TIME ZONE o.timezone)::date AS today FROM organizations o WHERE o.id = ${org()}::uuid),
      rows AS (
        SELECT c.*, tz.today FROM cheques c, tz
        WHERE c.organization_id = ${org()}::uuid AND c.deleted_at IS NULL
      ),
      buckets AS (
        SELECT currency, 'draft' AS bucket, amount FROM rows WHERE status IN ('DRAFT','PENDING_REVIEW')
        UNION ALL SELECT currency, 'deposited', amount FROM rows WHERE status = 'DEPOSITED'
        UNION ALL SELECT currency, 'cleared', amount FROM rows WHERE status = 'CLEARED'
        UNION ALL SELECT currency, 'bounced', amount FROM rows WHERE status = 'BOUNCED'
        UNION ALL SELECT currency, 'overdue', amount FROM rows
          WHERE status::text = ANY(${[...OUTSTANDING_CHEQUE_STATUSES]}) AND due_date < today
        UNION ALL SELECT currency, 'dueWithin7Days', amount FROM rows
          WHERE status::text = ANY(${[...OUTSTANDING_CHEQUE_STATUSES]})
            AND due_date >= today AND due_date <= today + 7
        UNION ALL SELECT currency, 'incoming', amount FROM rows
          WHERE status::text = ANY(${[...OUTSTANDING_CHEQUE_STATUSES]}) AND direction = 'INCOMING'
        UNION ALL SELECT currency, 'outgoing', amount FROM rows
          WHERE status::text = ANY(${[...OUTSTANDING_CHEQUE_STATUSES]}) AND direction = 'OUTGOING'
      )
      SELECT currency, bucket, COUNT(*)::bigint AS count, SUM(amount)::text AS total
      FROM buckets GROUP BY currency, bucket
    `;

    expect(expected.length).toBeGreaterThan(8);
    for (const row of expected) {
      const block = summary.currencies.find((entry) => entry.currency === row.currency);
      const bucket = block?.[row.bucket as keyof Summary['currencies'][number]] as
        { count: number; total: string } | undefined;
      expect({
        currency: row.currency,
        bucket: row.bucket,
        count: bucket?.count,
        total: bucket?.total,
      }).toEqual({
        currency: row.currency,
        bucket: row.bucket,
        count: Number(row.count),
        total: row.total,
      });
    }
  });

  it('keeps every converted amount derived from its own amount, currency and rate', async () => {
    const broken = await prisma.db.$queryRaw<{ cheque_number: string }[]>`
      SELECT c.cheque_number FROM cheques c JOIN organizations o ON o.id = c.organization_id
      WHERE c.organization_id = ${org()}::uuid AND NOT (
        (c.currency = o.base_currency AND c.exchange_rate = 1 AND c.amount_base = c.amount)
        OR (c.currency <> o.base_currency AND c.exchange_rate IS NULL AND c.amount_base IS NULL)
        OR (c.currency <> o.base_currency AND c.exchange_rate <> 1
            AND c.amount_base = ROUND(c.amount * c.exchange_rate, 2))
      )
    `;
    expect(broken).toEqual([]);
  });

  it('keeps the source of every received cheque', async () => {
    const lost = await prisma.db.$queryRaw<{ cheque_number: string }[]>`
      SELECT cheque_number FROM cheques
      WHERE organization_id = ${org()}::uuid AND original_source_id IS NULL
    `;
    expect(lost).toEqual([]);
  });

  it("ends every cheque's ledger at the status the cheque holds", async () => {
    const drift = await prisma.db.$queryRaw<
      { cheque_number: string; status: string; last: string | null }[]
    >`
      SELECT c.cheque_number, c.status::text AS status,
             (SELECT e.to_status::text FROM cheque_events e
               WHERE e.cheque_id = c.id AND e.to_status IS NOT NULL
               ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last
      FROM cheques c WHERE c.organization_id = ${org()}::uuid
    `;
    expect(drift.filter((row) => row.last !== row.status)).toEqual([]);
  });

  it('gives every contact the balance its part in each cheque implies, on both screens', async () => {
    const expected = await prisma.db.$queryRaw<
      { contact_id: string; currency: string; net: string }[]
    >`
      SELECT party.contact_id::text, c.currency,
             SUM(CASE WHEN party.is_source AND c.direction = 'INCOMING' THEN c.amount ELSE -c.amount END)::text AS net
      FROM cheques c
      CROSS JOIN LATERAL (
        SELECT c.original_source_id AS contact_id, true AS is_source
        UNION ALL
        SELECT c.current_recipient_id, false
        WHERE c.current_recipient_id IS DISTINCT FROM c.original_source_id
      ) party
      WHERE c.organization_id = ${org()}::uuid AND c.deleted_at IS NULL
        AND party.contact_id IS NOT NULL
        AND c.status::text = ANY(${[...OUTSTANDING_CHEQUE_STATUSES]})
      GROUP BY party.contact_id, c.currency
    `;
    expect(expected.length).toBeGreaterThan(1);

    const list = (
      await request(app.getHttpServer())
        .get(`${API}/contacts`)
        .query({ pageSize: 100 })
        .set(auth())
        .expect(200)
    ).body.data as { id: string; balances: { currency: string; net: string }[] }[];

    for (const row of expected) {
      const statement = (
        await request(app.getHttpServer())
          .get(`${API}/contacts/${row.contact_id}/statement`)
          .set(auth())
          .expect(200)
      ).body.currencies as { currency: string; net: string }[];
      const fromStatement = statement.find((entry) => entry.currency === row.currency)?.net;
      const fromList = list
        .find((entry) => entry.id === row.contact_id)
        ?.balances.find((entry) => entry.currency === row.currency)?.net;
      expect({
        contact: row.contact_id,
        currency: row.currency,
        statement: fromStatement,
        list: fromList,
      }).toEqual({
        contact: row.contact_id,
        currency: row.currency,
        statement: row.net,
        list: row.net,
      });
    }
  });

  it('records a bounce fee exactly as entered', async () => {
    const fees = await prisma.db.$queryRaw<{ fee: string }[]>`
      SELECT bounce_fee::text AS fee FROM cheques
      WHERE organization_id = ${org()}::uuid AND status = 'BOUNCED'
    `;
    expect(fees).toEqual([{ fee: '15.50' }]);
  });
});
