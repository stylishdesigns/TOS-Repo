import { adminDb, adminAuth } from './firebaseAdmin';
import {
  Centre,
  CentreBilling,
  CentreMembership,
  PlatformPlan,
  PlatformConfigGlobal,
  CentreEntitlements,
  CentreSeatsSummary,
  MembershipRole,
  MembershipStatus,
} from '../types';

// ============================================================================
// SHARED HELPERS
// ============================================================================

const UNIFORM_MISMATCH_ERROR = 'That code did not match. Check it and try again.';

/** Verify the identity of a caller: real authentication only. */
export interface Caller {
  uid: string;
  email: string;
  /** True when the verified token carries the `tos` custom claim (or the
   *  temporary TOS_BOOTSTRAP_EMAILS grant, see isTosUser). */
  tos: boolean;
  /** The verified decoded ID token. */
  claims: { m?: Record<string, string>; tos?: boolean; email_verified?: boolean };
}

export function httpError(status: number, message: string): Error {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

/** Firestore failures are logged with context and surfaced as a generic 500.
 *  The server never invents data to cover for a failed read or write. */
function dbFailure(context: string, err: any): never {
  console.error(`[tenantService] Firestore failure in ${context}:`, err?.message || err);
  throw httpError(500, 'A server error occurred. Please try again.');
}

// ============================================================================
// TOS STAFF (Step 2): the `tos` claim, granted only by scripts/grant-tos.ts.
// TOS_BOOTSTRAP_EMAILS is a temporary, logged fallback for the first sign-in.
// ============================================================================

export function isTosUser(decoded: {
  tos?: boolean;
  email?: string | null;
  email_verified?: boolean;
}): boolean {
  if (decoded.tos === true) return true;
  const bootstrap = (process.env.TOS_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = (decoded.email || '').toLowerCase();
  if (
    bootstrap.length > 0 &&
    email &&
    decoded.email_verified === true &&
    bootstrap.includes(email)
  ) {
    console.warn(
      `[TOS bootstrap] TOS access granted to ${email} via TOS_BOOTSTRAP_EMAILS. ` +
        `Run scripts/grant-tos.ts for this email, confirm it works, then clear the env var.`
    );
    return true;
  }
  return false;
}

// ============================================================================
// PLATFORM PLANS AND CONFIG (Step 4): all numbers live in Firestore.
// ============================================================================

export async function getPlatformConfig(): Promise<PlatformConfigGlobal> {
  try {
    const doc = await adminDb.collection('platformConfig').doc('global').get();
    if (!doc.exists) {
      console.error('[tenantService] platformConfig/global is missing. Run scripts/seed-platform-plans.ts.');
      throw httpError(500, 'Platform configuration is missing. Please contact Tutorial OS support.');
    }
    return doc.data() as PlatformConfigGlobal;
  } catch (err: any) {
    if (err?.status) throw err;
    dbFailure('getPlatformConfig', err);
  }
}

export async function getPlatformPlan(planId: string): Promise<PlatformPlan> {
  try {
    const doc = await adminDb.collection('platformPlans').doc(planId).get();
    if (!doc.exists) {
      console.error(`[tenantService] platformPlans/${planId} is missing. Run scripts/seed-platform-plans.ts.`);
      throw httpError(500, 'Plan configuration is missing. Please contact Tutorial OS support.');
    }
    return doc.data() as PlatformPlan;
  } catch (err: any) {
    if (err?.status) throw err;
    dbFailure('getPlatformPlan', err);
  }
}

// ============================================================================
// SUBSCRIPTION STATUS (Step 8): one source of truth.
// ============================================================================

export type EffectiveStatus = 'trial' | 'pending_payment' | 'active' | 'overdue' | 'suspended';

/**
 * Single subscription-status function.
 * Suspended when staff suspend, or after the trial (or paid period) ends plus
 * trialGraceDays with no recorded payment. When a centre has no billing
 * document yet (legacy data), the centre's own status field is used verbatim
 * so existing centres behave exactly as before.
 */
export function effectiveStatus(
  centre: Centre | null,
  billing: CentreBilling | null,
  platformConfig: PlatformConfigGlobal | null,
  now: Date = new Date()
): EffectiveStatus {
  if (!billing) {
    // No billing document: fall back to the status stored on the centre.
    const s = centre?.status;
    if (s === 'suspended' || s === 'closed') return 'suspended';
    if (s === 'overdue') return 'overdue';
    if (s === 'trial') return 'trial';
    return 'active';
  }
  if (centre?.status === 'suspended') return 'suspended';

  const graceMs = Math.max(0, platformConfig?.trialGraceDays ?? 0) * 24 * 60 * 60 * 1000;
  const t = now.getTime();

  const paidThrough = billing.paidThrough ? new Date(billing.paidThrough) : null;
  if (paidThrough && !isNaN(paidThrough.getTime())) {
    if (paidThrough.getTime() >= t) return 'active';
    return paidThrough.getTime() + graceMs >= t ? 'overdue' : 'suspended';
  }

  if (billing.skippedTrial) return 'pending_payment';

  const trialEndsAt = billing.trialEndsAt ? new Date(billing.trialEndsAt) : null;
  if (trialEndsAt && !isNaN(trialEndsAt.getTime())) {
    if (trialEndsAt.getTime() >= t) return 'trial';
    return trialEndsAt.getTime() + graceMs >= t ? 'overdue' : 'suspended';
  }

  return 'pending_payment';
}

// ============================================================================
// RATE LIMITING (Step 9): Firestore-backed, works across Cloud Run instances.
// rateLimits/{key}: { count, firstAttemptAt, lockedUntil, expiresAt }
// `expiresAt` is the TTL field (enable a TTL policy on it in the Firebase
// console; until then stale docs are harmless and lazily ignored).
// ============================================================================

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

function rateLimitDocId(key: string): string {
  return encodeURIComponent(key).slice(0, 1400);
}

export async function checkRateLimit(
  key: string
): Promise<{ allowed: boolean; waitMinutes?: number }> {
  try {
    const doc = await adminDb.collection('rateLimits').doc(rateLimitDocId(key)).get();
    const now = Date.now();
    if (!doc.exists) return { allowed: true };
    const data = doc.data() || {};
    if (data.lockedUntil && now < data.lockedUntil) {
      return { allowed: false, waitMinutes: Math.ceil((data.lockedUntil - now) / 60000) };
    }
    if (now - data.firstAttemptAt > RATE_WINDOW_MS) return { allowed: true };
    if ((data.count || 0) >= MAX_ATTEMPTS) {
      return { allowed: false, waitMinutes: 15 };
    }
    return { allowed: true };
  } catch (err) {
    dbFailure('checkRateLimit', err);
  }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('rateLimits').doc(rateLimitDocId(key));
      const doc = await tx.get(ref);
      const now = Date.now();
      let count = 1;
      let firstAttemptAt = now;
      if (doc.exists && now - (doc.data()!.firstAttemptAt || 0) <= RATE_WINDOW_MS) {
        count = (doc.data()!.count || 0) + 1;
        firstAttemptAt = doc.data()!.firstAttemptAt;
      }
      const update: Record<string, any> = { count, firstAttemptAt };
      if (count >= MAX_ATTEMPTS) {
        // Growing lockout: 15 min, 30 min, 60 min, ... capped at 24 h.
        const cycles = Math.min(count - MAX_ATTEMPTS + 1, 10);
        const lockMs = Math.min(RATE_WINDOW_MS * Math.pow(2, cycles - 1), MAX_LOCK_MS);
        update.lockedUntil = now + lockMs;
      }
      update.expiresAt = new Date(
        Math.max(update.lockedUntil || 0, firstAttemptAt + RATE_WINDOW_MS) + RATE_WINDOW_MS
      );
      tx.set(ref, update, { merge: true });
    });
  } catch (err) {
    dbFailure('recordFailedAttempt', err);
  }
  // Every failed attempt is auditable.
  try {
    await adminDb.collection('auditLogs').add({
      action: 'ACCESS_CODE_FAILED_ATTEMPT',
      key: rateLimitDocId(key),
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[tenantService] Could not write failed-attempt audit log:', err?.message || err);
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  try {
    await adminDb.collection('rateLimits').doc(rateLimitDocId(key)).delete();
  } catch (err) {
    console.error('[tenantService] Could not reset rate limit:', err?.message || err);
  }
}

/** Per-user hourly quota for the AI routes (Step 10). Limit comes from
 *  platformConfig.global.aiRouteRateLimitPerHour when present. */
export async function consumeAiRateLimit(
  uid: string,
  route: 'ai-questions' | 'ai-essay',
  platformConfig: PlatformConfigGlobal | null
): Promise<void> {
  const limitPerHour = platformConfig?.aiRouteRateLimitPerHour ?? 60;
  const id = rateLimitDocId(`ai:${route}:${uid}`);
  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('rateLimits').doc(id);
      const doc = await tx.get(ref);
      const now = Date.now();
      const windowMs = 60 * 60 * 1000;
      let count = 1;
      let windowStart = now;
      if (doc.exists && now - (doc.data()!.windowStart || 0) <= windowMs) {
        count = (doc.data()!.count || 0) + 1;
        windowStart = doc.data()!.windowStart;
      }
      if (count > limitPerHour) {
        const waitMinutes = Math.ceil((windowStart + windowMs - now) / 60000);
        throw httpError(429, `Too many requests. Please wait ${waitMinutes} minutes before trying again.`);
      }
      tx.set(
        ref,
        { count, windowStart, expiresAt: new Date(windowStart + windowMs + windowMs) },
        { merge: true }
      );
    });
  } catch (err: any) {
    if (err?.status === 429) throw err;
    dbFailure('consumeAiRateLimit', err);
  }
}

