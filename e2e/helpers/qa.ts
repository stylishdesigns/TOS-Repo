import { expect, type Page } from '@playwright/test';

// QA FACILITY CREDENTIALS come from the environment, never from the repo.
// When they are absent the authenticated suites skip themselves, so the
// public smoke suite keeps running green on every push.
export const QA_ACCESS_CODE = process.env.E2E_QA_ACCESS_CODE || '';
export const QA_OWNER_EMAIL = process.env.E2E_QA_OWNER_EMAIL || '';
export const QA_OWNER_PASSWORD = process.env.E2E_QA_OWNER_PASSWORD || '';
export const QA_FACILITY_NAME = process.env.E2E_QA_FACILITY_NAME || 'Fo QA Facility';

export const qaCredentialsConfigured = Boolean(
  QA_ACCESS_CODE && QA_OWNER_EMAIL && QA_OWNER_PASSWORD,
);

export const qaSkipReason = qaCredentialsConfigured
  ? undefined
  : 'QA facility credentials are not configured (set E2E_QA_ACCESS_CODE, E2E_QA_OWNER_EMAIL and E2E_QA_OWNER_PASSWORD)';

// Sign the QA facility's owner in through the same flow a real facility owner
// walks: the landing Login button, the 6-digit access-code gate, then the
// facility's own email + password sign-in form. Nothing is written to any
// facility's data; this only establishes the signed-in session.
export async function qaOwnerSignin(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  const codeBoxes = page.locator('form').getByRole('textbox');
  await expect(codeBoxes).toHaveCount(6, { timeout: 30_000 });
  const digits = QA_ACCESS_CODE.split('');
  for (let i = 0; i < digits.length; i += 1) {
    await codeBoxes.nth(i).fill(digits[i]);
  }
  await page.getByRole('button', { name: 'Find my facility' }).click();

  // The gate binds the code to the facility before it opens the sign-in form.
  await expect(page.getByText('You are entering')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const emailBox = page.getByPlaceholder('e.g. name@yourfacility.com');
  await emailBox.waitFor({ state: 'visible', timeout: 30_000 });
  await emailBox.fill(QA_OWNER_EMAIL);
  await page.getByPlaceholder('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022').fill(QA_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}
