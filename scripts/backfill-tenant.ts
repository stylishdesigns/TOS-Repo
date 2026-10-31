import { adminDb } from '../src/server/firebaseAdmin';
import {
  Centre,
  CentreBilling,
  CentreMembership,
  MembershipRole,
} from '../src/types';

const EXCELLENCE_CENTRE_ID = 'centre-excellence';

const TENANT_COLLECTIONS = [
  'students',
  'admissions',
  'tutors',
  'programmes',
  'payments',
  'branches',
  'attendance_logs',
  'announcements',
  'subjects',
  'classrooms',
  'timetable',
  'results',
  'cbt_questions',
  'cbt_exams',
  'activities',
  'classRatings',
  'studyMaterials',
  'mock_grading',
  'admins',
];

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// The owner UID is a real Firebase Auth UID, passed per run (Prompt D): there
// is no hard-coded account anywhere in the script.
function resolveOwnerUid(): string {
  const i = process.argv.indexOf('--owner-uid');
  if (i > -1 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return process.env.EXCELLENCE_OWNER_UID || '';
}

const OWNER_UID = resolveOwnerUid();

async function main() {
  const isApply = process.argv.includes('--apply');
  if (isApply && !OWNER_UID) {
    console.error('APPLY mode requires the real owner UID: pass --owner-uid <uid> or set EXCELLENCE_OWNER_UID.');
    console.error('Refusing to write a centre whose ownerUid is not a real Firebase Auth UID.');
    process.exit(1);
  }
  console.log(`========================================================`);
  console.log(`  Tutorial OS Multi-Tenant Backfill Script (Prompt 1)`);
  console.log(`  Mode: ${isApply ? 'APPLY (Writing changes to Firestore)' : 'DRY RUN (Preview only, use --apply to commit)'}`);
  console.log(`  Target Centre ID: ${EXCELLENCE_CENTRE_ID}`);
  console.log(`========================================================\n`);

  // Step 1: Read existing settings/global to derive Centre #1
  const globalSettingsRef = adminDb.collection('settings').doc('global');
  const globalSettingsSnap = await globalSettingsRef.get();
  const globalData = globalSettingsSnap.exists ? globalSettingsSnap.data() || {} : {};

  const centreRef = adminDb.collection('centres').doc(EXCELLENCE_CENTRE_ID);
  const existingCentreSnap = await centreRef.get();

  let accessCode = generate6DigitCode();
  if (existingCentreSnap.exists && existingCentreSnap.data()?.accessCode) {
    accessCode = existingCentreSnap.data()!.accessCode;
  }

  const centreDoc: Centre = {
    id: EXCELLENCE_CENTRE_ID,
    name: globalData.centreName || 'Excellence Tutorial Centre',
    status: 'active',
    ownerUid: OWNER_UID, // passed with --owner-uid or EXCELLENCE_OWNER_UID
    branding: {
      logo: globalData.logoText || 'Excellence',
      primaryColor: globalData.primaryColor || '#EA580C',
      secondaryColor: globalData.secondaryColor || '#0F172A',
      colours: {
        primary: globalData.primaryColor || '#EA580C',
        secondary: globalData.secondaryColor || '#0F172A',
      },
    },
    audienceTypes: ['JAMB', 'WAEC', 'NECO', 'A-Levels'],
    autoApproveStudents: false,
    createdAt: new Date().toISOString(),
    accessCode,
  };

  const billingDoc: CentreBilling = {
    centreId: EXCELLENCE_CENTRE_ID,
    planId: 'centre_plus',
    seatCap: 500,
    billedSeatsMinimum: 10,
    trialStartsAt: null,
    trialEndsAt: null,
    skippedTrial: true,
    discountPct: 0,
    paidThrough: null,
    notes: 'Excellence Tutorial Centre (Founding Customer)',
  };

  console.log(`1. Centre #1 ("Excellence Tutorial Centre"):`);
  console.log(`   - ID: ${EXCELLENCE_CENTRE_ID}`);
  console.log(`   - Name: ${centreDoc.name}`);
  console.log(`   - Status: ${centreDoc.status}`);
  console.log(`   - Access Code: ${accessCode}`);
  console.log(`   - Plan: ${billingDoc.planId} (Cap: ${billingDoc.seatCap})`);

  if (isApply) {
    await centreRef.set(centreDoc, { merge: true });
    await adminDb.collection('centreBilling').doc(EXCELLENCE_CENTRE_ID).set(billingDoc, { merge: true });
    await adminDb.collection('accessCodes').doc(accessCode).set({ centreId: EXCELLENCE_CENTRE_ID }, { merge: true });
    console.log(`   -> Written centres, centreBilling, and accessCodes records.`);
  }

  // Step 2: Copy settings/global and settings/attendance to scoped docs
  console.log(`\n2. Settings Documents:`);
  const scopedGlobalRef = adminDb.collection('settings').doc(`${EXCELLENCE_CENTRE_ID}__global`);
  const scopedAttendanceRef = adminDb.collection('settings').doc(`${EXCELLENCE_CENTRE_ID}__attendance`);

  const attendanceSettingsSnap = await adminDb.collection('settings').doc('attendance').get();
  const attendanceData = attendanceSettingsSnap.exists ? attendanceSettingsSnap.data() || {} : {};

  console.log(`   - settings/global -> settings/${EXCELLENCE_CENTRE_ID}__global`);
  console.log(`   - settings/attendance -> settings/${EXCELLENCE_CENTRE_ID}__attendance`);
  if (isApply) {
    await scopedGlobalRef.set({ ...globalData, centreId: EXCELLENCE_CENTRE_ID }, { merge: true });
    await scopedAttendanceRef.set({ ...attendanceData, centreId: EXCELLENCE_CENTRE_ID }, { merge: true });
    console.log(`   -> Scoped settings created (legacy documents left in place).`);
  }

  // Step 3: Backfill centreId on all tenant collections
  console.log(`\n3. Backfilling centreId across collections:`);
  const report: Record<string, { total: number; alreadyTagged: number; newlyTagged: number; otherCentre: number }> = {};

  for (const collName of TENANT_COLLECTIONS) {
    const snap = await adminDb.collection(collName).get();
    let alreadyTagged = 0;
    let newlyTagged = 0;
    let otherCentre = 0;

    const docsToUpdate: Array<{ id: string; ref: FirebaseFirestore.DocumentReference }> = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.centreId === EXCELLENCE_CENTRE_ID) {
        alreadyTagged++;
      } else if (typeof data.centreId === 'string' && data.centreId) {
        // The row already belongs to a different centre (e.g. Champion).
        // This script provisions centre #1 only; it must never re-tag or
        // claim another centre's rows.
        otherCentre++;
      } else {
        newlyTagged++;
        docsToUpdate.push({ id: docSnap.id, ref: docSnap.ref });
      }
    });

    report[collName] = {
      total: snap.size,
      alreadyTagged,
      newlyTagged,
      otherCentre,
    };

    if (isApply && docsToUpdate.length > 0) {
      // Batch in chunks of 400
      const CHUNK_SIZE = 400;
      for (let i = 0; i < docsToUpdate.length; i += CHUNK_SIZE) {
        const chunk = docsToUpdate.slice(i, i + CHUNK_SIZE);
        const batch = adminDb.batch();
        for (const item of chunk) {
          batch.set(item.ref, { centreId: EXCELLENCE_CENTRE_ID }, { merge: true });
        }
        await batch.commit();
      }
    }
  }

  // Step 4: Create memberships for admins, tutors, and students
  console.log(`\n4. Creating centre memberships:`);
  let adminMemberships = 0;
  let tutorMemberships = 0;
  let studentMemberships = 0;

  // Admins
  const adminsSnap = await adminDb.collection('admins').get();
  for (const docSnap of adminsSnap.docs) {
    const data = docSnap.data();
    const uid = data.uid || docSnap.id;
    // A person already tagged to a different centre belongs there.
    if (typeof data.centreId === 'string' && data.centreId && data.centreId !== EXCELLENCE_CENTRE_ID) continue;
    if (uid) {
      let role: MembershipRole = 'admin';
      if (data.role === 'Super Admin') {
        role = 'owner';
      } else if (data.role === 'Center Admin') {
        role = 'admin';
      } else if (data.role === 'Admin Secretary') {
        role = 'secretary';
      } else if (data.role === 'Finance Admin') {
        role = 'finance';
      } else if (data.role === 'Tutor') {
        role = 'tutor';
      }

      const membershipId = `${uid}__${EXCELLENCE_CENTRE_ID}`;
      const memDoc: CentreMembership = {
        id: membershipId,
        uid,
        centreId: EXCELLENCE_CENTRE_ID,
        role,
        status: data.status === 'Suspended' ? 'disabled' : 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      adminMemberships++;
      if (isApply) {
        await adminDb.collection('memberships').doc(membershipId).set(memDoc, { merge: true });
      }
    }
  }

  // Tutors
  const tutorsSnap = await adminDb.collection('tutors').get();
  for (const docSnap of tutorsSnap.docs) {
    const data = docSnap.data();
    const uid = data.uid || docSnap.id;
    if (typeof data.centreId === 'string' && data.centreId && data.centreId !== EXCELLENCE_CENTRE_ID) continue;
    if (uid) {
      const membershipId = `${uid}__${EXCELLENCE_CENTRE_ID}`;
      const memDoc: CentreMembership = {
        id: membershipId,
        uid,
        centreId: EXCELLENCE_CENTRE_ID,
        role: 'tutor',
        status: data.status === 'Suspended' ? 'disabled' : 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tutorMemberships++;
      if (isApply) {
        await adminDb.collection('memberships').doc(membershipId).set(memDoc, { merge: true });
      }
    }
  }

  // Students
  const studentsSnap = await adminDb.collection('students').get();
  for (const docSnap of studentsSnap.docs) {
    const data = docSnap.data();
    const uid = data.uid || docSnap.id;
    if (typeof data.centreId === 'string' && data.centreId && data.centreId !== EXCELLENCE_CENTRE_ID) continue;
    if (uid) {
      const membershipId = `${uid}__${EXCELLENCE_CENTRE_ID}`;
      const memDoc: CentreMembership = {
        id: membershipId,
        uid,
        centreId: EXCELLENCE_CENTRE_ID,
        role: 'student',
        status: data.status === 'Suspended' ? 'disabled' : 'active',
        createdAt: data.registrationDate || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      studentMemberships++;
      if (isApply) {
        await adminDb.collection('memberships').doc(membershipId).set(memDoc, { merge: true });
      }
    }
  }

  console.log(`   - Admin memberships: ${adminMemberships}`);
  console.log(`   - Tutor memberships: ${tutorMemberships}`);
  console.log(`   - Student memberships: ${studentMemberships}`);

  // Step 5: Verification Report
  console.log(`\n========================================================`);
  console.log(`               BACKFILL VERIFICATION REPORT`);
  console.log(`========================================================`);
  console.log(
    `Collection`.padEnd(20) +
    `Total Docs`.padEnd(14) +
    `Tagged centreId`.padEnd(18) +
    `Other centre`.padEnd(16) +
    `Untagged (Pending)`
  );
  console.log('-'.repeat(82));

  for (const [coll, stats] of Object.entries(report)) {
    const tagged = isApply ? stats.total - stats.otherCentre : stats.alreadyTagged;
    const pending = isApply ? 0 : stats.newlyTagged;
    console.log(
      `${coll.padEnd(20)}${String(stats.total).padEnd(14)}${String(tagged).padEnd(18)}${String(stats.otherCentre).padEnd(16)}${String(pending)}`
    );
  }

  console.log('-'.repeat(65));
  console.log(`Mode: ${isApply ? 'APPLIED SUCCESSFULLY' : 'DRY RUN FINISHED - No writes performed'}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