// ============================================================================
// MEMBERSHIP HELPERS
// ============================================================================

export async function getMembership(
  uid: string,
  centreId: string,
  legacyEmail?: string
): Promise<CentreMembership | null> {
  try {
    const doc = await adminDb.collection('memberships').doc(`${uid}__${centreId}`).get();
    if (doc.exists) return doc.data() as CentreMembership;
    if (legacyEmail && legacyEmail !== uid) {
      // Legacy documents keyed by email before UIDs were backfilled.
      const legacy = await adminDb.collection('memberships').doc(`${legacyEmail}__${centreId}`).get();
      if (legacy.exists) return legacy.data() as CentreMembership;
    }
    return null;
  } catch (err) {
    dbFailure('getMembership', err);
  }
}

/** Authorise a caller against a centre. Firestore is the only source of truth. */
export async function requireMembership(
  caller: Caller,
  centreId: string,
  roles?: MembershipRole[]
): Promise<CentreMembership> {
  if (caller.tos) {
    // TOS staff act platform-wide; still require the centre to exist.
    try {
      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      if (!cDoc.exists) throw httpError(404, 'Centre not found.');
    } catch (err: any) {
      if (err?.status) throw err;
      dbFailure('requireMembership(tos)', err);
    }
    const stub: CentreMembership = {
      uid: caller.uid,
      centreId,
      role: 'owner',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };
    return stub;
  }

  const m = await getMembership(caller.uid, centreId, caller.email);
  if (!m || m.status !== 'active') {
    throw httpError(403, 'You do not have access to this centre.');
  }
  if (roles && !roles.includes(m.role)) {
    throw httpError(403, 'You do not have permission for this action.');
  }
  return m;
}

