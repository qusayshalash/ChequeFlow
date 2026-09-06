import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:3333/api/v1';

/** Everything this suite creates carries this prefix, so it can be found and removed. */
export const QA = 'QA_TEST';

export function credentials(role: 'owner' | 'viewer') {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_PASSWORD is not set. The suite never carries a password in the repo; ' +
        'export the seeded development password before running it.',
    );
  }
  return { email: role === 'owner' ? (process.env.E2E_OWNER ?? 'admin') : (process.env.E2E_VIEWER ?? 'viewer'), password };
}

interface Session { accessToken: string; refreshToken: string }

/**
 * One sign-in per role for the whole run.
 *
 * Signing in inside every test is not free: the sign-in endpoint is rate
 * limited on purpose, and a suite that spends the budget on its own setup
 * starts failing on 429 rather than on anything it meant to test.
 */
const sessions = new Map<string, Promise<Session>>();

export function apiLogin(request: APIRequestContext, role: 'owner' | 'viewer' = 'owner'): Promise<Session> {
  const cached = sessions.get(role);
  if (cached) return cached;

  const fresh = (async () => {
    const res = await request.post(`${API}/auth/login`, { data: credentials(role) });
    expect(res.status(), signInFailure(res.status())).toBe(200);
    return (await res.json()) as Session;
  })();
  sessions.set(role, fresh);
  return fresh;
}

/**
 * A session outside the cache, for a spec that destroys the one it uses.
 *
 * Clearing the shared cache instead would make every later spec sign in
 * again, and `/auth/login` allows ten a minute — the suite would fail on 429
 * somewhere unrelated to whatever broke.
 */
export async function apiLoginDisposable(request: APIRequestContext, role: 'owner' | 'viewer' = 'owner'): Promise<Session> {
  const res = await request.post(`${API}/auth/login`, { data: credentials(role) });
  expect(res.status(), signInFailure(res.status())).toBe(200);
  return (await res.json()) as Session;
}

/**
 * Says which problem it is.
 *
 * A run against a stack on the default limit fails here with 429 partway
 * through, and "sign-in should succeed" sends the reader looking for a broken
 * login instead of at the stack's configuration.
 */
function signInFailure(status: number): string {
  return status === 429
    ? 'sign-in was rate limited. The suite signs in more than ten times a minute; ' +
      'start the API for testing with RATE_LIMIT_AUTH_PER_MINUTE=1000.'
    : 'sign-in should succeed';
}

/**
 * Puts a session in place without driving the sign-in form.
 *
 * Every test that is not *about* signing in starts here: it keeps those tests
 * from failing for a reason they are not testing, and it keeps the password
 * out of all but one spec.
 */
export async function signInThroughStorage(page: Page, role: 'owner' | 'viewer' = 'owner') {
  const tokens = await apiLogin(page.request, role);
  await page.goto('/login');
  await page.evaluate((session) => {
    window.localStorage.setItem('chequeflow.session', JSON.stringify(session));
  }, { ...tokens, expiresIn: 900, tokenType: 'Bearer' });
}
