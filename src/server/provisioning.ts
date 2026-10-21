import * as crypto from 'crypto';
import { adminAuth, adminDb } from './firebaseAdmin';
import {
  effectiveStatus,
  getPlatformConfig,
  getPlatformPlan,
  httpError,
} from './tenantService';
import {
  buildAccessCodeChangedEmail,
  buildWelcomeEmail,
  sendEmail,
} from './email';

/**
 * Server-side provisioning (Prompt C Part B).
 *
 * Guarantees:
 *  - A temporary password is generated with crypto, sent by email exactly
 *    once, and NEVER stored in Firestore or written to a log. When no email
 *    provider is configured, the fresh password is returned to the calling
 *    TOS endpoint so staff can show it once in the portal instead.
 *  - Every business number (prices, caps, trial length, discount) comes from
 *    platformPlans / platformConfig in Firestore. Nothing is hard-coded.
 *  - Access codes are 6 digits, generated server-side, claimed transactionally.
 *  - Every provisioning action writes an auditLogs entry.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

export interface ProvisionLead {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  studentCount: number;
  state: string;
  city: string;
  examTypes: string[];
  skipTrial: boolean;
}

export interface ProvisionResult {
  uid: string;
  createdAuthUser: boolean;
  centreId: string;
  centreName: string;
  accessCode: string;
  /** Present only when freshly generated. Returned once; never persisted. */
  tempPassword?: string;
  welcomeDelivered: boolean;
  credentialsNotDelivered: boolean;
}

/** Claim a 6-digit code transactionally: retry until a free code is created. */
export async function createAccessCode(centreId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomInt(100000, 1000000).toString();
    const created = await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('accessCodes').doc(code);
      const existing = await tx.get(ref);
      if (existing.exists) return false;
      tx.set(ref, { centreId, createdAt: new Date().toISOString(), active: true });
      return true;
    });
    if (created) return code;
  }
  throw httpError(500, 'Could not generate a unique access code. Please try again.');
}

/** Claim one specific 6-digit code for a brand-new centre: it must be free. */
async function claimPreferredAccessCode(centreId: string, requested: string): Promise<string> {
  const code = (requested || '').trim();
  if (!/^\d{6}$/.test(code)) throw httpError(400, 'The access code must be exactly 6 digits.');
  const claimed = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection('accessCodes').doc(code);
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    tx.set(ref, { centreId, createdAt: new Date().toISOString(), active: true, setBy: 'tos' });
    return true;
  });
  if (!claimed) throw httpError(409, 'That access code is already in use. Pick a different one.');
  return code;
}