/** Kept name used across the codebase; now takes a verified Caller. */
export async function verifyAdminOrOwner(caller: Caller, centreId: string): Promise<CentreMembership> {
  return requireMembership(caller, centreId, ['owner', 'admin']);
}

// ============================================================================
// CENTRE DATA HELPERS (Firestore only, no fake data)
// ============================================================================

async function getCentreDoc(centreId: string): Promise<Centre | null> {
  try {
    const doc = await adminDb.collection('centres').doc(centreId).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as Centre) : null;
  } catch (err) {
    dbFailure('getCentreDoc', err);
  }
}

async function getBillingDoc(centreId: string): Promise<CentreBilling | null> {
  try {
    const doc = await adminDb.collection('centreBilling').doc(centreId).get();
    return doc.exists ? (doc.data() as CentreBilling) : null;
  } catch (err) {
    dbFailure('getBillingDoc', err);
  }
}

/** Count active student memberships for a centre (used to seed the
 *  transactional seat counter when it has never been written). */
async function countActiveStudents(centreId: string): Promise<number> {
  try {
    const snap = await adminDb
      .collection('memberships')
      .where('centreId', '==', centreId)
      .where('role', '==', 'student')
      .where('status', '==', 'active')
      .get();
    return snap.size;
  } catch (err) {
    dbFailure('countActiveStudents', err);
  }
}

