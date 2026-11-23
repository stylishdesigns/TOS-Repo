import { adminDb, adminAuth } from './firebaseAdmin';
import { reconcileSeatOrder } from './seatDays';
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
  SeatSummary,
  SeatStatus,
  SeatPool,
} from '../types';
import {
  ensureSeatsForCentre,
  lockExpiredSeatsForCentre,
  drawFreeSeatForCentre,
  listSeats,
  seatUsage,
  seatKind,
  isOnTrial,
  countPaidSeatsForCentre,
  reconcileFreeSeats,
  freezeSeatRunMs,
} from './seatDays';

/** The facility's free-seat allocation: a per-facility override wins, else
 *  the platform-wide default. Batch 22. */
function freeSeatAllocation(config: any, billing: any): number {
  const custom = billing?.freeSeatsCustom;
  if (custom !== null && custom !== undefined && String(custom).trim() !== '') {
    return Math.max(0, Math.floor(Number(custom)));
  }
  return Math.max(0, Math.floor(Number((config as any)?.freeSeatsGeneral ?? 5)));
}

/** Free seats are always open on trial; off trial they unlock once the
 *  facility has paid for at least the platform minimum. */
async function freeSeatsUnlockedFor(centreId: string, billing: any, config: any): Promise<boolean> {
  if (isOnTrial(billing)) return true;
  const minimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
  return (await countPaidSeatsForCentre(centreId)) >= minimum;
}

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
  const bootstrap = (process.env.TOS_BOOTSTRAP_EMAILS || process.env.SUPER_ADMIN_EMAILS || '')
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
  // Some older centre billing documents carry an empty planId. Firestore
  // rejects an empty document path, which used to surface as a generic
  // "server error" (for example when re-enabling a student's access).
  // Fall back to the standard plan whenever the id is empty.
  const effectivePlanId = String(planId ?? '').trim() || 'centre_standard';
  try {
    const doc = await adminDb.collection('platformPlans').doc(effectivePlanId).get();
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

/**
 * Staff access materialised from the staff record (invite login fix). Staff
 * and tutor accounts are created by the invite forms, which write only the
 * admins/tutors document; the facility entry path reads memberships, so a
 * newly invited staff member could sign in but never enter the facility.
 * When the caller's staff record belongs to this centre, create the
 * memberships row it implies and return it. Suspended staff stay out.
 */
async function ensureStaffMembershipFromRecord(
  uid: string,
  centreId: string,
  userEmail?: string
): Promise<CentreMembership | null> {
  if (!centreId) return null;
  try {
    let staffDoc: Record<string, any> | null = null;
    let staffRole = '';
    const adm = await adminDb.collection('admins').doc(uid).get();
    if (adm.exists) {
      staffDoc = adm.data() as Record<string, any>;
      staffRole = String((staffDoc as any).role || '');
    }
    if (!staffDoc) {
      const tut = await adminDb.collection('tutors').doc(uid).get();
      if (tut.exists) {
        staffDoc = tut.data() as Record<string, any>;
        staffRole = 'tutor';
      }
    }
    if (!staffDoc && userEmail) {
      // Legacy staff records keyed by email under a different document id.
      const legacy = await adminDb.collection('tutors')
        .where('email', '==', userEmail.toLowerCase())
        .limit(5)
        .get();
      const match = legacy.docs.find((d) => String((d.data() as any).centreId || '') === centreId);
      if (match) {
        staffDoc = match.data() as Record<string, any>;
        staffRole = 'tutor';
      }
    }
    if (!staffDoc) return null;
    if (String((staffDoc as any).centreId || '') !== centreId) return null;
    if (String((staffDoc as any).status || '') === 'Suspended') return null;
    const role: MembershipRole = /^tutor/i.test(staffRole)
      ? 'tutor'
      : /secretary/i.test(staffRole)
        ? 'secretary'
        : /finance/i.test(staffRole)
          ? 'finance'
          : 'admin';
    const now = new Date().toISOString();
    const row: CentreMembership = { uid, centreId, role, status: 'active', createdAt: now, updatedAt: now };
    await adminDb.collection('memberships').doc(`${uid}__${centreId}`).set(row, { merge: true });
    return row;
  } catch (err) {
    dbFailure('ensureStaffMembershipFromRecord', err);
    return null;
  }
}

/**
 * One shared membership lookup for the login path (Login hotfix). Resolves a
 * caller's membership in one centre across every documented shape:
 *  - doc id `${uid}__${centreId}` (canonical, set by provisioning and import)
 *  - doc id `${email}__${centreId}` (legacy: email keyed before uid backfill)
 *  - `uid` field holding the caller uid or their email (legacy field shape)
 * enterCentreService and listUserCentresService must never disagree again:
 * listUserCentresService used to match only uid == caller uid, so a member
 * enter-centre accepted could vanish from my-centres and the client would be
 * told "no account" for an account the server itself recognises.
 */
export async function findCentreMembership(
  uid: string,
  centreId: string,
  userEmail?: string
): Promise<CentreMembership | null> {
  // Document-id shapes first: canonical and legacy email-keyed ids.
  const viaDocId = await getMembership(uid, centreId, userEmail);
  if (viaDocId) return viaDocId;
  // Field shapes: the uid field holding either the caller uid or their email.
  const legacyKeys = userEmail && userEmail !== uid ? [uid, userEmail] : [uid];
  for (const key of legacyKeys) {
    try {
      const snap = await adminDb
        .collection('memberships')
        .where('uid', '==', key)
        .where('centreId', '==', centreId)
        .limit(2)
        .get();
      if (!snap.empty) return snap.docs[0].data() as CentreMembership;
    } catch (err) {
      dbFailure('findCentreMembership', err);
    }
  }
  // Last resort: the caller's own staff record for this centre.
  const staffMembership = await ensureStaffMembershipFromRecord(uid, centreId, userEmail);
  if (staffMembership) return staffMembership;
  return null;
}

/**
 * Active memberships for a caller across the same field shapes as
 * findCentreMembership (doc-id-keyed legacy rows without a usable uid field
 * are not enumerable by query; enter-centre still resolves those directly).
 */
export async function listActiveMembershipsForUser(
  uid: string,
  userEmail?: string
): Promise<CentreMembership[]> {
  const byId = new Map<string, CentreMembership>();
  const legacyKeys = userEmail && userEmail !== uid ? [uid, userEmail] : [uid];
  for (const key of legacyKeys) {
    try {
      const snap = await adminDb
        .collection('memberships')
        .where('uid', '==', key)
        .where('status', '==', 'active')
        .get();
      snap.forEach((docSnap) => {
        if (!byId.has(docSnap.id)) byId.set(docSnap.id, docSnap.data() as CentreMembership);
      });
    } catch (err) {
      dbFailure('listActiveMembershipsForUser', err);
    }
  }
  return [...byId.values()];
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
      if (!cDoc.exists) throw httpError(404, 'Facility not found.');
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
    throw httpError(403, 'You do not have access to this facility.');
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

export async function getBillingDoc(centreId: string): Promise<CentreBilling | null> {
  try {
    const doc = await adminDb.collection('centreBilling').doc(centreId).get();
    return doc.exists ? (doc.data() as CentreBilling) : null;
  } catch (err) {
    dbFailure('getBillingDoc', err);
  }
}

/** Count active student memberships for a centre (used to seed the
 *  transactional seat counter when it has never been written). */
export async function countActiveStudents(centreId: string): Promise<number> {
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

export function seatCapFor(
  billing: CentreBilling | null,
  plan: PlatformPlan | null,
  status: EffectiveStatus
): number {
  // A seat cap the TOS console set directly (it differs from the plan's own
  // cap) is an explicit override and wins even during a trial, so the cap the
  // console shows is the cap the facility enforces.
  if (billing && Number(billing.seatCap) > 0 && (!plan || Number(billing.seatCap) !== Number(plan.seatCap))) {
    return Number(billing.seatCap);
  }
  if (status === 'trial' && plan?.trialSeatCap) return plan.trialSeatCap;
  return billing?.seatCap ?? plan?.seatCap ?? 0;
}

/**
 * The centre's WhatsApp support line (centreSettings/{id}__global), for the
 * blocked-access screen: a student whose access was switched off is told to
 * contact their centre admin, with a one-tap WhatsApp link.
 */
async function getCentreWhatsApp(centreId: string): Promise<string | undefined> {
  try {
    const doc = await adminDb.collection('centreSettings').doc(`${centreId}__global`).get();
    if (!doc.exists) return undefined;
    const raw =
      (doc.data() as any)?.whatsappNumber ||
      (doc.data() as any)?.whatsapp ||
      (doc.data() as any)?.phone ||
      '';
    return raw ? String(raw) : undefined;
  } catch {
    return undefined;
  }
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
  centreId?: string;
}): Promise<{
  centreId: string;
  centre: Centre;
  role: MembershipRole;
  entitlements: CentreEntitlements;
}> {
  const { uid, userEmail, code } = params;
  const caller: Caller = { uid, email: userEmail, tos: Boolean(params.tos), claims: {} };
  // The facility app flow enters by centre id with no code.
  const forcedCentreId = params.centreId && /^[a-zA-Z0-9_-]{3,160}$/.test(params.centreId) ? params.centreId : null;
  const cleanCode = code.trim();
  const rateLimitKey = `${uid || userEmail || 'anon'}:${params.ip}`;

  const rateCheck = await checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    throw httpError(
      429,
      `Too many failed code attempts. Please wait ${rateCheck.waitMinutes || 15} minutes before trying again.`
    );
  }

  // 1. Resolve the facility: by id for the app flow, else by access code.
  let centreId: string | null = forcedCentreId;
  if (!centreId) {
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
      dbFailure('enterCentreService(facility-doc fallback)', err);
    }
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
  // One shared membership lookup (Login hotfix): the same legacy shapes
  // enter-centre always accepted are now exactly what my-centres reports.
  let membership: CentreMembership | null = await findCentreMembership(uid, centreId, userEmail);
  if (!membership && forcedCentreId) {
    // The facility's own app enrolls by itself: a student who signed up
    // inside the app is bound to this facility on their student record,
    // so the record itself creates the student membership here.
    try {
      const stu = await adminDb.collection('students').doc(uid).get();
      if (stu.exists && String((stu.data() as any)?.centreId || '') === forcedCentreId) {
        const row: CentreMembership = { uid, centreId: forcedCentreId, role: 'student', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await adminDb.collection('memberships').doc(`${uid}__${forcedCentreId}`).set(row, { merge: true });
        membership = row;
      }
    } catch (err) {
      dbFailure('enterCentreService(app enrolment)', err);
    }
  }
  if (!membership) {
    await failWith('membership-missing');
  }
  // A membership that exists but is not active yet is a different, sayable
  // failure from "no account": the account does belong to this centre.
  if (membership.status !== 'active') {
    try {
      await adminDb.collection('auditLogs').add({
        actorUid: uid,
        centreId,
        action: 'CENTRE_ENTRY_BLOCKED',
        reason: `membership-${membership.status}`,
        at: new Date().toISOString(),
      });
    } catch { /* audit is best-effort */ }
    const blocked = httpError(
      403,
      'You cannot access this facility at the moment. Please contact your facility admin for help getting back in.'
    );
    (blocked as any).whatsapp = await getCentreWhatsApp(centreId);
    throw blocked;
  }

  // 4. Subscription status: suspended centres are owner/TOS only.
  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);
  if (status === 'suspended' && membership.role !== 'owner') {
    throw httpError(
      403,
      `This facility's access is currently inactive. Please contact the facility administration.`
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
  if (!centre) throw httpError(404, 'Active facility not found.');

  // No platform-staff shortcut (Prompt E): a `tos` claim alone is not a
  // membership. The session's active centre must belong to the caller.
  const membership: CentreMembership | null = await getMembership(uid, centreId, userEmail);
  if (!membership || membership.status !== 'active') {
    const blocked = httpError(
      403,
      'You cannot access this facility at the moment. Please contact your facility admin for help getting back in.'
    );
    (blocked as any).whatsapp = await getCentreWhatsApp(centreId);
    throw blocked;
  }

  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);
  if (status === 'suspended' && membership.role !== 'owner') {
    throw httpError(
      403,
      `This facility's access is currently inactive. Please contact the facility administration.`
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
}): Promise<{
  centres: Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    logo?: string;
  }>;
  blocked: Array<{ centreId: string; centreName: string; whatsapp?: string }>;
}> {
  const { uid, userEmail } = params;
  const results: Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    logo?: string;
  }> = [];
  const blocked: Array<{ centreId: string; centreName: string; whatsapp?: string }> = [];

  if (params.tos) {
    // TOS staff see every centre on the platform.
    try {
      const snap = await adminDb.collection('centres').limit(200).get();
      snap.forEach((docSnap) => {
        const c = docSnap.data() as Centre;
        results.push({
          centreId: docSnap.id,
          role: 'owner',
          centreName: c.name || 'Facility',
          logo: c.branding?.logo || '',
        });
      });
    } catch (err) {
      dbFailure('listUserCentresService(tos)', err);
    }
    return { centres: results, blocked };
  }

  try {
    // One shared membership lookup (Login hotfix): active memberships for the
    // caller uid AND their email, so a member enter-centre accepts can no
    // longer vanish from this list and be reported as "no account".
    const memberships = await listActiveMembershipsForUser(uid, userEmail);
    for (const m of memberships) {
      const centre = await getCentreDoc(m.centreId);
      results.push({
        centreId: m.centreId,
        role: m.role,
        centreName: centre?.name || 'Facility',
        logo: centre?.branding?.logo || '',
      });
    }
    if (results.length === 0) {
      // Staff fallback: the staff/tutor record itself names the facility it
      // belongs to. New invites carry no memberships row until first entry,
      // so without this the account would sign in but never see its facility.
      const staffCentreIds: string[] = [];
      try {
        const adm = await adminDb.collection('admins').doc(uid).get();
        const c = adm.exists ? String((adm.data() as any).centreId || '') : '';
        if (c) staffCentreIds.push(c);
      } catch (err) {
        dbFailure('listUserCentresService(admins)', err);
      }
      try {
        const tut = await adminDb.collection('tutors').doc(uid).get();
        const c = tut.exists ? String((tut.data() as any).centreId || '') : '';
        if (c && !staffCentreIds.includes(c)) staffCentreIds.push(c);
      } catch (err) {
        dbFailure('listUserCentresService(tutors)', err);
      }
      if (userEmail) {
        try {
          const legacy = await adminDb.collection('tutors').where('email', '==', userEmail.toLowerCase()).limit(5).get();
          legacy.forEach((d) => {
            const c = String((d.data() as any).centreId || '');
            if (c && !staffCentreIds.includes(c)) staffCentreIds.push(c);
          });
        } catch (err) {
          dbFailure('listUserCentresService(legacy tutors)', err);
        }
      }
      for (const centreId of staffCentreIds) {
        const m = await ensureStaffMembershipFromRecord(uid, centreId, userEmail);
        if (!m) continue;
        const centre = await getCentreDoc(m.centreId);
        if (!centre) continue;
        results.push({
          centreId: m.centreId,
          role: m.role,
          centreName: centre?.name || 'Facility',
          logo: centre?.branding?.logo || '',
        });
      }
    }
  } catch (err) {
    dbFailure('listUserCentresService', err);
  }

  // Memberships switched off by the centre admin: surfaced so the post-login
  // screen can tell the student why they cannot get in and offer the centre's
  // WhatsApp line, instead of ever falling back to an access-code request.
  try {
    const legacyKeys = userEmail && userEmail !== uid ? [uid, userEmail] : [uid];
    const seenBlocked = new Set(results.map((r) => r.centreId));
    for (const key of legacyKeys) {
      const snap = await adminDb
        .collection('memberships')
        .where('uid', '==', key)
        .where('status', '==', 'disabled')
        .get();
      for (const docSnap of snap.docs) {
        const m = docSnap.data() as CentreMembership;
        if (seenBlocked.has(m.centreId)) continue;
        seenBlocked.add(m.centreId);
        const centre = await getCentreDoc(m.centreId);
        blocked.push({
          centreId: m.centreId,
          centreName: centre?.name || 'Facility',
          whatsapp: await getCentreWhatsApp(m.centreId),
        });
      }
    }
  } catch (err) {
    dbFailure('listUserCentresService(blocked)', err);
  }

  return { centres: results, blocked };
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
    throw httpError(403, `This facility (${centre.name}) is currently not accepting new students.`);
  }
  if (status === 'overdue' && !params.tos) {
    // Overdue centres are owner/TOS territory until payment is recorded.
    throw httpError(403, `This facility (${centre.name}) is currently not accepting new students.`);
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
        throw httpError(403, `This facility (${freshCentre.name}) is currently not accepting new students.`);
      }

      const freshPlan = freshBilling ? plan : null;
      const cap = seatCapFor(freshBilling, freshPlan, freshStatus);
      const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;

      if (autoApprove && used >= cap) {
        const err = httpError(
          409,
          `This facility has reached its student limit. Please contact ${freshCentre.name}.`
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

/** Enable/reactivate a student membership transactionally, seat-days style:
 *  the student draws the free seat with the most days left and their seat
 *  starts burning its days the day it is switched on, student or not. */
async function activateStudentTransactional(params: {
  caller: Caller;
  studentUid: string;
  centreId: string;
}): Promise<{ used: number; cap: number; seatNo?: number; seatRemaining?: number }> {
  const { caller, studentUid, centreId } = params;

  const billing = await getBillingDoc(centreId);
  const centre = await getCentreDoc(centreId);
  const config = await getPlatformConfig();
  const preSeedCount = await countActiveStudents(centreId);
  const membershipId = `${studentUid}__${centreId}`;

  // Seat-days first: seed the pool on first use, lock seats whose days ran
  // out, then draw the free seat with the most days left for this student.
  try {
    await ensureSeatsForCentre(centreId, { billing, trialSeatCap: Number((config as any)?.trialSeatCap || 10), freeSeats: freeSeatAllocation(config, billing) });
  } catch {
    /* seeding retries on the next seats read */
  }
  try {
    await lockExpiredSeatsForCentre(centreId, { centreName: centre?.name || '' });
  } catch {
    /* the sweep also locks expired seats */
  }
  const freeUnlocked = await freeSeatsUnlockedFor(centreId, billing, config);
  const drawn = await drawFreeSeatForCentre(centreId, new Date(), { freeSeatsUnlocked: freeUnlocked });
  if (!drawn) {
    throw httpError(
      409,
      'No seats available. Switch an unused seat off to free one, or ask Tutorial OS to record a payment for more seats.'
    );
  }

  // The student's display name rides onto the seat so the control room shows
  // exactly who holds each seat.
  let studentName = '';
  try {
    const stuDoc = await adminDb.collection('students').doc(studentUid).get();
    studentName = String((stuDoc.data() as any)?.name || '');
  } catch {
    /* the seat still shows its number */
  }

  return adminDb.runTransaction(async (tx) => {
    const centreRef = adminDb.collection('centres').doc(centreId);
    const billingRef = adminDb.collection('centreBilling').doc(centreId);
    const memRef = adminDb.collection('memberships').doc(membershipId);
    const seatRef = adminDb.collection('centreSeats').doc(drawn.id);

    const [centreDoc, billingDoc, memDoc, seatDoc] = await Promise.all([
      tx.get(centreRef),
      tx.get(billingRef),
      tx.get(memRef),
      tx.get(seatRef),
    ]);

    if (!memDoc.exists) throw httpError(404, 'Student membership not found.');

    const freshCentre = centreDoc.exists ? ({ id: centreDoc.id, ...centreDoc.data() } as Centre) : centre;
    const freshBilling = billingDoc.exists ? (billingDoc.data() as CentreBilling) : billing;
    const status = effectiveStatus(freshCentre, freshBilling, config);
    if (status === 'suspended') {
      throw httpError(403, 'This facility is currently suspended. Reactivate it before managing seats.');
    }

    const current = memDoc.data() as CentreMembership;

    // Already active: nothing to do.
    if (current.status === 'active') {
      const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;
      const pool = await listSeats(centreId);
      return {
        used,
        cap: pool.length,
        seatNo: Number((current as any).seatNo || 0),
        seatRemaining: drawn.remaining,
      };
    }

    if (!seatDoc.exists || (seatDoc.data() as any)?.status !== 'available') {
      throw httpError(409, 'That seat was just taken by another switch-on. Try again in a moment.');
    }

    // The stored counter can drift upward (a disable that found the student
    // already off does not decrement, a later enable still increments), so
    // the counter self-heals to the live number of active memberships.
    const used = Math.min(
      billingDoc.data()?.activeStudentCount ?? preSeedCount,
      preSeedCount
    );

    const nowIso = new Date().toISOString();
    tx.set(
      memRef,
      {
        status: 'active',
        seatId: drawn.id,
        seatNo: drawn.seatNo,
        lastAccessToggledAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    tx.set(
      seatRef,
      {
        status: 'active',
        studentUid,
        studentName,
        assignedAt: nowIso,
        startedAt: nowIso,
      },
      { merge: true }
    );
    tx.set(billingRef, { activeStudentCount: used + 1 }, { merge: true });
    // The student portal listens to its own profile doc live; this stamp is
    // what clears the contact-admin banner the moment access returns.
    tx.set(
      adminDb.collection('students').doc(studentUid),
      { accessStatus: 'active' },
      { merge: true }
    );

    const pool = await listSeats(centreId);
    return { used: used + 1, cap: pool.length, seatNo: drawn.seatNo, seatRemaining: drawn.remaining };
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
      const seatId = String((memDoc.data() as any)?.seatId || '');
      tx.set(
        memRef,
        { status: 'disabled', seatId: '', seatNo: 0, lastAccessToggledAt: nowIso, updatedAt: nowIso },
        { merge: true }
      );
      if (wasActive) {
        const used = billingDoc.data()?.activeStudentCount ?? preSeedCount;
        tx.set(billingRef, { activeStudentCount: Math.max(0, used - 1) }, { merge: true });
      }
      // Live stamp for the student portal's banner; the server-side gate on
      // every student endpoint is requireMembership itself.
      tx.set(
        adminDb.collection('students').doc(studentUid),
        { accessStatus: 'off' },
        { merge: true }
      );
      // Seat-days: switching a student off freezes their used days on the seat
      // and returns the seat, with its remaining days, to the facility's pool.
      if (wasActive && seatId) {
        const seatRef = adminDb.collection('centreSeats').doc(seatId);
        const seatDoc = await tx.get(seatRef);
        if (seatDoc.exists) {
          const seat = seatDoc.data() as any;
          const { daysUsed } = seatUsage(seat, new Date());
          const history: any[] = Array.isArray(seat.history) ? seat.history.slice(-50) : [];
          history.push({
            uid: studentUid,
            name: String(seat.studentName || ''),
            from: seat.assignedAt || seat.startedAt || null,
            to: nowIso,
            reason: 'switched off',
          });
          tx.set(
            seatRef,
            {
              status: 'available',
              startedAt: null,
              studentUid: '',
              studentName: '',
              assignedAt: null,
              daysUsedBase: daysUsed,
              history,
              freedAt: nowIso,
            },
            { merge: true }
          );
        }
      }
      return wasActive;
    });

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
// SEAT SWITCHES AND SEAT ASSIGNMENT (batch 20: the pool is hands-on)
// ============================================================================

/** Switch one seat on or off from the control room. Off freezes its used days
 *  and banks it; a student attached to it loses access and leaves the seat.
 *  On starts (or resumes) the daily count, with or without a student. */
export async function setSeatSwitchService(params: {
  actorUid: string;
  actorEmail: string;
  centreId: string;
  seatId: string;
  active: boolean;
  tos?: boolean;
}): Promise<{
  success: boolean;
  seatNo: number;
  status: string;
  daysUsed: number;
  remaining: number;
  detachedStudent?: string;
}> {
  const caller: Caller = {
    uid: params.actorUid,
    email: params.actorEmail,
    tos: Boolean(params.tos),
    claims: {},
  };
  await verifyAdminOrOwner(caller, params.centreId);

  const billing = await getBillingDoc(params.centreId);
  const centre = await getCentreDoc(params.centreId);
  const config = await getPlatformConfig();
  try {
    await ensureSeatsForCentre(params.centreId, { billing, trialSeatCap: Number((config as any)?.trialSeatCap || 10), freeSeats: freeSeatAllocation(config, billing) });
  } catch {
    /* seeding retries on the next seats read */
  }
  try {
    await lockExpiredSeatsForCentre(params.centreId, { centreName: centre?.name || '' });
  } catch {
    /* the sweep also locks expired seats */
  }

  const seatRef = adminDb.collection('centreSeats').doc(params.seatId);
  const seatDoc = await seatRef.get();
  if (!seatDoc.exists || (seatDoc.data() as any)?.centreId !== params.centreId) {
    throw httpError(404, 'Seat not found in this facility.');
  }
  const seat = seatDoc.data() as any;
  const now = new Date();
  const nowIso = now.toISOString();

  if (seat.status === 'locked') {
    const { daysUsed } = seatUsage(seat, now);
    if (params.active) {
      throw httpError(
        409,
        `Seat ${seat.seatNo} completed its ${Number(seat.daysTotal || 30)} days and is locked. A new payment reopens it.`
      );
    }
    return { success: true, seatNo: Number(seat.seatNo || 0), status: 'locked', daysUsed, remaining: 0 };
  }

  // Batch 23: the seat switch is the facility's ONLY access switch, so an
  // OCCUPIED free seat carries one: switching off detaches the student,
  // suspends their access and vacates the seat. Free seats never burn days,
  // so there is nothing to bank. A bare switch-on stays refused: adding a
  // student is the way a seat switches on.
  const isFreeSeat = seatKind(seat) === 'free';
  if (isFreeSeat) {
    if (params.active) {
      throw httpError(409, 'A seat only switches on when a student is added to it. Use Add student to put one on this seat.');
    }
    if (!String(seat.studentUid || '')) {
      throw httpError(409, 'Seat is already vacant.');
    }
  }

  if (!params.active) {
    const uid = String(seat.studentUid || '');
    const name = String(seat.studentName || '');
    const { daysUsed } = isFreeSeat ? { daysUsed: 0 } : seatUsage(seat, now);
    await adminDb.runTransaction(async (tx) => {
      const history: any[] = Array.isArray(seat.history) ? seat.history.slice(-50) : [];
      // Firestore requires every read inside a transaction to run before the
      // first write, so the billing counter is read up front.
      const billingRef = adminDb.collection('centreBilling').doc(params.centreId);
      let used = 0;
      if (uid) {
        const bDoc = await tx.get(billingRef);
        used = Number((bDoc.data() as any)?.activeStudentCount || 0);
        history.push({
          uid,
          name,
          from: seat.assignedAt || seat.startedAt || null,
          to: nowIso,
          reason: 'seat switched off',
        });
        tx.set(
          adminDb.collection('memberships').doc(`${uid}__${params.centreId}`),
          { status: 'disabled', seatId: '', seatNo: 0, lastAccessToggledAt: nowIso, updatedAt: nowIso },
          { merge: true }
        );
        tx.set(
          adminDb.collection('students').doc(uid),
          { accessStatus: 'off' },
          { merge: true }
        );
        tx.set(billingRef, { activeStudentCount: Math.max(0, used - 1) }, { merge: true });
      }
      tx.set(
        seatRef,
        {
          status: 'available',
          startedAt: null,
          studentUid: '',
          studentName: '',
          assignedAt: null,
          ...(isFreeSeat ? { daysUsedBase: 0 } : { runMs: freezeSeatRunMs(seat, now) }),
          history,
          freedAt: nowIso,
        },
        { merge: true }
      );
    });
    try {
      await adminDb.collection('auditLogs').add({
        actorUid: params.actorUid,
        centreId: params.centreId,
        action: 'SEAT_SWITCHED_OFF',
        seatNo: Number(seat.seatNo || 0),
        studentUid: uid || null,
        at: nowIso,
      });
    } catch {
      /* audit is best effort */
    }
    return {
      success: true,
      seatNo: Number(seat.seatNo || 0),
      status: 'available',
      daysUsed,
      remaining: Math.max(0, Number(seat.daysTotal || 30) - daysUsed),
      detachedStudent: uid ? name || uid : undefined,
    };
  }

  // Batch 21: an empty seat never runs. The only way a seat switches on is a
  // student being added to it, so a bare switch-on is refused.
  if (!String(seat.studentUid || '')) {
    throw httpError(
      409,
      'A seat only switches on when a student is added to it. Use Add student to put one on this seat.'
    );
  }

  // Switch on: this seat is being brought back with its student on it, so the
  // daily count starts now.
  await seatRef.set({ status: 'active', startedAt: nowIso, switchedOnAt: nowIso }, { merge: true });
  const fresh = (await seatRef.get()).data() as any;
  const { daysUsed, remaining } = seatUsage(fresh, now);
  try {
    await adminDb.collection('auditLogs').add({
      actorUid: params.actorUid,
      centreId: params.centreId,
      action: 'SEAT_SWITCHED_ON',
      seatNo: Number(seat.seatNo || 0),
      at: nowIso,
    });
  } catch {
    /* audit is best effort */
  }
  return { success: true, seatNo: Number(seat.seatNo || 0), status: 'active', daysUsed, remaining };
}

/** Attach a student to one specific seat from the control room. A banked seat
 *  starts counting the day it takes the student; a seat already counting
 *  keeps its clock. The student must not already hold a running seat. */
export async function assignStudentToSeatService(params: {
  actorUid: string;
  actorEmail: string;
  centreId: string;
  seatId: string;
  studentUid: string;
  tos?: boolean;
}): Promise<{ success: boolean; seatNo: number; daysUsed: number; remaining: number }> {
  const caller: Caller = {
    uid: params.actorUid,
    email: params.actorEmail,
    tos: Boolean(params.tos),
    claims: {},
  };
  await verifyAdminOrOwner(caller, params.centreId);

  const billing = await getBillingDoc(params.centreId);
  const centre = await getCentreDoc(params.centreId);
  const config = await getPlatformConfig();
  try {
    await ensureSeatsForCentre(params.centreId, { billing, trialSeatCap: Number((config as any)?.trialSeatCap || 10), freeSeats: freeSeatAllocation(config, billing) });
  } catch {
    /* seeding retries on the next seats read */
  }
  try {
    await lockExpiredSeatsForCentre(params.centreId, { centreName: centre?.name || '' });
  } catch {
    /* the sweep also locks expired seats */
  }

  const seatRef = adminDb.collection('centreSeats').doc(params.seatId);
  const seatDoc = await seatRef.get();
  if (!seatDoc.exists || (seatDoc.data() as any)?.centreId !== params.centreId) {
    throw httpError(404, 'Seat not found in this facility.');
  }
  const seat = seatDoc.data() as any;
  if (seat.status === 'locked') {
    throw httpError(
      409,
      `Seat ${seat.seatNo} completed its days and is locked. A new payment reopens it.`
    );
  }
  if (String(seat.studentUid || '')) {
    throw httpError(
      409,
      `Seat ${seat.seatNo} already has ${seat.studentName || 'a student'} on it. Switch that student off first.`
    );
  }

  // Batch 22: the free-seat grant only unlocks once the facility has paid
  // for at least the platform minimum (trial facilities are always open).
  if (seatKind(seat) === 'free' && !(await freeSeatsUnlockedFor(params.centreId, billing, config))) {
    const minimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
    throw httpError(
      409,
      `Free seats unlock once your facility has paid for at least ${minimum} seats. Record a payment first.`
    );
  }

  const holding = await adminDb
    .collection('centreSeats')
    .where('centreId', '==', params.centreId)
    .where('studentUid', '==', params.studentUid)
    .where('status', '==', 'active')
    .get();
  if (!holding.empty) {
    const heldNo = Number((holding.docs[0].data() as any).seatNo || 0);
    throw httpError(409, `This student already holds Seat ${heldNo}. Switch them off there first.`);
  }

  let studentName = '';
  try {
    const stuDoc = await adminDb.collection('students').doc(params.studentUid).get();
    studentName = String((stuDoc.data() as any)?.name || '');
  } catch {
    /* the seat still shows its number */
  }

  const nowIso = new Date().toISOString();
  const preSeedCount = await countActiveStudents(params.centreId);
  const wasAvailable = seat.status !== 'active';

  await adminDb.runTransaction(async (tx) => {
    const memRef = adminDb.collection('memberships').doc(`${params.studentUid}__${params.centreId}`);
    const billingRef = adminDb.collection('centreBilling').doc(params.centreId);
    const [memDoc, billingDoc] = await Promise.all([tx.get(memRef), tx.get(billingRef)]);
    if (!memDoc.exists) throw httpError(404, 'Student membership not found.');

    tx.set(
      memRef,
      { status: 'active', seatId: seatRef.id, seatNo: Number(seat.seatNo || 0), lastAccessToggledAt: nowIso, updatedAt: nowIso },
      { merge: true }
    );
    tx.set(
      seatRef,
      {
        status: 'active',
        studentUid: params.studentUid,
        studentName,
        assignedAt: nowIso,
        ...(wasAvailable ? { startedAt: nowIso } : {}),
      },
      { merge: true }
    );
    tx.set(
      adminDb.collection('students').doc(params.studentUid),
      { accessStatus: 'active' },
      { merge: true }
    );
    const used = Math.min(
      Number((billingDoc.data() as any)?.activeStudentCount ?? preSeedCount),
      preSeedCount
    );
    tx.set(billingRef, { activeStudentCount: used + 1 }, { merge: true });
  });

  try {
    await adminDb.collection('auditLogs').add({
      actorUid: params.actorUid,
      centreId: params.centreId,
      action: 'STUDENT_SEAT_ASSIGNED',
      studentUid: params.studentUid,
      seatNo: Number(seat.seatNo || 0),
      at: nowIso,
    });
  } catch {
    /* audit is best effort */
  }

  const fresh = (await seatRef.get()).data() as any;
  const { daysUsed, remaining } = seatUsage(fresh, new Date());
  return { success: true, seatNo: Number(seat.seatNo || 0), daysUsed, remaining };
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
  // One-time pool tidy-up (free seats first, no default paid seats): runs on
  // the seats summary read the facility panel makes, guarded in seatDays.
  try { await reconcileSeatOrder(centreId); } catch { /* retried on the next seats read */ }
  const billing = await getBillingDoc(centreId);
  const centre = await getCentreDoc(centreId);
  const config = await getPlatformConfig();
  const status = effectiveStatus(centre, billing, config);

  let used = 0;
  const studentAccess: Record<
    string,
    { status: MembershipStatus; lastToggledAt?: string; seatNo?: number; seatRemaining?: number }
  > = {};

  try {
    const mSnap = await adminDb
      .collection('memberships')
      .where('centreId', '==', centreId)
      .where('role', '==', 'student')
      .get();

    mSnap.forEach((docSnap) => {
      const data = docSnap.data();
      studentAccess[data.uid] = {
        status: data.status,
        lastToggledAt: data.lastAccessToggledAt || data.updatedAt,
      };
      if (data.status === 'active') used++;
    });
  } catch (err) {
    dbFailure('getSeatsSummaryService', err);
  }

  // Seat-days: seed the pool on first read, lock seats whose days ran out,
  // then expose the whole pool for the control room.
  let seats: SeatSummary[] = [];
  try {
    await ensureSeatsForCentre(centreId, { billing, trialSeatCap: Number((config as any)?.trialSeatCap || 10), freeSeats: freeSeatAllocation(config, billing) });
    try { await reconcileFreeSeats(centreId, freeSeatAllocation(config, billing)); } catch { /* tops up on the next read */ }
    await lockExpiredSeatsForCentre(centreId, { centreName: centre?.name || '' });
    const seatDocs = await listSeats(centreId);
    const now = new Date();
    const seatByUid = new Map<string, { seatNo: number; remaining: number }>();
    seats = seatDocs.map((d) => {
      const s = d.data() as any;
      const { daysUsed, remaining } = seatUsage(s, now);
      const summary: SeatSummary = {
        id: d.id,
        seatNo: Number(s.seatNo || 0),
        status: (s.status || 'available') as SeatStatus,
        kind: seatKind(s),
        daysTotal: Number(s.daysTotal || 30),
        daysUsed,
        remaining,
        startedAt: s.startedAt || null,
        studentUid: s.studentUid || '',
        studentName: s.studentName || '',
        assignedAt: s.assignedAt || null,
        history: Array.isArray(s.history) ? s.history : [],
      };
      if (summary.status === 'active' && summary.studentUid) {
        seatByUid.set(summary.studentUid, { seatNo: summary.seatNo, remaining: summary.remaining });
      }
      return summary;
    });
    // Free seats render first, above a divider; paid seats follow.
    seats.sort((a, b) => {
      const ka = (a as any).kind === 'free' ? 0 : 1;
      const kb = (b as any).kind === 'free' ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return a.seatNo - b.seatNo;
    });
    for (const [uid, info] of seatByUid) {
      if (studentAccess[uid]) {
        studentAccess[uid].seatNo = info.seatNo;
        studentAccess[uid].seatRemaining = info.remaining;
      }
    }
  } catch (err) {
    dbFailure('getSeatsSummaryService(seats)', err);
  }

  const pool: SeatPool = {
    total: seats.length,
    active: seats.filter((s) => s.status === 'active').length,
    available: seats.filter((s) => s.status === 'available').length,
    locked: seats.filter((s) => s.status === 'locked').length,
    bankedDays: seats.filter((s) => s.status === 'available').reduce((n, s) => n + s.remaining, 0),
  };

  let trialDaysLeft: number | undefined;
  if (status === 'trial' && billing?.trialEndsAt) {
    const diff = new Date(billing.trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const paidSeatsHeld = seats.filter((s) => (s as any).kind !== 'free').length;
  const paidSeatMinimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
  const freeSeatsAllocated = freeSeatAllocation(config, billing);
  const freeSeatsUnlocked = isOnTrial(billing) || paidSeatsHeld >= paidSeatMinimum;

  return {
    used,
    cap: pool.total,
    isTrial: status === 'trial',
    trialDaysLeft,
    trialEndsAt: billing?.trialEndsAt || null,
    studentAccess,
    seats,
    pool,
    freeSeatsAllocated,
    freeSeatsUnlocked,
    paidSeatsHeld,
    paidSeatMinimum,
  };
}

/** Subscription status for one centre, for use by route middleware. */
export async function getCentreSubscriptionStatus(centreId: string): Promise<EffectiveStatus> {
  const centre = await getCentreDoc(centreId);
  if (!centre) throw httpError(404, 'Facility not found.');
  const billing = await getBillingDoc(centreId);
  const config = await getPlatformConfig();
  return effectiveStatus(centre, billing, config);
}
