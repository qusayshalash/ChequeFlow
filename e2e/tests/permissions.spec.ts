import { expect, test } from '@playwright/test';
import { API, apiLogin } from './helpers';

/**
 * Hiding a button is not a permission.
 *
 * Each of these calls the endpoint directly as a read-only role, which is what
 * an attacker would do. A test that only checked the sidebar would pass on a
 * system with no server-side authorization at all.
 */
test.describe('permissions are enforced by the server', () => {
  const forbidden: [string, string, 'get' | 'post'][] = [
    ['listing users', '/users', 'get'],
    ['reading the audit log', '/audit-logs', 'get'],
    ['exporting a backup', '/backup/export', 'get'],
    ['exporting cheques', '/cheques/export', 'get'],
  ];

  for (const [what, path, method] of forbidden) {
    test(`a viewer is refused ${what}`, async ({ request }) => {
      const { accessToken } = await apiLogin(request, 'viewer');
      const res = await request[method](`${API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
    });
  }

  test('a viewer cannot create a contact', async ({ request }) => {
    const { accessToken } = await apiLogin(request, 'viewer');
    const res = await request.post(`${API}/contacts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { type: 'CUSTOMER', name: 'QA_TEST_SHOULD_NOT_EXIST' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('a valid, legal cheque action is still refused without the permission', async ({ request }) => {
    const owner = await apiLogin(request, 'owner');
    const viewer = await apiLogin(request, 'viewer');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    // Read through a helper that checks the status first: a throttled or
    // refused setup request otherwise surfaces as "cannot read '0' of
    // undefined", which says nothing about what actually went wrong.
    const fetchJson = async (path: string) => {
      const res = await request.get(`${API}${path}`, { headers: auth(owner.accessToken) });
      expect(res.status(), `setup request ${path} failed`).toBe(200);
      return res.json();
    };

    const drafts = await fetchJson('/cheques?status=DRAFT&pageSize=1');
    const cheque = drafts.data[0];
    test.skip(!cheque, 'no draft cheque to act on');

    const locations = await fetchJson('/locations');
    const contacts = await fetchJson('/contacts?pageSize=1');

    const res = await request.post(`${API}/cheques/${cheque.id}/receive`, {
      headers: auth(viewer.accessToken),
      data: { toLocationId: locations[0]?.id, fromContactId: contacts.data[0]?.id },
      failOnStatusCode: false,
    });
    expect(res.status(), 'a complete, legal request must still fail on permission alone').toBe(403);

    const after = await (await request.get(`${API}/cheques/${cheque.id}`, { headers: auth(owner.accessToken) })).json();
    expect(after.status, 'the refused request must not have changed anything').toBe(cheque.status);
  });
});
