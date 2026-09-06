import { expect, test } from '@playwright/test';
import { API, QA, apiLogin, signInThroughStorage } from './helpers';

/**
 * What a dialog owes the keyboard.
 *
 * All three side panels said `aria-modal="true"` and none of them behaved like
 * one: Escape did nothing, Tab walked out into the page behind, and closing
 * dropped focus. They share one component now, so these run against the
 * contact editor and hold for the other two.
 */
test.describe('the edit dialog', () => {
  let contactId: string;

  test.beforeEach(async ({ page }) => {
    await signInThroughStorage(page);
    const { accessToken } = await apiLogin(page.request);
    const made = await page.request.post(`${API}/contacts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { type: 'CUSTOMER', name: `${QA}_DIALOG_${Date.now()}` },
    });
    contactId = (await made.json()).id;
    await page.goto(`/contacts/${contactId}`);
  });

  test.afterEach(async ({ request }) => {
    const { accessToken } = await apiLogin(request);
    await request.delete(`${API}/contacts/${contactId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
  });

  test('Escape closes it', async ({ page }) => {
    await page.getByRole('button', { name: /^تعديل$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('a click on the backdrop closes it', async ({ page }) => {
    await page.getByRole('button', { name: /^تعديل$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Somewhere the panel is not. The layout is right-to-left, so `end-0`
    // puts the panel on the *left* — the free backdrop is on the right.
    const box = await page.getByRole('dialog').boundingBox();
    const viewport = page.viewportSize();
    await page.mouse.click((box!.x + box!.width + viewport!.width) / 2, 200);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('focus moves into the panel and Tab stays inside it', async ({ page }) => {
    await page.getByRole('button', { name: /^تعديل$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null))
      .toBe(true);

    // Walk further than the panel has stops. Without a trap, focus is out in
    // the page behind by now; with one, it has wrapped round.
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(
      () => document.activeElement?.closest('[role=dialog]') !== null,
    );
    expect(stillInside, 'Tab escaped the dialog').toBe(true);
  });

  test('closing returns focus to the control that opened it', async ({ page }) => {
    const opener = page.getByRole('button', { name: /^تعديل$/ }).first();
    await opener.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Otherwise the reader is dropped at the top of the document and has to
    // find their place again.
    await expect(opener).toBeFocused();
  });

  test('the page behind does not scroll while it is open', async ({ page }) => {
    const before = await page.evaluate(() => getComputedStyle(document.body).overflow);
    await page.getByRole('button', { name: /^تعديل$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe(before);
  });
});
