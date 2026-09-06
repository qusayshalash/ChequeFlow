import { expect, test } from '@playwright/test';
import { API, apiLogin } from './helpers';

test.describe('input is validated on the server', () => {
  const number = () => String(94_000_000 + Math.floor(Math.random() * 5_000_000));
  const cheque = (over: Record<string, unknown>) => ({
    direction: 'INCOMING', chequeNumber: number(), amount: '100.00',
    currency: 'USD', dueDate: '2027-06-01', ...over,
  });

  test('money outside the stored precision is refused, never rounded in silence', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };
    for (const amount of ['-1.00', '0', '1.005', '99999999999999999999.99', 'one hundred']) {
      const res = await request.post(`${API}/cheques`, { headers: auth, data: cheque({ amount }), failOnStatusCode: false });
      expect(res.status(), `amount ${amount}`).toBe(422);
    }
  });

  test('a date that does not exist on the calendar is refused', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };
    // 31 February and 30 February are not dates. Accepting them and rolling
    // them into March moves a cheque's due date by days without telling anyone.
    for (const dueDate of ['2027-02-31', '2025-02-30', '2027-04-31']) {
      const res = await request.post(`${API}/cheques`, { headers: auth, data: cheque({ dueDate }), failOnStatusCode: false });
      expect(res.status(), `date ${dueDate} was accepted and stored as ${(await res.json())?.cheque?.dueDate}`).toBe(422);
    }
  });

  test('a real leap day is accepted', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const res = await request.post(`${API}/cheques`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: cheque({ dueDate: '2028-02-29' }),
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).cheque.dueDate).toBe('2028-02-29');
  });

  test('a currency code that is not a currency is refused', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const res = await request.post(`${API}/cheques`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: cheque({ currency: 'XYZ' }),
      failOnStatusCode: false,
    });
    // Totals are kept per currency and never summed across them, so an invented
    // code creates a bucket that can never be reconciled with anything.
    expect(res.status(), `XYZ was stored as ${(await res.json())?.cheque?.currency}`).toBe(422);
  });

  test('script and SQL payloads are stored as text and change nothing', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const payloads = ['<script>alert(1)</script>', "' OR 1=1 --", "'; DROP TABLE cheques; --"];
    const made: string[] = [];

    for (const payload of payloads) {
      const res = await request.post(`${API}/contacts`, {
        headers: auth, data: { type: 'CUSTOMER', name: `QA_TEST_INJECTION ${payload}` },
      });
      expect(res.status()).toBe(201);
      expect((await res.json()).name).toContain(payload);
      made.push((await res.json()).id);
    }

    const alive = await request.get(`${API}/cheques?pageSize=1`, { headers: auth });
    expect(alive.status(), 'the table is still there').toBe(200);

    for (const id of made) {
      await request.delete(`${API}/contacts/${id}`, { headers: auth, failOnStatusCode: false });
    }
  });

  test('a duplicate cheque number is reported rather than silently accepted', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const n = number();
    const first = await request.post(`${API}/cheques`, { headers: auth, data: cheque({ chequeNumber: n }) });
    expect(first.status()).toBe(201);
    const second = await request.post(`${API}/cheques`, { headers: auth, data: cheque({ chequeNumber: n }), failOnStatusCode: false });
    expect(second.status()).toBe(409);
  });

  test('a search box wildcard is text, not a wildcard', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const all = await (await request.get(`${API}/cheques?pageSize=1`, { headers: auth })).json();
    const wild = await (await request.get(`${API}/cheques?pageSize=1&search=%25`, { headers: auth })).json();
    // `%` is the SQL LIKE "match anything" character. Typed in a search box it
    // is just a character, and must not return the entire table.
    expect(wild.meta.total, 'searching for "%" returned everything').toBeLessThan(all.meta.total);
  });
});
