import { expect, type Page } from '@playwright/test';

// QA FACILITY CREDENTIALS come from the environment, never from the repo.
// When they are absent the authenticated suites skip themselves, so the
// public smoke suite keeps running green on every push.
export const QA_ACCESS_CODE = process.env.E2E_QA_ACCESS_CODE || '';
export const QA_OWNER_EMAIL = process.env.E2E_QA_OWNER_EMAIL || '';
export const QA_OWNER_PASSWORD = process.env.E2E_QA_OWNER_PASSWORD || '';
export const QA_TUTOR_EMAIL = process.env.E2E_QA_TUTOR_EMAIL || '';
export const QA_TUTOR_PASSWORD = process.env.E2E_QA_TUTOR_PASSWORD || '';
export const QA_STUDENT_EMAIL = process.env.E2E_QA_STUDENT_EMAIL || '';
export const QA_STUDENT_PASSWORD = process.env.E2E_QA_STUDENT_PASSWORD || '';
export const QA_FACILITY_NAME = process.env.E2E_QA_FACILITY_NAME || 'Fo QA Facility';

export const qaCredentialsConfigured = Boolean(
  QA_ACCESS_CODE && QA_OWNER_EMAIL && QA_OWNER_PASSWORD && QA_TUTOR_EMAIL && QA_TUTOR_PASSWORD && QA_STUDENT_EMAIL && QA_STUDENT_PASSWORD,
);

export const qaSkipReason = qaCredentialsConfigured
  ? undefined
  : 'QA facility credentials are not configured (set E2E_QA_ACCESS_CODE plus the owner, tutor and student email/password pairs)';

// QA poses as the installed facility app. The platform runs app-only portals
// (the student and tutor portals open only inside the installed app, in
// standalone display mode), so a plain browser meets the install call-to-action
// instead of the portal. The sign-in suites test the portals, so they stand in
// for the installed app here rather than flipping the platform's own setting.
async function qaPoseAsInstalledApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      const real = original(query);
      if (query === '(display-mode: standalone)') {
        const fake = Object.create(real);
        Object.defineProperty(fake, 'matches', { get: () => true });
        return fake as MediaQueryList;
      }
      return real;
    }) as typeof window.matchMedia;
  });
}

// Sign a QA facility account in through the same flow every real user walks:
// the landing Login button, the 6-digit access-code gate, then the facility's
// own email + password sign-in form. Nothing is written to any facility's
// data; this only establishes the signed-in session for one account.
export async function qaPortalSignin(page: Page, email: string, password: string): Promise<void> {
  await qaPoseAsInstalledApp(page);
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
  await emailBox.fill(email);
  await page.getByPlaceholder('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

export function qaOwnerSignin(page: Page): Promise<void> {
  return qaPortalSignin(page, QA_OWNER_EMAIL, QA_OWNER_PASSWORD);
}
