import { expect, test } from '@playwright/test';
import { API, QA, apiLogin, signInThroughStorage } from './helpers';

/** Create -> read -> edit in a dialog -> reload -> delete, through the screens. */
test('a contact can be created, edited in the dialog, and deleted', async ({ page }) => {
  const name = `${QA}_CONTACT_${Date.now()}`;
  const renamed = `${name}_RENAMED`;
  await signInThroughStorage(page);

  await page.goto('/contacts/new');
  await page.getByLabel(/الاسم/).first().fill(name);
  await page.getByRole('button', { name: /حفظ|إضافة|إنشاء/ }).first().click();

  await page.goto('/contacts');
  await page.getByRole('searchbox').last().fill(name);
  await expect(page.getByText(name, { exact: false })).toBeVisible({ timeout: 15_000 });

  await page.getByText(name, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // ── the edit dialog ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: /^تعديل$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Escape must close it, and must not save anything on the way out.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('button', { name: /^تعديل$/ }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/الاسم/).first().fill(renamed);
  await dialog.getByRole('button', { name: /حفظ/ }).first().click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // The rename survives a full reload, not just a cache update.
  await page.reload();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 15_000 });

  // ── delete, and confirm it is really gone ────────────────────────────────
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /حذف/ }).first().click();
  await page.waitForTimeout(1500);

  const { accessToken } = await apiLogin(page.request);
  const auth = { Authorization: `Bearer ${accessToken}` };
  const left = await (await page.request.get(
    `${API}/contacts?search=${encodeURIComponent(renamed)}`, { headers: auth })).json();
  expect(left.meta?.total ?? 0, 'the contact is gone from the list').toBe(0);

  // Belt and braces: nothing named QA_TEST may survive this spec.
  for (const row of left.data ?? []) {
    await page.request.delete(`${API}/contacts/${row.id}`, { headers: auth, failOnStatusCode: false });
  }
});
