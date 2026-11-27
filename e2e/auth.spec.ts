import { test, expect } from '@playwright/test';
import { qaOwnerSignin, qaSkipReason, qaCredentialsConfigured, QA_FACILITY_NAME } from './helpers/qa';

// AUTHENTICATED SUITE: the centre-admin portal, reached through the same
// access-code gate a real facility owner walks. These tests run only when the
// QA facility's credentials are configured in the environment; without them
// they skip themselves and the public smoke suite still covers every push.

test.describe('centre admin portal', () => {
  test.skip(!qaCredentialsConfigured, qaSkipReason ?? '');

  test('owner signs in through the access-code gate and reaches the portal', async ({ page }) => {
    await qaOwnerSignin(page);

    // Signed in: the facility's own sign-in form is gone and the facility's
    // name is on screen somewhere (portal header or welcome).
    await expect(page.getByPlaceholder('e.g. name@yourfacility.com')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('body')).toContainText(QA_FACILITY_NAME);
  });
});
