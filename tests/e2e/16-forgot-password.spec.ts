import { test, expect } from '@playwright/test';

test('Forgot password page loads', async ({ page }) => {
  await page.goto('/forgot-password');

  await expect(
    page.getByRole('button', { name: 'send reset link' })
  ).toBeVisible();
});
