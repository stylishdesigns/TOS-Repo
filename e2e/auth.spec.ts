import { test, expect } from '@playwright/test';
import {
  qaPortalSignin,
  qaOwnerSignin,
  qaSkipReason,
  qaCredentialsConfigured,
  QA_OWNER_EMAIL,
  QA_OWNER_PASSWORD,
  QA_TUTOR_EMAIL,
  QA_TUTOR_PASSWORD,
  QA_STUDENT_EMAIL,
  QA_STUDENT_PASSWORD,
  QA_FACILITY_NAME,
} from './helpers/qa';

// AUTHENTICATED SUITE: every QA facility role reaches its portal through the
// same access-code gate a real user walks. These tests run only when the QA
// facility's credentials are configured in the environment; without them they
// skip themselves and the public smoke suite still covers every push.

test.describe('qa facility sign-in', () => {
  test.skip(!qaCredentialsConfigured, qaSkipReason ?? '');

  test('owner signs in through the access-code gate and reaches the portal', async ({ page }) => {
    await qaOwnerSignin(page);

    // Signed in: the facility's own sign-in form is gone and the facility's
    // name is on screen somewhere (portal header or welcome).
    await expect(page.getByPlaceholder('e.g. name@yourfacility.com')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('body')).toContainText(QA_FACILITY_NAME);
  });

  test('tutor signs in through the access-code gate and reaches the portal', async ({ page }) => {
    await qaPortalSignin(page, QA_TUTOR_EMAIL, QA_TUTOR_PASSWORD);

    await expect(page.getByPlaceholder('e.g. name@yourfacility.com')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('body')).toContainText(QA_FACILITY_NAME);
  });

  test('student signs in through the access-code gate and reaches the portal', async ({ page }) => {
    await qaPortalSignin(page, QA_STUDENT_EMAIL, QA_STUDENT_PASSWORD);

    await expect(page.getByPlaceholder('e.g. name@yourfacility.com')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('body')).toContainText(QA_FACILITY_NAME);
  });
});
