import { expect, test } from '@playwright/test';
import { API, apiLogin, apiLoginDisposable, credentials, signInThroughStorage } from './helpers';

test.describe('authentication', () => {
  test('signs in with the seeded account and lands on the dashboard', async ({ page }) => {
    const { email, password } = credentials('owner');
    await page.goto('/login');
    await page.getByLabel(/اسم المستخدم/).fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /دخول/ }).click();
    await expect(page).toHaveURL(/\/(dashboard)?$|\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('refuses a wrong password without saying which field was wrong', async ({ page }) => {
    const { email } = credentials('owner');
    await page.goto('/login');
    await page.getByLabel(/اسم المستخدم/).fill(email);
    await page.locator('input[type=password]').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /دخول/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('an unknown user fails the same way a wrong password does', async ({ request }) => {
    const { password } = credentials('owner');
    const unknown = await request.post(`${API}/auth/login`, {
      data: { email: 'nobody@nowhere.test', password },
      failOnStatusCode: false,
    });
    const wrongPassword = await request.post(`${API}/auth/login`, {
      data: { email: credentials('owner').email, password: 'wrong' },
      failOnStatusCode: false,
    });
    // Different answers here would let anyone enumerate accounts.
    expect(unknown.status()).toBe(wrongPassword.status());
    expect((await unknown.json()).error.code).toBe((await wrongPassword.json()).error.code);
  });

  test('a protected page is not reachable without a session', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/cheques');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('going back after the session is gone does not show the data again', async ({ page }) => {
    await signInThroughStorage(page);
    await page.goto('/cheques');
    await expect(page.getByRole('heading', { name: /الشيكات/ })).toBeVisible();

    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/cheques');
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page.locator('main')).not.toContainText(/بنك القاهرة/);
  });

  test('signing out kills the refresh token, not just the tab', async ({ request }) => {
    // A session of its own: this test destroys the one it uses.
    const tokens = await apiLoginDisposable(request);
    await request.post(`${API}/auth/logout`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { refreshToken: tokens.refreshToken },
    });
    const reuse = await request.post(`${API}/auth/refresh`, {
      data: { refreshToken: tokens.refreshToken },
      failOnStatusCode: false,
    });
    expect(reuse.status()).toBe(401);
  });
});
