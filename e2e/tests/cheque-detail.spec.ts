import { expect, test } from '@playwright/test';
import { API, apiLogin, signInThroughStorage } from './helpers';

test.describe('the cheque detail page', () => {
  test('the open tab survives a reload and can be linked to', async ({ page }) => {
    await signInThroughStorage(page);
    const { accessToken } = await apiLogin(page.request);
    const list = await (
      await page.request.get(`${API}/cheques?pageSize=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json();
    const cheque = list.data[0];
    test.skip(!cheque, 'no cheque to open');

    await page.goto(`/cheques/${cheque.id}`);
    await page.getByRole('tab', { name: /خط الحركة/ }).click();
    await expect(page).toHaveURL(/tab=timeline/);

    // It was component state, so a reload dropped you back on the overview and
    // a link could never point at the ledger — the tab worth sending someone.
    await page.reload();
    await expect(page.getByRole('tab', { name: /خط الحركة/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // …and the same link, opened cold.
    await page.goto(`/cheques/${cheque.id}?tab=attachments`);
    await expect(page.getByRole('tab', { name: /المرفقات/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a cheque that does not exist offers a way out, not a retry', async ({ page }) => {
    await signInThroughStorage(page);
    await page.goto('/cheques/11111111-1111-4111-8111-111111111111');

    await expect(page.getByRole('alert')).toBeVisible();
    // Retrying cannot make a missing cheque appear, so the button is not there.
    await expect(page.getByRole('button', { name: /إعادة المحاولة/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /العودة إلى قائمة الشيكات/ })).toBeVisible();
  });
});