export async function provisionCentre(
  params: ProvisionLead & { source: 'lead' | 'tos'; actorUid: string; planId?: string; tempPassword?: string; preferredAccessCode?: string }
): Promise<ProvisionResult> {
  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.phone);
  const fullName = (params.fullName || '').trim();
  const businessName = (params.businessName || '').trim();
  if (!fullName || !businessName || !email || !phone) {
    throw httpError(400, 'Name, business name, email and phone are required.');
  }
  // A hand-set temporary password (the portal's Generate button) must still
  // meet the same policy a generated one does.
  if (params.tempPassword) {
    const pw = params.tempPassword;
    if (pw.length < 10 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      throw httpError(400, 'The temporary password must be 10 to 72 characters with at least one letter and one number.');
    }
  }

  // One trial per person: the normalised email or phone may already own a
  // centre. (Soft warning only for a matching business name; TOS decides.)
  const dupEmail = await adminDb.collection('centres').where('ownerEmail', '==', email).limit(1).get();
  const dupPhone = await adminDb.collection('centres').where('ownerPhone', '==', phone).limit(1).get();
  if (!dupEmail.empty || !dupPhone.empty) {
    throw httpError(409, 'A centre already exists for these details. Sign in instead, or contact Tutorial OS support.');
  }
  const dupName = await adminDb.collection('centres').where('name', '==', businessName).limit(1).get();
  if (!dupName.empty) {
    console.warn(`[provisioning] business name "${businessName}" already exists (owner: ${dupName.docs[0].data()?.ownerEmail}); new owner: ${email}`);
  }

  // Firebase Auth user. An existing account is reused without touching its
  // password; a new account gets a random temporary password (never stored).
  let uid: string;
  let createdAuthUser = false;
  let tempPassword: string | undefined;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      console.error('[provisioning] auth lookup failed:', err?.code || err);
      throw httpError(500, 'Could not look up the account. Please try again.');
    }
    tempPassword = params.tempPassword || crypto.randomBytes(12).toString('base64url'); // provided or generated
    const created = await adminAuth.createUser({
      email,
      password: tempPassword,
      displayName: fullName,
      emailVerified: false,
    });
    uid = created.uid;
    createdAuthUser = true;
    await adminAuth.setCustomUserClaims(uid, {
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    });
  }

  // Centre id: slug plus a short random suffix, collision-checked.
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'centre';
  let centreId = '';
  for (let i = 0; i < 5 && !centreId; i++) {
    const candidate = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    if (!(await adminDb.collection('centres').doc(candidate).get()).exists) centreId = candidate;
  }
  if (!centreId) throw httpError(500, 'Could not allocate a centre id. Please try again.');

  const config = await getPlatformConfig();
  const planId = params.planId || 'centre_standard';
  const plan = await getPlatformPlan(planId);
  const now = new Date();
  const trialDays = (plan as any).trialDays ?? config.trialDays;
  const billedSeatsMinimum = (plan as any).billedSeatsMinimum ?? (config as any).billedSeatsMinimum ?? 10; // mirrors the seeded value

  const centreRef = adminDb.collection('centres').doc(centreId);
  await centreRef.set({
    name: businessName,
    status: params.skipTrial ? 'pending_payment' : 'trial',
    ownerUid: uid,
    ownerEmail: email,
    ownerPhone: phone,
    ownerName: fullName,
    contact: { state: (params.state || '').trim(), city: (params.city || '').trim() },
    audienceTypes: (params.examTypes || []).filter(Boolean),
    expectedStudentCount: params.studentCount,
    autoApproveStudents: true,
    createdAt: now.toISOString(),
    credentialsNotDelivered: false,
  });

  await adminDb.collection('centreBilling').doc(centreId).set({
    centreId,
    planId,
    // During the trial the cap is the plan's trial cap; after skip-trial the
    // full plan cap applies (students still wait for the first payment).
    seatCap: params.skipTrial ? plan.seatCap : (plan.trialSeatCap || plan.seatCap),
    billedSeatsMinimum,
    trialStartsAt: params.skipTrial ? null : now.toISOString(),
    trialEndsAt: params.skipTrial ? null : new Date(now.getTime() + trialDays * DAY_MS).toISOString(),
    skippedTrial: params.skipTrial,
    discountPct: params.skipTrial ? (config.skipTrialDiscountPct ?? 0) : 0,
    paidThrough: null,
    notes: params.skipTrial
      ? 'Skipped the trial; students cannot enter until the first payment is recorded.'
      : 'Trial running on the standard feature set.',
  });

  await adminDb.collection('memberships').doc(`${uid}__${centreId}`).set({
    uid,
    centreId,
    role: 'owner',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const accessCode = params.preferredAccessCode
    ? await claimPreferredAccessCode(centreId, params.preferredAccessCode)
    : await createAccessCode(centreId);
  await centreRef.update({ accessCode });

  const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  const emailRes = await sendEmail(
    buildWelcomeEmail({
      to: email,
      fullName,
      centreName: businessName,
      loginEmail: email,
      tempPassword,
      accessCode,
      appUrl,
    })
  );
  const credentialsNotDelivered = !!tempPassword && !emailRes.delivered;
  if (credentialsNotDelivered) {
    await centreRef.update({ credentialsNotDelivered: true });
  }

  await adminDb.collection('auditLogs').add({
    actorUid: params.actorUid || `system:${params.source}`,
    centreId,
    action: 'CENTRE_PROVISIONED',
    at: now.toISOString(),
    after: {
      source: params.source,
      planId,
      skipTrial: params.skipTrial,
      createdAuthUser,
      ownerEmail: email,
      accessCode,
      welcomeDelivered: emailRes.delivered,
    },
  });

  return {
    uid,
    createdAuthUser,
    centreId,
    centreName: businessName,
    accessCode,
    ...(tempPassword ? { tempPassword } : {}),
    welcomeDelivered: emailRes.delivered,
    credentialsNotDelivered,
  };
}

/** TOS action: fresh temporary password for the owner, sent (or shown once). */
export async function resendCredentials(centreId: string, actorUid: string): Promise<{ delivered: boolean; tempPassword?: string }> {
  const cDoc = await adminDb.collection('centres').doc(centreId).get();
  if (!cDoc.exists) throw httpError(404, 'Centre not found.');
  const centre = cDoc.data() as any;
  const email = normalizeEmail(centre?.ownerEmail || '');
  if (!email) throw httpError(400, 'This centre has no owner email on file.');

  let user;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch {
    throw httpError(404, 'The owner account does not exist yet. Ask them to sign up first.');
  }

  const tempPassword = crypto.randomBytes(12).toString('base64url');
  await adminAuth.updateUser(user.uid, { password: tempPassword });
  await adminAuth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    mustChangePassword: true,
    tempPasswordExpiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
  });

  const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  const emailRes = await sendEmail(
    buildWelcomeEmail({
      to: email,
      centreName: centre.name || centreId,
      loginEmail: email,
      tempPassword,
      accessCode: centre.accessCode || undefined,
      appUrl,
      resend: true,
    })
  );

  await cDoc.ref.update({ credentialsNotDelivered: !emailRes.delivered });
  await adminDb.collection('auditLogs').add({
    actorUid,
    centreId,
    action: 'CREDENTIALS_RESENT',
    at: new Date().toISOString(),
    after: { delivered: emailRes.delivered },
  });

  return emailRes.delivered ? { delivered: true } : { delivered: false, tempPassword };
}

