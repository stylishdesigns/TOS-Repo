import { adminDb } from '../src/server/firebaseAdmin';
import { PlatformPlan, PlatformConfigGlobal } from '../src/types';

const SEED_PLANS: PlatformPlan[] = [
  {
    id: 'independent',
    name: 'Independent Tutor',
    accountType: 'independent',
    price: 5000,
    priceType: 'flat',
    seatCap: 10,
    trialSeatCap: 3,
    trialDays: 30,
    studentChat: false,
    whatsappNotifications: true,
    aiEssayMarking: true,
    aiQuestionGen: true,
    aiPerformanceAnalysis: true,
  },
  {
    id: 'centre_standard',
    name: 'Centre Standard',
    accountType: 'centre',
    price: 3000,
    priceType: 'per_seat',
    seatCap: 100, // minimum billed 10
    trialSeatCap: 10,
    trialDays: 30,
    studentChat: true,
    whatsappNotifications: false,
    aiEssayMarking: true,
    aiQuestionGen: false,
    aiPerformanceAnalysis: false,
  },
  {
    id: 'centre_plus',
    name: 'Centre Plus',
    accountType: 'centre',
    price: 5000,
    priceType: 'per_seat',
    seatCap: 100, // minimum billed 10
    trialSeatCap: 10, // trial runs on centre_standard
    trialDays: 30,
    studentChat: true,
    whatsappNotifications: true,
    aiEssayMarking: true,
    aiQuestionGen: true,
    aiPerformanceAnalysis: true,
  },
];

const SEED_CONFIG: PlatformConfigGlobal = {
  trialDays: 30,
  skipTrialDiscountPct: 15,
  trialGraceDays: 7,
};

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== Tutorial OS Platform Plans & Config Seeder ===`);
  console.log(`Mode: ${isApply ? 'APPLY (Writing to Firestore)' : 'DRY RUN (Use --apply to write)'}\n`);

  console.log(`Plans to seed: ${SEED_PLANS.length}`);
  for (const plan of SEED_PLANS) {
    console.log(`  - [${plan.id}] ${plan.name}: ₦${plan.price.toLocaleString()} (${plan.priceType}), Cap: ${plan.seatCap}, Trial: ${plan.trialSeatCap} seats / ${plan.trialDays}d`);
    if (isApply) {
      await adminDb.collection('platformPlans').doc(plan.id).set(plan, { merge: true });
      console.log(`    -> Written to platformPlans/${plan.id}`);
    }
  }

  console.log(`\nGlobal Config:`);
  console.log(`  - trialDays: ${SEED_CONFIG.trialDays}`);
  console.log(`  - skipTrialDiscountPct: ${SEED_CONFIG.skipTrialDiscountPct}%`);
  console.log(`  - trialGraceDays: ${SEED_CONFIG.trialGraceDays}`);
  if (isApply) {
    await adminDb.collection('platformConfig').doc('global').set(SEED_CONFIG, { merge: true });
    console.log(`    -> Written to platformConfig/global`);
  }

  console.log(`\nDone! Status: ${isApply ? 'SUCCESS (All records applied)' : 'DRY RUN COMPLETED'}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
