/**
 * Prompt E item 5: import an existing centre into the platform's tenant
 * model. Two operations, both restricted to TOS staff:
 *
 *  - previewImport(): READ-ONLY. Reads the live database and reports ownership
 *    verification, existing centres/access codes/memberships, per-collection
 *    counts with and without centreId, and exactly what an apply would create
 *    or change. It writes nothing.
 *  - applyImport(): performs the import, only from the console's confirmed
 *    Apply step. Idempotent: every step either overwrites the same
 *    deterministic fields or skips documents that already carry the right
 *    centreId, so running it twice changes nothing the second time. It never
 *    touches AI/Gemini code or collections and never removes an existing
 *    admins record.
 */
import { adminAuth, adminDb } from './firebaseAdmin';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { httpError, getPlatformConfig, getPlatformPlan } from './tenantService';
import { createAccessCode, normalizeEmail } from './provisioning';

const TENANT_COLLECTIONS = [
  'students',
  'tutors',
  'admins',
  'results',
  'admissions',
  'payments',
  'programmes',
  'branches',
  'announcements',
  'subjects',
  'classrooms',
  'timetable',
  'cbt_questions',
  'cbt_exams',
  'activities',
  'classRatings',
  'studyMaterials',
  'mock_grading',
  'attendance_logs',
  'practiceProgress',
  'questionBank',
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ImportParams {
  centreId: string;
  ownerUid: string;
  ownerEmail: string;
  centreName?: string;
  keepOldCodes?: boolean;
}

function cleanParams(params: Partial<ImportParams>): Required<Pick<ImportParams, 'centreId' | 'ownerUid' | 'ownerEmail'>> {
  const centreId = String(params.centreId || '').trim().toLowerCase();
  const ownerUid = String(params.ownerUid || '').trim();
  const ownerEmail = normalizeEmail(String(params.ownerEmail || ''));
  if (!/^[a-z0-9][a-z0-9_-]{2,60}$/.test(centreId)) {
    throw httpError(400, 'Enter the centre id (letters, numbers, dashes; 3 to 60 characters).');
  }
  if (!/^[A-Za-z0-9]{20,64}$/.test(ownerUid)) {
    throw httpError(400, 'Enter the owner uid (the Firebase Auth user id).');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    throw httpError(400, 'Enter the owner email address.');
  }
  return { centreId, ownerUid, ownerEmail };
}

/** Verify through the Admin SDK that the uid really belongs to that email. */
async function resolveOwner(ownerUid: string, ownerEmail: string) {
  let user;
  try {
    user = await adminAuth.getUser(ownerUid);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      throw httpError(404, 'No Firebase Auth account exists with that uid. Check the uid and try again.');
    }
    console.error('[tos-import] owner lookup failed:', err?.code || err);
    throw httpError(500, 'Could not look up the owner account. Please try again.');
  }
  const actualEmail = normalizeEmail(user.email || '');
  return {
    matched: actualEmail === ownerEmail && actualEmail !== '',
    requestedEmail: ownerEmail,
    authEmail: user.email || '',
    emailVerified: user.emailVerified,
    displayName: user.displayName || '',
    disabled: user.disabled,
    createdAt: (user.metadata as any)?.creationTime || '',
    lastSignInAt: (user.metadata as any)?.lastSignInTime || '',
  };
}