function seatCapFor(
  billing: CentreBilling | null,
  plan: PlatformPlan | null,
  status: EffectiveStatus
): number {
  if (status === 'trial' && plan?.trialSeatCap) return plan.trialSeatCap;
  return billing?.seatCap ?? plan?.seatCap ?? 0;
}

// ============================================================================
// ENTER CENTRE (sign-in flow: verify an existing membership by access code)
// ============================================================================

export async function enterCentreService(params: {
  uid: string;
  userEmail: string;
  code: string;
  ip: string;
  tos?: boolean;
}): Promise<{
  centreId: string;
  centre: Centre;
  role: MembershipRole;
  entitlements: CentreEntitlements;
}> {
  const { uid, userEmail, code } = params;
  const caller: Caller = { uid, email: userEmail, tos: Boolean(params.tos), claims: {} };
  const cleanCode = code.trim();
  const rateLimitKey = `${uid || userEmail || 'anon'}:${params.ip}`;

  const rateCheck = await checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    throw httpError(
      429,
      `Too many failed code attempts. Please wait ${rateCheck.waitMinutes || 15} minutes before trying again.`
    );
  }

  // 1. Look the code up in Firestore only.
  let centreId: string | null = null;
  try {
    const codeDoc = await adminDb.collection('accessCodes').doc(cleanCode).get();
    if (codeDoc.exists) centreId = codeDoc.data()?.centreId || null;
  } catch (err) {
    dbFailure('enterCentreService(code lookup)', err);
  }

  // Codes set by hand on the centre document may never have a canonical
  // accessCodes entry. Accept them and materialize the entry so claims and
  // limits keep one source of truth. A conflicting holder still fails.
  if (!centreId) {
    try {
      let byCentre = await adminDb.collection('centres').where('accessCode', '==', cleanCode).limit(2).get();
      if (byCentre.empty && /^\d+$/.test(cleanCode)) {
        // A code set by hand in the console may be stored as a number.
        byCentre = await adminDb.collection('centres').where('accessCode', '==', Number(cleanCode)).limit(2).get();
      }
      const matches = byCentre.docs.filter((d) => String(d.data()?.accessCode) === cleanCode);
      if (matches.length === 1) {
        const fallbackCentreId = matches[0].id;
        const holder = await adminDb.runTransaction(async (tx) => {
          const ref = adminDb.collection('accessCodes').doc(cleanCode);
          const existing = await tx.get(ref);
          if (existing.exists && existing.data()?.centreId !== fallbackCentreId) return false;
          if (!existing.exists) {
            tx.set(ref, { centreId: fallbackCentreId, createdAt: new Date().toISOString(), active: true, setBy: 'centre-doc-fallback' });
          }
          return true;
        });
        if (holder) centreId = fallbackCentreId;
      }
    } catch (err) {
      dbFailure('enterCentreService(centre-doc fallback)', err);
    }
  }

  const failWith = async (reason: string) => {
    try {
      await adminDb.collection('auditLogs').add({
        actorUid: uid,
        centreId: centreId || null,
        action: 'ACCESS_CODE_FAIL',
        reason,
        at: new Date().toISOString(),
      });
    } catch { /* audit is best-effort */ }
    await recordFailedAttempt(rateLimitKey);
    throw httpError(400, UNIFORM_MISMATCH_ERROR);
  };

  if (!centreId) {
    await failWith('code-not-found');
  }

  // 2. Fetch the centre.
  const centre = await getCentreDoc(centreId);
  if (!centre) {
    await failWith('centre-missing');
  }

  // 3. Verify membership. A platform-staff `tos` claim grants no centre
  // access here (Prompt E): staff test a centre by signing in with one of
  // that centre's own accounts, never by entering its access code.
  let membership: CentreMembership | null = null;
  membership = await getMembership(uid, centreId, userEmail);
  if (!membership) {
    // Legacy documents keyed by email in the uid field.
    try {
      const snap = await adminDb
        .collection('memberships')
        .where('centreId', '==', centreId)
        .where('uid', '==', userEmail)
        .limit(1)
        .get();
      if (!snap.empty) membership = snap.docs[0].data() as CentreMembership;
    } catch (err) {
      dbFailure('enterCentreService(legacy membership lookup)', err);
    }
  }
  if (!membership || membership.status !== 'active') {
    await failWith('membership-missing');
  }

  // 4. Subscription status: suspended centres are owner/TOS only.
  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);
  if (status === 'suspended' && membership.role !== 'owner') {
    throw httpError(
      403,
      `This centre's access is currently inactive. Please contact the centre administration.`
    );
  }

  await resetRateLimit(rateLimitKey);

  const entitlements = await getCentreEntitlements(centreId);

  return { centreId, centre, role: membership.role, entitlements };
}