/** Regenerate the access code: the old one stops working immediately. */
export async function regenerateAccessCode(
  centreId: string,
  actorUid: string,
  source: 'tos' | 'owner'
): Promise<{ accessCode: string; previousCode: string | null }> {
  const cRef = adminDb.collection('centres').doc(centreId);
  const cDoc = await cRef.get();
  if (!cDoc.exists) throw httpError(404, 'Centre not found.');
  const centre = cDoc.data() as any;
  const previousCode: string | null = centre?.accessCode || null;

  const accessCode = await createAccessCode(centreId);
  await cRef.update({ accessCode });
  if (previousCode) {
    await adminDb.collection('accessCodes').doc(previousCode).delete().catch(() => {});
  }

  await adminDb.collection('auditLogs').add({
    actorUid,
    centreId,
    action: 'ACCESS_CODE_REGENERATED',
    at: new Date().toISOString(),
    before: { accessCode: previousCode },
    after: { accessCode, source },
  });

  const ownerEmail = normalizeEmail(centre?.ownerEmail || '');
  if (ownerEmail) {
    const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
    await sendEmail(
      buildAccessCodeChangedEmail({ to: ownerEmail, centreName: centre?.name || centreId, accessCode, appUrl })
    );
  }
  return { accessCode, previousCode };
}

/**
 * TOS sets a specific access code for an existing centre (Prompt F item 3).
 * The code is claimed transactionally so two centres can never share one; the
 * previous mapping is removed so the old code stops working immediately.
 */