/** READ-ONLY survey of everything the import would touch. */
export async function previewImport(params: Partial<ImportParams>) {
  const { centreId, ownerUid, ownerEmail } = cleanParams(params);

  const ownerVerification = await resolveOwner(ownerUid, ownerEmail);

  const centreDoc = await adminDb.collection('centres').doc(centreId).get();
  const centre = centreDoc.exists
    ? {
        id: centreDoc.id,
        name: centreDoc.data()?.name || '',
        status: centreDoc.data()?.status || '',
        ownerUid: centreDoc.data()?.ownerUid || '',
        ownerEmail: centreDoc.data()?.ownerEmail || '',
        ownerName: centreDoc.data()?.ownerName || '',
        accessCode: centreDoc.data()?.accessCode || '',
        createdAt: centreDoc.data()?.createdAt || '',
        importedAt: centreDoc.data()?.importedAt || null,
      }
    : null;
  const billingDoc = await adminDb.collection('centreBilling').doc(centreId).get();
  const centreBilling = billingDoc.exists
    ? { id: billingDoc.id, ...(billingDoc.data() as any) }
    : null;

  const codesSnap = await adminDb.collection('accessCodes').limit(200).get();
  const accessCodes = codesSnap.docs.map((d) => ({
    code: d.id,
    centreId: d.data()?.centreId || null,
    active: d.data()?.active !== false,
    createdAt: d.data()?.createdAt || '',
  }));
  const codesForCentre = accessCodes.filter((c) => c.centreId === centreId);

  const membershipsSnap = await adminDb
    .collection('memberships')
    .where('centreId', '==', centreId)
    .limit(200)
    .get();
  const memberships = membershipsSnap.docs.map((d) => ({
    id: d.id,
    uid: d.data()?.uid || '',
    role: d.data()?.role || '',
    status: d.data()?.status || '',
  }));
  const ownerMembershipsSnap = await adminDb
    .collection('memberships')
    .where('uid', '==', ownerUid)
    .limit(50)
    .get();
  const ownerMemberships = ownerMembershipsSnap.docs.map((d) => ({
    id: d.id,
    centreId: d.data()?.centreId || '',
    role: d.data()?.role || '',
    status: d.data()?.status || '',
  }));

  const ownerAdminDoc = await adminDb.collection('admins').doc(ownerUid).get();
  const ownerAdminRecord = ownerAdminDoc.exists
    ? {
        id: ownerAdminDoc.id,
        name: ownerAdminDoc.data()?.name || '',
        email: ownerAdminDoc.data()?.email || '',
        role: ownerAdminDoc.data()?.role || '',
        status: ownerAdminDoc.data()?.status || '',
        centreId: ownerAdminDoc.data()?.centreId || '',
      }
    : null;

  const configDoc = await adminDb.collection('platformConfig').doc('global').get();
  const planDoc = await adminDb.collection('platformPlans').doc('centre_plus').get();

  const collections: Array<{ name: string; total: number; withCentreId: number; toBackfill: number }> = [];
  for (const name of TENANT_COLLECTIONS) {
    const col = adminDb.collection(name);
    const total = (await col.count().get()).data().count;
    const withCentreId = (await col.where('centreId', '==', centreId).count().get()).data().count;
    collections.push({ name, total, withCentreId, toBackfill: total - withCentreId });
  }

  const plan: any = planDoc.exists ? planDoc.data() : null;
  const planned = {
    centre: centre
      ? {
          action: 'update',
          sets: {
            ownerUid,
            ownerEmail,
            ownerName: centre.ownerName || ownerVerification.displayName || '',
            accessCode: 'replaced with one fresh random 6-digit code',
            importedAt: 'timestamp of this import',
          },
          keeps: { name: centre.name, status: centre.status, createdAt: centre.createdAt },
        }
      : {
          action: 'create',
          note: 'The centre record does not exist yet; the import creates it from the centre name you give.',
          requiresCentreName: true,
        },
    centreBilling: centreBilling
      ? { action: 'overwrite billing fields for this centre', planId: 'centre_plus', trial: 'none (skippedTrial)' }
      : { action: 'create', planId: 'centre_plus', trial: 'none (skippedTrial)', seatCapFromPlan: plan?.seatCap ?? null },
    ownerMembership: memberships.some((m) => m.uid === ownerUid && m.role === 'owner')
      ? 'already present; no change'
      : `create memberships/${ownerUid}__${centreId} (role owner, status active)`,
    ownerAdminRecord: ownerAdminRecord
      ? ownerAdminRecord.centreId === centreId
        ? 'already points at this centre; no change'
        : 'adds centreId to the existing admins record (nothing else changes)'
      : `create admins/${ownerUid} (Super Admin, Active, this centre)`,
    accessCodes: {
      create: 'one fresh random 6-digit code for this centre',
      remove: codesForCentre.map((c) => c.code),
      keepOldCodes: params.keepOldCodes === true,
    },
    backfill: collections.filter((c) => c.toBackfill > 0).map((c) => ({ collection: c.name, documents: c.toBackfill })),
    neverTouched: ['Existing memberships of other users', 'Existing admins records of other people', 'AI/Gemini code and collections'],
  };

  return {
    centreId,
    ownerVerification,
    centre,
    centreBilling,
    accessCodes,
    codesForCentre,
    memberships,
    ownerMemberships,
    ownerAdminRecord,
    platformConfigPresent: configDoc.exists,
    centrePlusPlanPresent: planDoc.exists,
    collections,
    planned,
  };
}

/** Set centreId on the documents of one collection that lack it. */
async function backfillCollection(
  name: string,
  centreId: string
): Promise<{ updated: number; skippedOther: number }> {
  let updated = 0;
  let skippedOther = 0;
  let cursor: QueryDocumentSnapshot | null = null;
  for (let page = 0; page < 200; page++) {
    let q: Query = adminDb.collection(name).limit(400);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    cursor = snap.docs[snap.docs.length - 1];
    const batch = adminDb.batch();
    let batchOps = 0;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const existing = (data as any).centreId;
      if (typeof existing === 'string' && existing) {
        if (existing !== centreId) skippedOther++;
        return;
      }
      if (existing !== undefined) {
        skippedOther++;
        return;
      }
      batch.update(doc.ref, { centreId });
      batchOps++;
    });
    if (batchOps) {
      await batch.commit();
      updated += batchOps;
    }
    if (snap.size < 400) break;
  }
  return { updated, skippedOther };
}

