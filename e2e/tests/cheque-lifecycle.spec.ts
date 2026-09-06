import { expect, test } from '@playwright/test';
import { API, apiLogin } from './helpers';

/**
 * The business rule the whole product exists for: a cheque moves through
 * states in one direction, one writer at a time, and the ledger records it.
 */
test.describe('cheque lifecycle', () => {
  const number = () => String(93_000_000 + Math.floor(Math.random() * 6_000_000));

  test('a cheque is created, received, and its history is written', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await request.post(`${API}/cheques`, {
      headers: auth,
      data: { direction: 'INCOMING', chequeNumber: number(), amount: '123.45',
        currency: 'USD', dueDate: '2027-07-07', notes: 'QA_TEST lifecycle' },
    });
    expect(created.status()).toBe(201);
    const cheque = (await created.json()).cheque;

    // An illegal jump must be refused rather than quietly applied.
    const illegal = await request.post(`${API}/cheques/${cheque.id}/clear`, {
      headers: auth, data: {}, failOnStatusCode: false,
    });
    expect(illegal.status()).toBe(409);

    const locations = await (await request.get(`${API}/locations`, { headers: auth })).json();
    const contacts = await (await request.get(`${API}/contacts?pageSize=1`, { headers: auth })).json();
    const received = await request.post(`${API}/cheques/${cheque.id}/receive`, {
      headers: auth,
      data: { toLocationId: locations[0]?.id, fromContactId: contacts.data[0]?.id },
    });
    expect(received.status()).toBe(200);
    expect((await received.json()).status).toBe('IN_HAND');

    const events = await (await request.get(`${API}/cheques/${cheque.id}/events`, { headers: auth })).json();
    const rows = Array.isArray(events) ? events : events.data;
    expect(rows.length, 'the movement ledger records the transition').toBeGreaterThan(1);
  });

  test('a stale write is refused instead of overwriting a newer one', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await request.post(`${API}/cheques`, {
      headers: auth,
      data: { direction: 'INCOMING', chequeNumber: number(), amount: '10.00',
        currency: 'USD', dueDate: '2027-07-07' },
    });
    const cheque = (await created.json()).cheque;

    await request.patch(`${API}/cheques/${cheque.id}`, {
      headers: auth, data: { notes: 'QA_TEST first', version: cheque.version },
    });
    const stale = await request.patch(`${API}/cheques/${cheque.id}`, {
      headers: auth, data: { notes: 'QA_TEST second' , version: cheque.version },
      failOnStatusCode: false,
    });
    expect(stale.status()).toBe(409);
  });

  test('the same transition fired twice at once applies exactly once', async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await request.post(`${API}/cheques`, {
      headers: auth,
      data: { direction: 'INCOMING', chequeNumber: number(), amount: '20.00',
        currency: 'USD', dueDate: '2027-07-07' },
    });
    const cheque = (await created.json()).cheque;
    const locations = await (await request.get(`${API}/locations`, { headers: auth })).json();
    const contacts = await (await request.get(`${API}/contacts?pageSize=1`, { headers: auth })).json();
    const body = { toLocationId: locations[0]?.id, fromContactId: contacts.data[0]?.id };

    const [a, b] = await Promise.all([
      request.post(`${API}/cheques/${cheque.id}/receive`, { headers: auth, data: body, failOnStatusCode: false }),
      request.post(`${API}/cheques/${cheque.id}/receive`, { headers: auth, data: body, failOnStatusCode: false }),
    ]);
    const applied = [a.status(), b.status()].filter((s) => s === 200).length;
    expect(applied, `statuses ${a.status()} and ${b.status()}`).toBe(1);
  });
});
