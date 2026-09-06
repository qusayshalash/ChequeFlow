import { expect, test } from '@playwright/test';
import { signInThroughStorage } from './helpers';

test.describe('the cheque list', () => {
  test.beforeEach(async ({ page }) => {
    await signInThroughStorage(page);
    await page.goto('/cheques');
    await expect(page.getByRole('heading', { name: /الشيكات/ })).toBeVisible();
  });

  test('filtering narrows the list and clearing restores it', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const before = await rows.count();

    await page.getByRole('searchbox').last().fill('zzzz_no_such_cheque_zzzz');
    await expect(rows).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('searchbox').last().fill('');
    await expect
      .poll(async () => rows.count(), { timeout: 15_000 })
      .toBe(before);
  });

  test('typing a word is one request, not one per keystroke', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (/\/cheques\?.*search=/.test(r.url())) calls.push(r.url());
    });

    await page.getByRole('searchbox').last().pressSequentially('صائب', { delay: 60 });
    await page.waitForTimeout(1500);

    // Four characters used to be four requests, which emptied the rate-limit
    // budget and made the next unrelated request fail.
    expect(calls.length, `requests: ${calls.length}`).toBeLessThanOrEqual(2);
  });

  test('paging forward shows different rows and the pager stays reachable', async ({ page }) => {
    const first = await page.locator('tbody tr').first().innerText();
    const next = page.getByRole('button', { name: /التالي/ });
    test.skip(await next.isDisabled(), 'only one page of data');

    await next.click();
    await expect.poll(async () => page.locator('tbody tr').first().innerText()).not.toBe(first);

    const pager = page.getByRole('navigation', { name: /صفحة/ });
    await expect(pager).toBeInViewport();
  });

  test('sorting by amount actually orders the rows', async ({ page }) => {
    await page.getByRole('button', { name: /المبلغ/ }).first().click();
    await page.waitForTimeout(1200);
    const amounts = await page.locator('tbody tr').allInnerTexts();
    const numbers = amounts
      .map((row) => row.match(/([\d,]+\.\d{2})/)?.[1]?.replace(/,/g, ''))
      .filter(Boolean)
      .map(Number);
    const sorted = [...numbers].sort((a, b) => a - b);
    const reverse = [...sorted].reverse();
    expect(
      numbers.join() === sorted.join() || numbers.join() === reverse.join(),
      `amounts were ${numbers.join(', ')}`,
    ).toBe(true);
  });

  test('a row is selectable by a target big enough to hit', async ({ page }) => {
    const box = page.locator('tbody tr input[type=checkbox]').first();
    test.skip((await box.count()) === 0, 'no rows');

    // The input itself is 16px, which is under the 24px WCAG 2.2 asks of a
    // pointer target and poor on a touch screen — and it is the only way into
    // the whole bulk workflow. The label around it is what you actually hit.
    const target = page.locator('tbody tr label').first();
    const size = await target.boundingBox();
    expect(size!.width, 'selection target is too narrow').toBeGreaterThanOrEqual(24);
    expect(size!.height, 'selection target is too short').toBeGreaterThanOrEqual(24);

    // And hitting its edge — not the box in the middle — still selects.
    await page.mouse.click(size!.x + 3, size!.y + 3);
    await expect(box).toBeChecked();
  });

  test('selecting rows opens the bulk bar inside the content column', async ({ page }) => {
    const boxes = page.locator('tbody tr input[type=checkbox]');
    test.skip((await boxes.count()) < 2, 'not enough rows');
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    const bar = page.locator('div.sticky.bottom-5');
    await expect(bar).toBeVisible();

    // It must not run underneath the sidebar, which is what `fixed` did.
    const sidebar = page.locator('aside');
    if (await sidebar.isVisible()) {
      const barBox = await bar.locator('> *').last().boundingBox();
      const sideBox = await sidebar.boundingBox();
      if (barBox && sideBox && sideBox.width > 0) {
        expect(barBox.x + barBox.width).toBeLessThanOrEqual(sideBox.x + 1);
      }
    }
  });
});