// ============================================================================
// VALIDATE ACTIVE CENTRE (page reload)
// ============================================================================

export async function validateActiveCentreService(params: {
  uid: string;
  userEmail: string;
  centreId: string;
  tos?: boolean;
}): Promise<{
  centre: Centre;
  role: MembershipRole;
  entitlements: CentreEntitlements;
}> {
  const { uid, userEmail, centreId } = params;
  const caller: Caller = { uid, email: userEmail, tos: Boolean(params.tos), claims: {} };

  const centre = await getCentreDoc(centreId);
  if (!centre) throw httpError(404, 'Active centre not found.');

  // No platform-staff shortcut (Prompt E): a `tos` claim alone is not a
  // membership. The session's active centre must belong to the caller.
  const membership: CentreMembership | null = await getMembership(uid, centreId, userEmail);
  if (!membership || membership.status !== 'active') {
    throw httpError(403, 'Your active membership for this centre is no longer active.');
  }

  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);
  if (status === 'suspended' && membership.role !== 'owner') {
    throw httpError(
      403,
      `This centre's access is currently inactive. Please contact the centre administration.`
    );
  }

  const entitlements = await getCentreEntitlements(centreId);
  return { centre, role: membership.role, entitlements };
}

// ============================================================================
// LIST USER CENTRES
// ============================================================================

export async function listUserCentresService(params: {
  uid: string;
  userEmail: string;
  tos?: boolean;
}): Promise<
  Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    logo?: string;
  }>
> {
  const { uid, userEmail } = params;
  const results: Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    logo?: string;
  }> = [];

  if (params.tos) {
    // TOS staff see every centre on the platform.
    try {
      const snap = await adminDb.collection('centres').limit(200).get();
      snap.forEach((docSnap) => {
        const c = docSnap.data() as Centre;
        results.push({
          centreId: docSnap.id,
          role: 'owner',
          centreName: c.name || 'Centre',
          logo: c.branding?.logo || '',
        });
      });
    } catch (err) {
      dbFailure('listUserCentresService(tos)', err);
    }
    return results;
  }

  try {
    const snap = await adminDb
      .collection('memberships')
      .where('uid', '==', uid)
      .where('status', '==', 'active')
      .get();

    for (const docSnap of snap.docs) {
      const m = docSnap.data() as CentreMembership;
      const centre = await getCentreDoc(m.centreId);
      results.push({
        centreId: m.centreId,
        role: m.role,
        centreName: centre?.name || 'Centre',
        logo: centre?.branding?.logo || '',
      });
    }
  } catch (err) {
    dbFailure('listUserCentresService', err);
  }

  return results;
}

// ============================================================================
// JOIN CENTRE (Step 7: transactional seat check)
// ============================================================================

