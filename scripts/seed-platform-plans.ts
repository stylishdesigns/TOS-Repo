/**
 * Seeds platformPlans and platformConfig with the starting values from the
 * product rules (shared with the first-sign-in bootstrap in
 * src/server/platformDefaults.ts). Create-if-missing: existing documents are
 * never overwritten, so values Tutorial OS staff have edited stay untouched.
 *
 * Usage (needs admin credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT_JSON set):
 *   npx tsx scripts/seed-platform-plans.ts
 */
import { adminDb } from '../src/server/firebaseAdmin';
import { ensurePlatformDefaultsSeeded } from '../src/server/platformDefaults';

async function main() {
  console.log('Seeding platformPlans and platformConfig/global...');
  const result = await ensurePlatformDefaultsSeeded(adminDb);
  if (result.createdPlans.length === 0) {
    console.log('= platformPlans: all starting plans already exist, left untouched.');
  } else {
    result.createdPlans.forEach((id) => console.log(`+ platformPlans/${id} created.`));
  }
  if (result.createdConfig) {
    console.log('+ platformConfig/global created.');
  } else {
    console.log('= platformConfig/global exists, left untouched.');
  }
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err: any) => {
    console.error('Seeding failed:', err?.message || err);
    process.exit(1);
  });
