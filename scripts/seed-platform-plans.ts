/**
 * Seeds platformPlans and platformConfig with the starting values from the
 * product rules. Create-if-missing: existing documents are never overwritten,
 * so values Tutorial OS staff have edited in the console stay untouched.
 *
 * Usage (needs admin credentials, e.g. GOOGLE_APPLICATION_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT_JSON set):
 *   npx tsx scripts/seed-platform-plans.ts
 */
import { adminDb } from '../src/server/firebaseAdmin';

const STARTING_PLANS = [
  {
    id: 'centre_standard',
    name: 'Centre Standard',
    price: 3000, // ₦ per student per month
    priceType: 'per_seat',
    seatCap: 100,
    trialSeatCap: 10,
    trialDays: 30,
    studentChat: true,
    whatsappNotifications: false,
    aiEssayMarking: true, // internal only, never shown to customers
    aiQuestionGen: false,
    aiPerformanceAnalysis: false,
  },
  {
    id: 'centre_plus',
    name: 'Centre Plus',
    price: 5000, // ₦ per student per month
    priceType: 'per_seat',
    seatCap: 100,
    trialSeatCap: 10,
    trialDays: 30,
    studentChat: true,
    whatsappNotifications: true,
    aiEssayMarking: true, // internal only, never shown to customers
    aiQuestionGen: true,
    aiPerformanceAnalysis: true,
  },
];

const STARTING_CONFIG = {
  trialDays: 30,
  skipTrialDiscountPct: 15, // set by TOS staff; the discount for skipping the trial
  trialGraceDays: 7,
  seatSwapLimitPerStudent: 2,
  seatSwapWindowDays: 30,
  aiRouteRateLimitPerHour: 60,
};

async function main() {
  const db = adminDb; // already bound to the named database in firebaseAdmin.ts
  console.log('Seeding platformPlans and platformConfig/global...');

  for (const plan of STARTING_PLANS) {
    const ref = db.collection('platformPlans').doc(plan.id);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`= platformPlans/${plan.id} exists, left untouched.`);
    } else {
      await ref.set(plan);
      console.log(`+ platformPlans/${plan.id} created.`);
    }
  }

  const configRef = db.collection('platformConfig').doc('global');
  const existingConfig = await configRef.get();
  if (existingConfig.exists) {
    console.log('= platformConfig/global exists, left untouched.');
  } else {
    await configRef.set(STARTING_CONFIG);
    console.log('+ platformConfig/global created.');
  }

  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err?.message || err);
    process.exit(1);
  });