export async function joinCentreService(params: {
  uid: string;
  userEmail: string;
  code: string;
  ip: string;
  tos?: boolean;
}): Promise<{
  status: 'active' | 'pending';
  centreId: string;
  centreName: string;
}> {
  const { uid, userEmail, code } = params;
  const cleanCode = code.trim();
  const rateLimitKey = `${uid || userEmail || 'anon'}:${params.ip}`;

  const rateCheck = await checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    throw httpError(
      429,
      `Too many failed attempts. Please wait ${rateCheck.waitMinutes || 15} minutes before trying again.`
    );
  }

  // 1. Look the code up in Firestore only.
  let centreId: string | null = null;
  try {
    const codeDoc = await adminDb.collection('accessCodes').doc(cleanCode).get();
    if (codeDoc.exists) centreId = codeDoc.data()?.centreId || null;
  } catch (err) {
    dbFailure('joinCentreService(code lookup)', err);
  }

  if (!centreId) {
    await recordFailedAttempt(rateLimitKey);
    throw httpError(400, UNIFORM_MISMATCH_ERROR);
  }

  // 2. Read the centre (and everything the seat maths needs) outside the
  //    transaction, then re-check the cap transactionally below.
  const centre = await getCentreDoc(centreId);
  if (!centre) {
    await recordFailedAttempt(rateLimitKey);
    throw httpError(400, UNIFORM_MISMATCH_ERROR);
  }

  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);

  if (status === 'suspended' || status === 'pending_payment') {
    throw httpError(403, `This centre (${centre.name}) is currently not accepting new students.`);
  }
  if (status === 'overdue' && !params.tos) {
    // Overdue centres are owner/TOS territory until payment is recorded.
    throw httpError(403, `This centre (${centre.name}) is currently not accepting new students.`);
  }

  // 3. Seat cap check and membership write inside one transaction.
  const plan = billing ? await getPlatformPlan(billing.planId) : null;
  const preSeedCount = await countActiveStudents(centreId);
  const autoApprove = centre.autoApproveStudents === true;
  const membershipId = `${uid}__${centreId}`;
  const membershipStatus: 'active' | 'pending' = autoApprove ? 'active' : 'pending';

  try {
    await adminDb.runTransaction(async (tx) => {
      const centreRef = adminDb.collection('centres').doc(centreId);
      const billingRef = adminDb.collection('centreBilling').doc(centreId);
      const memRef = adminDb.collection('memberships').doc(membershipId);

      const [centreDoc, billingDoc, memDoc] = await Promise.all([
        tx.get(centreRef),
        tx.get(billingRef),
        tx.get(memRef),
      ]);

      if (memDoc.exists && memDoc.data()?.status === 'active') {
        return; // Already a member; idempotent join.
      }

      // Re-check status with fresh documents.
      const freshCentre = centreDoc.exists
        ? ({ id: centreDoc.id, ...centreDoc.data() } as Centre)
        : centre;
      const freshBilling = billingDoc.exists ? (billingDoc.data() as CentreBilling) : billing;
      const freshStatus = effectiveStatus(freshCentre, freshBilling, config);
      if (freshStatus === 'suspended' || freshStatus === 'pending_payment') {
        throw httpError(403, `This centre (${freshCentre.name}) is currently not accepting new students.`);
      }

      const freshPlan = freshBilling ? plan : null;
      const cap = seatCapFor(freshBilling, freshPlan, freshStatus);
      const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;

      if (autoApprove && used >= cap) {
        const err = httpError(
          409,
          `This centre has reached its student limit. Please contact ${freshCentre.name}.`
        );
        (err as any).code = 'CENTRE_FULL';
        (err as any).centreName = freshCentre.name;
        throw err;
      }

      const now = new Date().toISOString();
      tx.set(
        memRef,
        {
          id: membershipId,
          uid,
          centreId,
          role: 'student',
          status: membershipStatus,
          createdAt: memDoc.exists ? memDoc.data()!.createdAt || now : now,
          updatedAt: now,
        },
        { merge: true }
      );

      if (autoApprove && (!memDoc.exists || memDoc.data()?.status !== 'active')) {
        // A newly activated student takes a seat; keep the counter exact.
        tx.set(billingRef, { activeStudentCount: used + 1 }, { merge: true });
      }
    });
  } catch (err: any) {
    if (err?.status) throw err;
    dbFailure('joinCentreService(transaction)', err);
  }

  await resetRateLimit(rateLimitKey);

  return { status: membershipStatus, centreId, centreName: centre.name };
}

// ============================================================================
// STUDENT SEAT MANAGEMENT (Step 7: transactions)
// ============================================================================

/** Enable/reactivate a student membership transactionally, checking the seat
 *  cap and the per-student reactivation (swap) limit in the same transaction. */