/** The confirmed import. Idempotent: a second run changes nothing. */
export async function applyImport(params: Partial<ImportParams> & { actorUid: string }) {
  const { centreId, ownerUid, ownerEmail } = cleanParams(params);

  const ownerVerification = await resolveOwner(ownerUid, ownerEmail);
  if (!ownerVerification.matched) {
    throw httpError(400, `The uid belongs to ${ownerVerification.authEmail || 'no email'}, not ${ownerEmail}. Import stopped; nothing was written.`);
  }

  const plan = await getPlatformPlan('centre_plus');
  const config = await getPlatformConfig();
  const now = new Date();
  const centreRef = adminDb.collection('centres').doc(centreId);
  const centreDoc = await centreRef.get();
  const centre = centreDoc.exists ? (centreDoc.data() as any) || {} : {};

  // 1. Centre record: update what the import owns, keep everything else.
  if (centreDoc.exists) {
    await centreRef.update({
      ownerUid,
      ownerEmail,
      ownerName: centre.ownerName || ownerVerification.displayName || '',
      importedAt: now.toISOString(),
    });
  } else {
    const centreName = String(params.centreName || '').trim();
    if (centreName.length < 2 || centreName.length > 120) {
      throw httpError(400, 'The centre record does not exist yet, so a centre name is required for the import.');
    }
    await centreRef.set({
      name: centreName,
      status: 'pending_payment',
      ownerUid,
      ownerEmail,
      ownerName: ownerVerification.displayName || centreName,
      autoApproveStudents: true,
      createdAt: now.toISOString(),
      importedAt: now.toISOString(),
      credentialsNotDelivered: false,
    });
  }

  // 2. Billing: centre_plus, no trial. Caps come from the plan data.
  await adminDb.collection('centreBilling').doc(centreId).set({
    centreId,
    planId: 'centre_plus',
    seatCap: plan.seatCap,
    billedSeatsMinimum: (plan as any).billedSeatsMinimum ?? (config as any).billedSeatsMinimum,
    trialStartsAt: null,
    trialEndsAt: null,
    skippedTrial: true,
    discountPct: (config as any).skipTrialDiscountPct ?? 0,
    paidThrough: null,
    notes: 'Imported existing centre on centre_plus without a trial; students wait for the first payment.',
    updatedAt: now.toISOString(),
  });

  // 3. Owner membership (idempotent by document id).
  const membershipRef = adminDb.collection('memberships').doc(`${ownerUid}__${centreId}`);
  const membershipDoc = await membershipRef.get();
  await membershipRef.set({
    uid: ownerUid,
    centreId,
    role: 'owner',
    status: 'active',
    createdAt: (membershipDoc.data() as any)?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  });

  // 4. Owner admins record: create it only if missing; otherwise just attach
  //    the centreId and never touch the person's own fields.
  const adminRef = adminDb.collection('admins').doc(ownerUid);
  const adminDoc = await adminRef.get();
  if (adminDoc.exists) {
    await adminRef.update({ centreId, updatedAt: now.toISOString() });
  } else {
    await adminRef.set({
      centreId,
      name: ownerVerification.displayName || '',
      email: ownerVerification.authEmail,
      phone: '',
      role: 'Super Admin',
      status: 'Active',
      department: '',
      jobTitle: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  // 5. Access code: fresh random code on the first import; reuse it on a
  //    re-run so a repeat changes nothing. Old codes for this centre stop
  //    working unless the caller chose to keep them.
  let accessCode = '';
  const reused = Boolean(centre.accessCode) && centre.importedAt
    ? await adminDb.collection('accessCodes').doc(String(centre.accessCode)).get()
    : null;
  if (reused && reused.exists && reused.data()?.centreId === centreId) {
    accessCode = String(centre.accessCode);
  } else {
    accessCode = await createAccessCode(centreId);
    await centreRef.update({ accessCode });
  }
  const removedCodes: string[] = [];
  if (params.keepOldCodes !== true) {
    const oldCodesSnap = await adminDb.collection('accessCodes').where('centreId', '==', centreId).limit(100).get();
    for (const d of oldCodesSnap.docs) {
      if (d.id === accessCode) continue;
      await d.ref.delete().catch(() => {});
      removedCodes.push(d.id);
    }
  }

  // 6. Backfill centreId on the tenant collections, only where it is missing.
  const backfill: Record<string, { updated: number; skippedOther: number }> = {};
  for (const name of TENANT_COLLECTIONS) {
    backfill[name] = await backfillCollection(name, centreId);
  }

  const summary = {
    centreId,
    ownerUid,
    ownerEmail: ownerVerification.authEmail,
    planId: 'centre_plus',
    skippedTrial: true,
    accessCode,
    removedCodes,
    backfillUpdated: Object.entries(backfill).reduce((a, [, v]) => a + v.updated, 0),
    backfillSkippedOther: Object.entries(backfill).reduce((a, [, v]) => a + v.skippedOther, 0),
  };

  await adminDb.collection('auditLogs').add({
    actorUid: params.actorUid,
    centreId,
    action: 'CENTRE_IMPORTED',
    at: now.toISOString(),
    after: summary,
  });

  return { success: true, ...summary, backfill };
}
