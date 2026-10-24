import { Firestore } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from './firebaseAdmin';
import { reconcileFirstTenant } from './firstTenant';

/**
 * The starting platform values from the product rules. These are the single
 * source of truth for seeding: scripts/seed-platform-plans.ts and the
 * first-sign-in bootstrap (ensureBootstrapSuperAdmin) both use them. Every
 * write is create-if-missing: documents Tutorial OS staff have edited are
 * never overwritten.
 */
export const STARTING_PLANS = [
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

export const STARTING_CONFIG = {
  trialDays: 30,
  skipTrialDiscountPct: 15, // set by TOS staff; the discount for skipping the trial
  trialGraceDays: 7,
  seatSwapLimitPerStudent: 2,
  seatSwapWindowDays: 30,
  aiRouteRateLimitPerHour: 60,
};

export interface SeedResult {
  createdPlans: string[];
  createdConfig: boolean;
}

export async function ensurePlatformDefaultsSeeded(db: Firestore): Promise<SeedResult> {
  const createdPlans: string[] = [];

  for (const plan of STARTING_PLANS) {
    const ref = db.collection('platformPlans').doc(plan.id);
    const existing = await ref.get();
    if (!existing.exists) {
      await ref.set(plan);
      createdPlans.push(plan.id);
    }
  }

  const configRef = db.collection('platformConfig').doc('global');
  const existingConfig = await configRef.get();
  let createdConfig = false;
  if (!existingConfig.exists) {
    await configRef.set(STARTING_CONFIG);
    createdConfig = true;
  }

  return { createdPlans, createdConfig };
}

/** Emails temporarily allowed TOS access via the TOS_BOOTSTRAP_EMAILS env var. */
export function isBootstrapEmail(email: string | null | undefined): boolean {
  const bootstrap = (process.env.TOS_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const normalized = (email || '').toLowerCase();
  return bootstrap.length > 0 && !!normalized && bootstrap.includes(normalized);
}

/**
 * One-time bootstrap for the first TOS staff sign-in, so no terminal or script
 * is needed: a verified sign-in from an address in TOS_BOOTSTRAP_EMAILS seeds
 * the platform defaults create-if-missing and stamps the `tos` claim
 * permanently. The env var can then be cleared without locking the owner out.
 */
export async function ensureBootstrapSuperAdmin(
  uid: string,
  email: string | null | undefined
): Promise<boolean> {
  if (!isBootstrapEmail(email)) return false;
  try {
    const seeded = await ensurePlatformDefaultsSeeded(adminDb);
    const userRecord = await adminAuth.getUser(uid);
    const existingClaims = userRecord.customClaims || {};
    if (existingClaims.tos !== true) {
      await adminAuth.setCustomUserClaims(uid, { ...existingClaims, tos: true });
    }
    console.warn(
      `[TOS bootstrap] ${email}: platform defaults ensured ` +
        `(${seeded.createdPlans.length} plan(s) created${seeded.createdConfig ? ', platformConfig/global created' : ''}); ` +
        `tos claim granted permanently. TOS_BOOTSTRAP_EMAILS can now be cleared.`
    );
    // One-time first-tenant reconciliation (user-requested 2026-10-21):
    // provisions the first centre automatically. Runs after the platform
    // defaults so the centre_plus plan it bills against always exists.
    await reconcileFirstTenant();
    return true;
  } catch (err) {
    console.error('[TOS bootstrap] failed:', (err as any)?.message || err);
    return false;
  }
}
