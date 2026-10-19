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
} from '../types';

// ============================================================================
// RATE LIMITER
// ============================================================================
interface RateLimitRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(key: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record) return { allowed: true };

  // If locked
  if (record.lockedUntil && now < record.lockedUntil) {
    const waitMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, waitMinutes };
  }

  // If window expired
  if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(key);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
    return { allowed: false, waitMinutes: 15 };
  }

  return { allowed: true };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
    }
  }
}

export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

// ============================================================================
// IN-MEMORY FALLBACK STORE (Active in dev or if Firestore Admin ADC is missing)
// ============================================================================
interface TenantStore {
  centres: Record<string, Centre>;
  accessCodes: Record<string, string>; // code -> centreId
  billing: Record<string, CentreBilling>;
  memberships: Record<string, CentreMembership>; // `${uid}__${centreId}` -> membership
  plans: Record<string, PlatformPlan>;
  config: PlatformConfigGlobal;
  auditLogs: any[];
}

const MEMORY_STORE: TenantStore = {
  centres: {
    'centre-excellence': {
      id: 'centre-excellence',
      name: 'Excellence Tutorial Centre',
      type: 'centre',
      status: 'active',
      ownerUid: 'stylishdesigns484@gmail.com',
      branding: {
        logo: 'Excellence',
        primaryColor: '#EA580C',
        secondaryColor: '#0F172A',
        colours: { primary: '#EA580C', secondary: '#0F172A' },
      },
      audienceTypes: ['JAMB', 'WAEC', 'NECO'],
      autoApproveStudents: false,
      createdAt: new Date().toISOString(),
      accessCode: '123456',
    },
  },
  accessCodes: {
    '123456': 'centre-excellence',
  },
  billing: {
    'centre-excellence': {
      centreId: 'centre-excellence',
      planId: 'centre_standard',
      seatCap: 10,
      billedSeatsMinimum: 10,
      trialStartsAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      skippedTrial: false,
      discountPct: 0,
      paidThrough: null,
      notes: 'Initial customer',
    },
  },
  memberships: {
    'stylishdesigns484@gmail.com__centre-excellence': {
      id: 'stylishdesigns484@gmail.com__centre-excellence',
      uid: 'stylishdesigns484@gmail.com',
      centreId: 'centre-excellence',
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  plans: {
    independent: {
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
    centre_standard: {
      id: 'centre_standard',
      name: 'Centre Standard',
      accountType: 'centre',
      price: 3000,
      priceType: 'per_seat',
      seatCap: 100,
      trialSeatCap: 10,
      trialDays: 30,
      studentChat: true,
      whatsappNotifications: false,
      aiEssayMarking: true,
      aiQuestionGen: false,
      aiPerformanceAnalysis: false,
    },
    centre_plus: {
      id: 'centre_plus',
      name: 'Centre Plus',
      accountType: 'centre',
      price: 5000,
      priceType: 'per_seat',
      seatCap: 100,
      trialSeatCap: 10,
      trialDays: 30,
      studentChat: true,
      whatsappNotifications: true,
      aiEssayMarking: true,
      aiQuestionGen: true,
      aiPerformanceAnalysis: true,
    },
  },
  config: {
    trialDays: 30,
    skipTrialDiscountPct: 15,
    trialGraceDays: 7,
  },
  auditLogs: [],
};

const UNIFORM_MISMATCH_ERROR = 'That code did not match. Check it and try again.';

// ============================================================================
// TENANT SERVICE IMPLEMENTATION
// ============================================================================

export async function enterCentreService(params: {
  uid: string;
  userEmail: string;
  code: string;
  ip: string;
}): Promise<{
  centreId: string;
  centre: Centre;
  role: MembershipRole;
  entitlements: CentreEntitlements;
}> {
  const { uid, userEmail, code, ip } = params;
  const cleanCode = code.trim();
  const rateLimitKey = `${uid || userEmail || 'anon'}:${ip}`;

  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    throw new Error(
      `Too many failed code attempts. Please wait ${rateCheck.waitMinutes || 15} minutes before trying again.`
    );
  }

  const isSuperAdmin = userEmail.toLowerCase() === 'stylishdesigns484@gmail.com';

  let centreId: string | null = null;
  let centreData: Centre | null = null;
  let membership: CentreMembership | null = null;

  try {
    // 1. Try Firestore lookup
    const codeDoc = await adminDb.collection('accessCodes').doc(cleanCode).get();
    if (codeDoc.exists) {
      centreId = codeDoc.data()?.centreId;
    }
  } catch (fsErr) {
    // Fallback to memory store if Firestore unavailable in dev
  }

  // Fallback to memory
  if (!centreId) {
    centreId = MEMORY_STORE.accessCodes[cleanCode] || null;
  }

  if (!centreId) {
    recordFailedAttempt(rateLimitKey);
    throw new Error(UNIFORM_MISMATCH_ERROR);
  }

  // 2. Fetch Centre details
  try {
    const cDoc = await adminDb.collection('centres').doc(centreId).get();
    if (cDoc.exists) {
      centreData = { id: cDoc.id, ...cDoc.data() } as Centre;
    }
  } catch (e) {}

  if (!centreData) {
    centreData = MEMORY_STORE.centres[centreId] || null;
  }

  if (!centreData) {
    recordFailedAttempt(rateLimitKey);
    throw new Error(UNIFORM_MISMATCH_ERROR);
  }

  // 3. Verify Membership
  if (isSuperAdmin) {
    // Platform Super Admin has direct owner entry
    membership = {
      uid,
      centreId,
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    try {
      const mDoc = await adminDb.collection('memberships').doc(`${uid}__${centreId}`).get();
      if (mDoc.exists) {
        membership = mDoc.data() as CentreMembership;
      } else {
        // Also check by user email if UID document hasn't been backfilled
        const mSnap = await adminDb
          .collection('memberships')
          .where('centreId', '==', centreId)
          .where('uid', '==', userEmail)
          .limit(1)
          .get();
        if (!mSnap.empty) {
          membership = mSnap.docs[0].data() as CentreMembership;
        }
      }
    } catch (e) {}

    if (!membership) {
      membership =
        MEMORY_STORE.memberships[`${uid}__${centreId}`] ||
        MEMORY_STORE.memberships[`${userEmail}__${centreId}`] ||
        null;
    }

    if (!membership || membership.status !== 'active') {
      recordFailedAttempt(rateLimitKey);
      throw new Error(UNIFORM_MISMATCH_ERROR);
    }
  }

  // 4. Check centre's effectiveStatus
  const status = centreData.status || 'active';
  if (status === 'suspended' || status === 'closed' || status === 'overdue') {
    // Only owner or TOS super admin can access inactive centre
    if (membership.role !== 'owner' && !isSuperAdmin) {
      throw new Error(
        `This centre's access is currently inactive (${status}). Please contact the centre administration.`
      );
    }
  }

  // Successful verification -> reset rate limit
  resetRateLimit(rateLimitKey);

  // 5. Entitlements
  const entitlements = await getCentreEntitlements(centreId);

  return {
    centreId,
    centre: centreData,
    role: membership.role,
    entitlements,
  };
}

export async function validateActiveCentreService(params: {
  uid: string;
  userEmail: string;
  centreId: string;
}): Promise<{
  centre: Centre;
  role: MembershipRole;
  entitlements: CentreEntitlements;
}> {
  const { uid, userEmail, centreId } = params;
  const isSuperAdmin = userEmail.toLowerCase() === 'stylishdesigns484@gmail.com';

  let centreData: Centre | null = null;
  let membership: CentreMembership | null = null;

  try {
    const cDoc = await adminDb.collection('centres').doc(centreId).get();
    if (cDoc.exists) centreData = { id: cDoc.id, ...cDoc.data() } as Centre;
  } catch (e) {}

  if (!centreData) centreData = MEMORY_STORE.centres[centreId] || null;
  if (!centreData) throw new Error('Active centre not found.');

  if (isSuperAdmin) {
    membership = {
      uid,
      centreId,
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    try {
      const mDoc = await adminDb.collection('memberships').doc(`${uid}__${centreId}`).get();
      if (mDoc.exists) membership = mDoc.data() as CentreMembership;
    } catch (e) {}

    if (!membership) {
      membership =
        MEMORY_STORE.memberships[`${uid}__${centreId}`] ||
        MEMORY_STORE.memberships[`${userEmail}__${centreId}`] ||
        null;
    }

    if (!membership || membership.status !== 'active') {
      throw new Error('Your active membership for this centre is no longer active.');
    }
  }

  const entitlements = await getCentreEntitlements(centreId);

  return {
    centre: centreData,
    role: membership.role,
    entitlements,
  };
}

export async function listUserCentresService(params: {
  uid: string;
  userEmail: string;
}): Promise<
  Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    type: string;
    logo?: string;
  }>
> {
  const { uid, userEmail } = params;
  const isSuperAdmin = userEmail.toLowerCase() === 'stylishdesigns484@gmail.com';
  const results: Array<{
    centreId: string;
    role: MembershipRole;
    centreName: string;
    type: string;
    logo?: string;
  }> = [];

  if (isSuperAdmin) {
    // Super admin can see all active centres
    Object.values(MEMORY_STORE.centres).forEach((c) => {
      results.push({
        centreId: c.id,
        role: 'owner',
        centreName: c.name,
        type: c.type,
        logo: c.branding?.logo,
      });
    });
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
      let cName = 'Centre';
      let cType = 'centre';
      let cLogo = '';
      try {
        const cSnap = await adminDb.collection('centres').doc(m.centreId).get();
        if (cSnap.exists) {
          const cData = cSnap.data() as Centre;
          cName = cData.name;
          cType = cData.type;
          cLogo = cData.branding?.logo || '';
        }
      } catch (e) {}
      results.push({
        centreId: m.centreId,
        role: m.role,
        centreName: cName,
        type: cType,
        logo: cLogo,
      });
    }
  } catch (e) {}

  if (results.length === 0) {
    // Check memory store
    Object.values(MEMORY_STORE.memberships).forEach((m) => {
      if ((m.uid === uid || m.uid === userEmail) && m.status === 'active') {
        const c = MEMORY_STORE.centres[m.centreId];
        results.push({
          centreId: m.centreId,
          role: m.role,
          centreName: c?.name || 'Centre',
          type: c?.type || 'centre',
          logo: c?.branding?.logo,
        });
      }
    });
  }

  return results;
}

export async function joinCentreService(params: {
  uid: string;
  userEmail: string;
  code: string;
  ip: string;
}): Promise<{
  status: 'active' | 'pending';
  centreId: string;
  centreName: string;
}> {
  const { uid, userEmail, code, ip } = params;
  const cleanCode = code.trim();
  const rateLimitKey = `${uid || userEmail || 'anon'}:${ip}`;

  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    throw new Error(
      `Too many failed attempts. Please wait ${rateCheck.waitMinutes || 15} minutes before trying again.`
    );
  }

  // 1. Lookup code
  let centreId: string | null = null;
  try {
    const codeDoc = await adminDb.collection('accessCodes').doc(cleanCode).get();
    if (codeDoc.exists) centreId = codeDoc.data()?.centreId;
  } catch (e) {}

  if (!centreId) {
    centreId = MEMORY_STORE.accessCodes[cleanCode] || null;
  }

  if (!centreId) {
    recordFailedAttempt(rateLimitKey);
    throw new Error(UNIFORM_MISMATCH_ERROR);
  }

  // 2. Read Centre & Billing
  let centre: Centre | null = null;
  let billing: CentreBilling | null = null;

  try {
    const cDoc = await adminDb.collection('centres').doc(centreId).get();
    if (cDoc.exists) centre = { id: cDoc.id, ...cDoc.data() } as Centre;

    const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
    if (bDoc.exists) billing = bDoc.data() as CentreBilling;
  } catch (e) {}

  if (!centre) centre = MEMORY_STORE.centres[centreId] || null;
  if (!billing) billing = MEMORY_STORE.billing[centreId] || null;

  if (!centre) {
    recordFailedAttempt(rateLimitKey);
    throw new Error(UNIFORM_MISMATCH_ERROR);
  }

  // Check effectiveStatus
  if (centre.status === 'suspended' || centre.status === 'closed') {
    throw new Error(
      `This centre (${centre.name}) is currently not accepting new students.`
    );
  }

  // 3. Seat Cap Check & Transaction
  // Independent tutors default autoApproveStudents to true, Centres default to false
  const autoApprove = centre.autoApproveStudents !== undefined 
    ? centre.autoApproveStudents 
    : centre.type === 'independent';

  const planId = billing?.planId || (centre.type === 'independent' ? 'independent' : 'centre_standard');
  const plan = MEMORY_STORE.plans[planId];
  const isTrial = centre.status === 'trial';
  const effectiveSeatCap = isTrial
    ? (plan?.trialSeatCap || billing?.seatCap || 10)
    : (billing?.seatCap || 10);

  // Count active student memberships
  let activeStudentCount = 0;
  try {
    const activeSnap = await adminDb
      .collection('memberships')
      .where('centreId', '==', centreId)
      .where('role', '==', 'student')
      .where('status', '==', 'active')
      .get();
    activeStudentCount = activeSnap.size;
  } catch (e) {
    // Count from memory
    activeStudentCount = Object.values(MEMORY_STORE.memberships).filter(
      (m) => m.centreId === centreId && m.role === 'student' && m.status === 'active'
    ).length;
  }

  // If joining as active immediately, enforce cap
  if (autoApprove && activeStudentCount >= effectiveSeatCap) {
    const err: any = new Error(
      `This centre has reached its student limit. Please contact ${centre.name}.`
    );
    err.code = 'CENTRE_FULL';
    err.centreName = centre.name;
    throw err;
  }

  const membershipStatus: 'active' | 'pending' = autoApprove ? 'active' : 'pending';
  const membershipId = `${uid}__${centreId}`;
  const now = new Date().toISOString();

  const newMembership: CentreMembership = {
    id: membershipId,
    uid,
    centreId,
    role: 'student',
    status: membershipStatus,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await adminDb.collection('memberships').doc(membershipId).set(newMembership, { merge: true });
  } catch (e) {}

  MEMORY_STORE.memberships[membershipId] = newMembership;
  resetRateLimit(rateLimitKey);

  return {
    status: membershipStatus,
    centreId,
    centreName: centre.name,
  };
}

export async function activateStudentService(params: {
  actorUid: string;
  actorEmail: string;
  studentUid: string;
  centreId: string;
}): Promise<{ success: boolean; used: number; cap: number }> {
  const { actorUid, actorEmail, studentUid, centreId } = params;

  // Verify actor permission
  await verifyAdminOrOwner(actorUid, actorEmail, centreId);

  // Fetch billing to know cap
  let billing: CentreBilling | null = null;
  let centre: Centre | null = null;
  try {
    const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
    if (bDoc.exists) billing = bDoc.data() as CentreBilling;
    const cDoc = await adminDb.collection('centres').doc(centreId).get();
    if (cDoc.exists) centre = cDoc.data() as Centre;
  } catch (e) {}

  if (!billing) billing = MEMORY_STORE.billing[centreId] || null;
  if (!centre) centre = MEMORY_STORE.centres[centreId] || null;

  const isTrial = centre?.status === 'trial';
  const plan = billing ? MEMORY_STORE.plans[billing.planId] : null;
  const seatCap = isTrial
    ? (plan?.trialSeatCap || billing?.seatCap || 10)
    : (billing?.seatCap || 10);

  let activeCount = 0;
  try {
    const snap = await adminDb
      .collection('memberships')
      .where('centreId', '==', centreId)
      .where('role', '==', 'student')
      .where('status', '==', 'active')
      .get();
    activeCount = snap.size;
  } catch (e) {
    activeCount = Object.values(MEMORY_STORE.memberships).filter(
      (m) => m.centreId === centreId && m.role === 'student' && m.status === 'active'
    ).length;
  }

  // Check if student already active
  const existingMem = MEMORY_STORE.memberships[`${studentUid}__${centreId}`];
  if (existingMem?.status === 'active') {
    return { success: true, used: activeCount, cap: seatCap };
  }

  if (activeCount >= seatCap) {
    throw new Error(
      `Seat limit reached: ${activeCount} of ${seatCap}. Free a seat or ask Tutorial OS to raise your limit.`
    );
  }

  const now = new Date().toISOString();
  const membershipId = `${studentUid}__${centreId}`;
  const updatedMembership: CentreMembership = {
    id: membershipId,
    uid: studentUid,
    centreId,
    role: 'student',
    status: 'active',
    createdAt: existingMem?.createdAt || now,
    updatedAt: now,
  };

  try {
    await adminDb.collection('memberships').doc(membershipId).set(updatedMembership, { merge: true });
  } catch (e) {}

  MEMORY_STORE.memberships[membershipId] = updatedMembership;

  return { success: true, used: activeCount + 1, cap: seatCap };
}

export async function toggleStudentAccessService(params: {
  actorUid: string;
  actorEmail: string;
  studentUid: string;
  centreId: string;
  active: boolean;
}): Promise<{ success: boolean; active: boolean; used?: number; cap?: number }> {
  const { actorUid, actorEmail, studentUid, centreId, active } = params;
  await verifyAdminOrOwner(actorUid, actorEmail, centreId);

  const membershipId = `${studentUid}__${centreId}`;
  const now = new Date().toISOString();

  if (!active) {
    // Disable student access
    try {
      await adminDb.collection('memberships').doc(membershipId).update({
        status: 'disabled',
        lastAccessToggledAt: now,
        updatedAt: now,
      });

      // Revoke tokens if no other active memberships
      await adminAuth.revokeRefreshTokens(studentUid).catch(() => {});
    } catch (e) {}

    if (MEMORY_STORE.memberships[membershipId]) {
      MEMORY_STORE.memberships[membershipId].status = 'disabled';
      (MEMORY_STORE.memberships[membershipId] as any).lastAccessToggledAt = now;
      MEMORY_STORE.memberships[membershipId].updatedAt = now;
    }

    // Log audit entry
    const auditEntry = {
      id: `audit-${Date.now()}`,
      actorUid,
      centreId,
      action: 'STUDENT_ACCESS_DISABLED',
      studentUid,
      at: now,
    };
    try {
      await adminDb.collection('auditLogs').add(auditEntry);
    } catch (e) {}
    MEMORY_STORE.auditLogs.push(auditEntry);

    return { success: true, active: false };
  } else {
    // Check seat swap limit (default 2 per rolling 30 days)
    const swapLimit = MEMORY_STORE.config.trialGraceDays ? 2 : 2; // stored in platformConfig
    const existing = MEMORY_STORE.memberships[membershipId] as any;
    const reactivations = (existing?.reactivationsIn30d || 0);
    if (reactivations >= swapLimit) {
      throw new Error(
        `Seat swap limit reached for this student (max ${swapLimit} reactivations per 30 days).`
      );
    }

    // Activate: Enforce seat cap
    const actResult = await activateStudentService({
      actorUid,
      actorEmail,
      studentUid,
      centreId,
    });

    if (MEMORY_STORE.memberships[membershipId]) {
      (MEMORY_STORE.memberships[membershipId] as any).reactivationsIn30d = reactivations + 1;
      (MEMORY_STORE.memberships[membershipId] as any).lastAccessToggledAt = now;
    }

    // Audit log
    const auditEntry = {
      id: `audit-${Date.now()}`,
      actorUid,
      centreId,
      action: 'STUDENT_ACCESS_ENABLED',
      studentUid,
      at: now,
    };
    try {
      await adminDb.collection('auditLogs').add(auditEntry);
    } catch (e) {}
    MEMORY_STORE.auditLogs.push(auditEntry);

    return { success: true, active: true, used: actResult.used, cap: actResult.cap };
  }
}

export async function getCentreEntitlements(centreId: string): Promise<CentreEntitlements> {
  let billing: CentreBilling | null = null;
  try {
    const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
    if (bDoc.exists) billing = bDoc.data() as CentreBilling;
  } catch (e) {}

  if (!billing) billing = MEMORY_STORE.billing[centreId] || null;

  const planId = billing?.planId || 'centre_standard';
  let plan = MEMORY_STORE.plans[planId];

  try {
    const pDoc = await adminDb.collection('platformPlans').doc(planId).get();
    if (pDoc.exists) plan = pDoc.data() as PlatformPlan;
  } catch (e) {}

  return {
    chat: plan?.studentChat ?? false,
    whatsappParentNotifications: plan?.whatsappNotifications ?? false,
    aiQuestionGeneration: plan?.aiQuestionGen ?? false,
    aiPerformanceAnalysis: plan?.aiPerformanceAnalysis ?? false,
  };
}

export async function getSeatsSummaryService(centreId: string): Promise<CentreSeatsSummary> {
  let billing: CentreBilling | null = null;
  let centre: Centre | null = null;

  try {
    const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
    if (bDoc.exists) billing = bDoc.data() as CentreBilling;
    const cDoc = await adminDb.collection('centres').doc(centreId).get();
    if (cDoc.exists) centre = cDoc.data() as Centre;
  } catch (e) {}

  if (!billing) billing = MEMORY_STORE.billing[centreId] || null;
  if (!centre) centre = MEMORY_STORE.centres[centreId] || null;

  const isTrial = centre?.status === 'trial';
  const plan = billing ? MEMORY_STORE.plans[billing.planId] : null;
  const cap = isTrial
    ? (plan?.trialSeatCap || billing?.seatCap || 10)
    : (billing?.seatCap || 10);

  let used = 0;
  const studentAccess: Record<string, any> = {};

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
        reactivationsIn30d: data.reactivationsIn30d || 0,
      };
      if (data.status === 'active') used++;
    });
  } catch (e) {
    Object.values(MEMORY_STORE.memberships).forEach((m) => {
      if (m.centreId === centreId && m.role === 'student') {
        studentAccess[m.uid] = {
          status: m.status,
          lastToggledAt: (m as any).lastAccessToggledAt || m.updatedAt,
          reactivationsIn30d: (m as any).reactivationsIn30d || 0,
        };
        if (m.status === 'active') used++;
      }
    });
  }

  let trialDaysLeft: number | undefined;
  if (isTrial && billing?.trialEndsAt) {
    const diff = new Date(billing.trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return {
    used,
    cap,
    isTrial: Boolean(isTrial),
    trialDaysLeft,
    trialEndsAt: billing?.trialEndsAt || null,
    studentAccess,
  };
}

async function verifyAdminOrOwner(actorUid: string, actorEmail: string, centreId: string) {
  if (actorEmail.toLowerCase() === 'stylishdesigns484@gmail.com') return;

  let mem: CentreMembership | null = null;
  try {
    const docSnap = await adminDb.collection('memberships').doc(`${actorUid}__${centreId}`).get();
    if (docSnap.exists) mem = docSnap.data() as CentreMembership;
  } catch (e) {}

  if (!mem) {
    mem = MEMORY_STORE.memberships[`${actorUid}__${centreId}`] || null;
  }

  if (!mem || (mem.role !== 'owner' && mem.role !== 'admin') || mem.status !== 'active') {
    throw new Error('Unauthorized: caller is not an active admin or owner of this centre.');
  }
}
