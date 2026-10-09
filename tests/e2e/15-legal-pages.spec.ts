import { test, expect } from '@playwright/test';

test('the terms of service page loads', async ({ page }) => {
  await page.goto('/legal/terms');

  await expect(
    page.getByRole('heading', { name: 'Terms of Service', level: 1 })
  ).toBeVisible();
});