export async function setAccessCode(
  centreId: string,
  requestedCode: string,
  actorUid: string,
  source: 'tos' | 'owner'
): Promise<{ accessCode: string; previousCode: string | null }> {
  const code = (requestedCode || '').trim();
  if (!/^\d{6}$/.test(code)) throw httpError(400, 'The access code must be exactly 6 digits.');
  const cRef = adminDb.collection('centres').doc(centreId);
  const cDoc = await cRef.get();
  if (!cDoc.exists) throw httpError(404, 'Centre not found.');
  const centre = cDoc.data() as any;
  const previousCode: string | null = centre?.accessCode || null;
  if (previousCode === code) return { accessCode: code, previousCode };

  const claimed = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection('accessCodes').doc(code);
    const existing = await tx.get(ref);
    if (existing.exists) {
      const holder = existing.data()?.centreId;
      if (holder && holder !== centreId) return false;
    }
    tx.set(ref, { centreId, createdAt: new Date().toISOString(), active: true, setBy: source });
    return true;
  });
  if (!claimed) throw httpError(409, 'That access code is already used by another centre. Choose a different one.');

  await cRef.update({ accessCode: code });
  if (previousCode) {
    await adminDb.collection('accessCodes').doc(previousCode).delete().catch(() => {});
  }
  await adminDb.collection('auditLogs').add({
    actorUid,
    centreId,
    action: 'ACCESS_CODE_SET',
    at: new Date().toISOString(),
    before: { accessCode: previousCode },
    after: { accessCode: code, source },
  });

  const ownerEmail = normalizeEmail(centre?.ownerEmail || '');
  if (ownerEmail) {
    const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
    await sendEmail(
      buildAccessCodeChangedEmail({ to: ownerEmail, centreName: centre?.name || centreId, accessCode: code, appUrl })
    );
  }
  return { accessCode: code, previousCode };
}

/** Clear the first-login flags after the owner set their own password. */
export async function completeFirstLogin(uid: string): Promise<{ ok: true; changed: boolean }> {
  const user = await adminAuth.getUser(uid);
  const claims = (user.customClaims || {}) as Record<string, any>;
  if (!claims.mustChangePassword) return { ok: true, changed: false };
  const next = { ...claims };
  delete next.mustChangePassword;
  delete next.tempPasswordExpiresAt;
  await adminAuth.setCustomUserClaims(uid, next);
  return { ok: true, changed: true };
}

/**
 * Billing sweep (Prompt C Part E). Recomputes the effective status for every
 * centre that has a billing document and materialises the one transition the
 * product rules require: a centre past its trial or paid period plus the
 * grace days becomes suspended. Staff suspensions are never touched, legacy
 * centres without billing are left alone, and every suspension is audited.
 */
export async function runBillingSweep(): Promise<{
  scanned: number;
  suspended: string[];
  skipped: number;
  errors: number;
}> {
  const config = await getPlatformConfig();
  const centresSnap = await adminDb.collection('centres').limit(200).get();
  const suspended: string[] = [];
  let skipped = 0;
  let errors = 0;

  for (const doc of centresSnap.docs) {
    try {
      const centre = { id: doc.id, ...(doc.data() as any) };
      const bDoc = await adminDb.collection('centreBilling').doc(doc.id).get();
      const billing = bDoc.exists ? (bDoc.data() as any) : null;
      if (!billing) {
        skipped++;
        continue;
      }
      const derived = effectiveStatus(centre as any, billing, config);
      // Diagnostic mirror for the TOS console; never consumed by gating.
      if (centre.billingStatus !== derived) {
        await doc.ref.update({ billingStatus: derived, billingStatusSyncedAt: new Date().toISOString() });
      }
      if (derived === 'suspended' && centre.status !== 'suspended') {
        await doc.ref.update({ status: 'suspended', suspendedReason: 'Billing sweep: trial or paid period ended plus the grace days.' });
        suspended.push(doc.id);
        await adminDb.collection('auditLogs').add({
          actorUid: 'system:billing-sweep',
          centreId: doc.id,
          action: 'BILLING_SWEEP_SUSPENSION',
          at: new Date().toISOString(),
          after: { derived },
        });
      }
    } catch (err: any) {
      errors++;
      console.error('[billing-sweep] centre failed:', doc.id, err?.message || err);
    }
  }

  return { scanned: centresSnap.size, suspended, skipped, errors };
}