async function activateStudentTransactional(params: {
  caller: Caller;
  studentUid: string;
  centreId: string;
}): Promise<{ used: number; cap: number }> {
  const { caller, studentUid, centreId } = params;

  const billing = await getBillingDoc(centreId);
  const centre = await getCentreDoc(centreId);
  const config = await getPlatformConfig();
  const plan = billing ? await getPlatformPlan(billing.planId) : null;
  const preSeedCount = await countActiveStudents(centreId);
  const membershipId = `${studentUid}__${centreId}`;
  const now = Date.now();
  const windowMs = Math.max(1, config.seatSwapWindowDays ?? 30) * 24 * 60 * 60 * 1000;
  const swapLimit = config.seatSwapLimitPerStudent ?? 2;

  return adminDb.runTransaction(async (tx) => {
    const centreRef = adminDb.collection('centres').doc(centreId);
    const billingRef = adminDb.collection('centreBilling').doc(centreId);
    const memRef = adminDb.collection('memberships').doc(membershipId);

    const [centreDoc, billingDoc, memDoc] = await Promise.all([
      tx.get(centreRef),
      tx.get(billingRef),
      tx.get(memRef),
    ]);

    if (!memDoc.exists) throw httpError(404, 'Student membership not found.');

    const freshCentre = centreDoc.exists ? ({ id: centreDoc.id, ...centreDoc.data() } as Centre) : centre;
    const freshBilling = billingDoc.exists ? (billingDoc.data() as CentreBilling) : billing;
    const status = effectiveStatus(freshCentre, freshBilling, config);
    if (status === 'suspended') {
      throw httpError(403, 'This centre is currently suspended. Reactivate it before managing seats.');
    }

    const current = memDoc.data() as CentreMembership & {
      reactivationTimestamps?: string[];
    };

    // Already active: nothing to do.
    if (current.status === 'active') {
      const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;
      return { used, cap: seatCapFor(freshBilling, plan, status) };
    }

    // Swap (reactivation) limit, checked inside the transaction.
    const recent = (current.reactivationTimestamps || []).filter(
      (ts) => now - new Date(ts).getTime() <= windowMs
    );
    if (recent.length >= swapLimit) {
      throw httpError(
        429,
        `Seat swap limit reached for this student (max ${swapLimit} reactivations per ${config.seatSwapWindowDays ?? 30} days).`
      );
    }

    const cap = seatCapFor(freshBilling, plan, status);
    const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;
    if (used >= cap) {
      throw httpError(
        409,
        `Seat limit reached: ${used} of ${cap}. Free a seat or ask Tutorial OS to raise your limit.`
      );
    }

    const nowIso = new Date().toISOString();
    tx.set(
      memRef,
      {
        status: 'active',
        reactivationTimestamps: [...recent, nowIso],
        lastAccessToggledAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    tx.set(billingRef, { activeStudentCount: used + 1 }, { merge: true });

    return { used: used + 1, cap };
  });
}

export async function activateStudentService(params: {
  actorUid: string;
  actorEmail: string;
  studentUid: string;
  centreId: string;
  tos?: boolean;
}): Promise<{ success: boolean; used: number; cap: number }> {
  const caller: Caller = {
    uid: params.actorUid,
    email: params.actorEmail,
    tos: Boolean(params.tos),
    claims: {},
  };
  await verifyAdminOrOwner(caller, params.centreId);

  const result = await activateStudentTransactional({
    caller,
    studentUid: params.studentUid,
    centreId: params.centreId,
  });

  try {
    await adminDb.collection('auditLogs').add({
      actorUid: params.actorUid,
      centreId: params.centreId,
      action: 'STUDENT_ACTIVATED',
      studentUid: params.studentUid,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[tenantService] Could not write activation audit log:', err?.message || err);
  }

  return { success: true, used: result.used, cap: result.cap };
}

export async function toggleStudentAccessService(params: {
  actorUid: string;
  actorEmail: string;
  studentUid: string;
  centreId: string;
  active: boolean;
  tos?: boolean;
}): Promise<{ success: boolean; active: boolean; used?: number; cap?: number }> {
  const caller: Caller = {
    uid: params.actorUid,
    email: params.actorEmail,
    tos: Boolean(params.tos),
    claims: {},
  };
  const { actorUid, studentUid, centreId, active } = params;
  await verifyAdminOrOwner(caller, centreId);

  const membershipId = `${studentUid}__${centreId}`;
  const nowIso = new Date().toISOString();

  if (!active) {
    // Disabling needs no cap check, but the counter must stay exact.
    const billing = await getBillingDoc(centreId);
    const preSeedCount = await countActiveStudents(centreId);

    const wasActive = await adminDb.runTransaction(async (tx) => {
      const memRef = adminDb.collection('memberships').doc(membershipId);
      const billingRef = adminDb.collection('centreBilling').doc(centreId);
      const [memDoc, billingDoc] = await Promise.all([tx.get(memRef), tx.get(billingRef)]);
      if (!memDoc.exists) throw httpError(404, 'Student membership not found.');
      const wasActive = memDoc.data()?.status === 'active';
      tx.set(
        memRef,
        { status: 'disabled', lastAccessToggledAt: nowIso, updatedAt: nowIso },
        { merge: true }
      );
      if (wasActive) {
        const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;
        tx.set(billingRef, { activeStudentCount: Math.max(0, used - 1) }, { merge: true });
      }
      return wasActive;
    });

    try {
      await adminAuth.revokeRefreshTokens(studentUid);
    } catch (err) {
      console.error('[tenantService] Could not revoke refresh tokens:', err?.message || err);
    }

    try {
      await adminDb.collection('auditLogs').add({
        actorUid,
        centreId,
        action: 'STUDENT_ACCESS_DISABLED',
        studentUid,
        at: nowIso,
      });
    } catch (err) {
      console.error('[tenantService] Could not write audit log:', err?.message || err);
    }

    const used = billing?.activeStudentCount ?? preSeedCount;
    return { success: true, active: false, used: wasActive ? Math.max(0, used - 1) : used };
  }

  // Enabling goes through the transactional activation (cap + swap limit).
  const result = await activateStudentTransactional({ caller, studentUid, centreId });

  try {
    await adminDb.collection('auditLogs').add({
      actorUid,
      centreId,
      action: 'STUDENT_ACCESS_ENABLED',
      studentUid,
      at: nowIso,
    });
  } catch (err) {
    console.error('[tenantService] Could not write audit log:', err?.message || err);
  }

  return { success: true, active: true, used: result.used, cap: result.cap };
}

// ============================================================================
// ENTITLEMENTS AND SEATS SUMMARY (Step 6: data layer)
// ============================================================================

export async function getCentreEntitlements(centreId: string): Promise<CentreEntitlements> {
  const billing = await getBillingDoc(centreId);
  const planId = billing?.planId || 'centre_standard';
  const plan = await getPlatformPlan(planId);

  return {
    chat: plan.studentChat ?? false,
    whatsappParentNotifications: plan.whatsappNotifications ?? false,
    aiQuestionGeneration: plan.aiQuestionGen ?? false,
    aiPerformanceAnalysis: plan.aiPerformanceAnalysis ?? false,
  };
}

export async function getSeatsSummaryService(centreId: string): Promise<CentreSeatsSummary> {
  const billing = await getBillingDoc(centreId);
  const centre = await getCentreDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);
  const plan = billing ? await getPlatformPlan(billing.planId) : null;
  const cap = seatCapFor(billing, plan, status);

  let used = 0;
  const studentAccess: Record<
    string,
    { status: MembershipStatus; lastToggledAt?: string; reactivationsIn30d?: number }
  > = {};

  try {
    const mSnap = await adminDb
      .collection('memberships')
      .where('centreId', '==', centreId)
      .where('role', '==', 'student')
      .get();

    const now = Date.now();
    const windowMs = Math.max(1, config.seatSwapWindowDays ?? 30) * 24 * 60 * 60 * 1000;
    mSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const stamps: string[] = data.reactivationTimestamps || [];
      const recentCount = stamps.filter((ts) => now - new Date(ts).getTime() <= windowMs).length;
      studentAccess[data.uid] = {
        status: data.status,
        lastToggledAt: data.lastAccessToggledAt || data.updatedAt,
        reactivationsIn30d: recentCount,
      };
      if (data.status === 'active') used++;
    });
  } catch (err) {
    dbFailure('getSeatsSummaryService', err);
  }

  let trialDaysLeft: number | undefined;
  if (status === 'trial' && billing?.trialEndsAt) {
    const diff = new Date(billing.trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return {
    used,
    cap,
    isTrial: status === 'trial',
    trialDaysLeft,
    trialEndsAt: billing?.trialEndsAt || null,
    studentAccess,
  };
}

/** Subscription status for one centre, for use by route middleware. */
export async function getCentreSubscriptionStatus(centreId: string): Promise<EffectiveStatus> {
  const centre = await getCentreDoc(centreId);
  if (!centre) throw httpError(404, 'Centre not found.');
  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  return effectiveStatus(centre, billing, config);
}
