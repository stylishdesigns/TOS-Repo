import { test, expect } from '@playwright/test';

// SMOKE SUITE: public surfaces only, no sign-ins, nothing written to any
// centre's data. Every critical workflow gains a test batch by batch.

test('landing renders with the platform name and the free-start CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Tutorial OS', { timeout: 30_000 });
  await expect(page.locator('body')).toContainText('Start for free');
});

test('facility app install page renders', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('body')).toContainText("Install your facility's app", { timeout: 30_000 });
  await expect(page.getByLabel('Facility access code')).toBeVisible();
});

test('facility app install page resolves an access code to its facility', async ({ page }) => {
  await page.goto('/app');
  await page.getByLabel('Facility access code').fill('123456');
  await page.getByRole('button', { name: 'Find my facility' }).click();
  // The lookup reloads the page, then paints the facility-branded install card.
  await expect(page.locator('body')).toContainText("Install Champion Tutorial's app", { timeout: 30_000 });
});

test('facility app context shows the access-code gate bound to the facility', async ({ page }) => {
  await page.goto('/?centre=excellencetutorialcentre');
  await expect(page.locator('body')).toContainText('Facility access code', { timeout: 30_000 });
});

test('facility landing page loads', async ({ page }) => {
  const res = await page.goto('/excellencetutorialcentre');
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toBeEmpty();
});
