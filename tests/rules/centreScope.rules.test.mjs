// Firestore rules test: Prompt G2 centre isolation. Runs against the real
// firestore.rules on the local Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/centreScope.rules.test.mjs"
// Requires Java 21+. Exits 0 when every check passes.
//
// The hole this suite pins shut: an admin of centre A could previously read
// and update centre B's student records straight from the browser, fee
// fields included, because the rules only checked that SOME admins record
// existed. After G2, a centre admin acts only inside their own centre, an
// admins record with no centreId acts for no centre (fail closed), platform
// staff (tos claim) act across centres, and records without centreId are out
// of reach of every centre admin until the tenant backfill tags them.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

let testEnv;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, e && e.message ? e.message.split('\n')[0] : String(e)]);
  }
}

const admA = () => testEnv.authenticatedContext('uid-adm-a', { email: 'adma@test.com' });
const admB = () => testEnv.authenticatedContext('uid-adm-b', { email: 'admb@test.com' });
const admNoCentre = () => testEnv.authenticatedContext('uid-adm-nox', { email: 'nox@test.com' });
const tosCtx = () => testEnv.authenticatedContext('uid-tos', { email: 'tos@test.com', tos: true });
const stuA = () => testEnv.authenticatedContext('uid-stu-a', { email: 'stua@test.com' });
const tutA = () => testEnv.authenticatedContext('uid-tut-a', { email: 'tuta@test.com' });

const studentA = {
  uid: 'uid-stu-a', email: 'stua@test.com', regNumber: 'RA-1', status: 'Active',
  totalFee: 100, paidAmount: 0, outstandingBalance: 100, paymentStatus: 'Pending',
};

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await admin.doc('admins/uid-adm-a').set({ name: 'A Admin', email: 'adma@test.com', role: 'Super Administrator', centreId: 'centre-a' });
    await admin.doc('admins/uid-adm-b').set({ name: 'B Admin', email: 'admb@test.com', role: 'Super Administrator', centreId: 'centre-b' });
    await admin.doc('admins/uid-adm-nox').set({ name: 'No Centre', email: 'nox@test.com', role: 'Super Administrator' });
    await admin.doc('admins/uid-tos').set({ name: 'TOS Staff', email: 'tos@test.com' });
    await admin.doc('programmes/prog-a').set({ name: 'Science A', centreId: 'centre-a' });
    await admin.doc('students/stu-a1').set({ ...studentA, centreId: 'centre-a' });
    await admin.doc('students/stu-b1').set({ ...studentA, uid: 'uid-stu-b', email: 'stub@test.com', regNumber: 'RB-1', centreId: 'centre-b' });
    // A legacy record from before the tenant backfill carries no centreId.
    await admin.doc('students/stu-legacy').set({ ...studentA, uid: 'uid-legacy', email: 'legacy@test.com' });
    await admin.doc('payments/pay-a').set({ studentId: 'uid-stu-a', studentName: 'Student A', amountPaid: 40, status: 'Partial', centreId: 'centre-a' });
    await admin.doc('payments/pay-b').set({ studentId: 'uid-stu-b', studentName: 'Student B', amountPaid: 40, status: 'Partial', centreId: 'centre-b' });
    await admin.doc('tutors/uid-tut-a').set({ name: 'Tutor A', email: 'tuta@test.com', uid: 'uid-tut-a', status: 'Active', hasChangedPassword: true, centreId: 'centre-a' });
    await admin.doc('results/res-a').set({ studentId: 'uid-stu-a', studentName: 'Student A', examTitle: 'Exam A', totalScore: 60, averagePercent: 60, scores: [], centreId: 'centre-a' });
    await admin.doc('results/res-b').set({ studentId: 'uid-stu-b', studentName: 'Student B', examTitle: 'Exam B', totalScore: 60, averagePercent: 60, scores: [], centreId: 'centre-b' });
    await admin.doc('attendance_logs/att-a').set({ studentId: 'uid-stu-a', date: '2026-10-27', status: 'Present', centreId: 'centre-a' });
    await admin.doc('attendance_logs/att-b').set({ studentId: 'uid-stu-b', date: '2026-10-27', status: 'Present', centreId: 'centre-b' });
    await admin.doc('admissions/adv-a').set({ applicantName: 'Applicant A', email: 'appa@test.com', status: 'Pending', centreId: 'centre-a' });
    await admin.doc('admissions/adv-b').set({ applicantName: 'Applicant B', email: 'appb@test.com', status: 'Pending', centreId: 'centre-b' });
    await admin.doc('activities/act-a').set({ title: 'Event A', centreId: 'centre-a' });
    await admin.doc('activities/act-b').set({ title: 'Event B', centreId: 'centre-b' });
  });
}

try {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tos-rules',
    firestore: { rules: RULES },
  });
  await seed();

  // A. The original hole: cross-centre student access.
  await check('A1. centre A admin gets centre B student denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-b1').get());
  });
  await check('A2. centre A admin changes centre B student fee denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-b1').update({ paidAmount: 90 }));
  });
  await check('A3. centre A admin updates centre B student name denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-b1').update({ name: 'Hijacked' }));
  });
  await check('A4. centre A admin deletes centre B student denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-b1').delete());
  });
  await check('A5. centre A admin creates student tagged centre B denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-new-b').set({
      name: 'New', regNumber: 'RX-1', status: 'Active', totalFee: 10, paidAmount: 0,
      outstandingBalance: 10, paymentStatus: 'Pending', programmeId: 'prog-a', centreId: 'centre-b',
    }));
  });
  await check('A6. centre A admin queries centre B students denied', async () => {
    await assertFails(admA().firestore().collection('students').where('centreId', '==', 'centre-b').get());
  });
  await check('A7. centre A admin queries own centre students allowed', async () => {
    const snap = await assertSucceeds(admA().firestore().collection('students').where('centreId', '==', 'centre-a').get());
    if (snap.size !== 1) throw new Error(`expected 1 own-centre student, saw ${snap.size}`);
  });
  await check('A8. centre A admin updates own-centre student allowed', async () => {
    await assertSucceeds(admA().firestore().doc('students/stu-a1').update({ name: 'Student A Renamed' }));
  });
  await check('A9. centre A admin re-tags own student to centre B denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-a1').update({ centreId: 'centre-b' }));
  });
  await check('A10. centre A admin creates student in own centre allowed', async () => {
    await assertSucceeds(admA().firestore().doc('students/stu-new-a').set({
      name: 'New A', regNumber: 'RA-9', status: 'Active', totalFee: 10, paidAmount: 0,
      outstandingBalance: 10, paymentStatus: 'Pending', programmeId: 'prog-a', centreId: 'centre-a',
    }));
  });

  // B. Fail-closed edges.
  await check('B1. admin with no centreId reads any student denied', async () => {
    await assertFails(admNoCentre().firestore().doc('students/stu-a1').get());
  });
  await check('B2. centre A admin reads legacy student without centreId denied', async () => {
    await assertFails(admA().firestore().doc('students/stu-legacy').get());
  });
  await check('B3. platform staff updates centre B student allowed', async () => {
    await assertSucceeds(tosCtx().firestore().doc('students/stu-b1').update({ name: 'TOS Renamed' }));
  });
  await check('B4. platform staff lists all students unfiltered allowed', async () => {
    const snap = await assertSucceeds(tosCtx().firestore().collection('students').get());
    if (snap.size < 3) throw new Error(`expected at least 3 students, saw ${snap.size}`);
  });

  // C. Student self-access is unchanged.
  await check('C1. student A reads own record allowed', async () => {
    await assertSucceeds(stuA().firestore().doc('students/stu-a1').get());
  });
  await check('C2. student A reads centre B student denied', async () => {
    await assertFails(stuA().firestore().doc('students/stu-b1').get());
  });
  await check('C3. student A changes own paidAmount denied', async () => {
    await assertFails(stuA().firestore().doc('students/stu-a1').update({ paidAmount: 999 }));
  });
  await check('C4. student A lists own record via uid filter allowed', async () => {
    const snap = await assertSucceeds(stuA().firestore().collection('students').where('uid', '==', 'uid-stu-a').get());
    if (snap.size !== 1) throw new Error(`expected 1, saw ${snap.size}`);
  });

  // D. Payments: centre-scoped admin reads, student self-reads unchanged.
  await check('D1. centre A admin reads own-centre payment allowed', async () => {
    await assertSucceeds(admA().firestore().doc('payments/pay-a').get());
  });
  await check('D2. centre A admin reads centre B payment denied', async () => {
    await assertFails(admA().firestore().doc('payments/pay-b').get());
  });
  await check('D3. student A reads own payment allowed', async () => {
    await assertSucceeds(stuA().firestore().doc('payments/pay-a').get());
  });

  // E. Tutors: centre-scoped admin writes, self-write unchanged.
  await check('E1. centre A admin invites tutor into centre A allowed', async () => {
    await assertSucceeds(admA().firestore().doc('tutors/tut-new-a').set({
      name: 'Invited A', email: 'newa@test.com', status: 'Suspended', hasChangedPassword: false, centreId: 'centre-a',
    }));
  });
  await check('E2. centre A admin invites tutor into centre B denied', async () => {
    await assertFails(admA().firestore().doc('tutors/tut-new-b').set({
      name: 'Invited B', email: 'newb@test.com', status: 'Suspended', hasChangedPassword: false, centreId: 'centre-b',
    }));
  });
  await check('E3. centre A admin updates centre B tutor denied', async () => {
    await assertFails(admA().firestore().doc('tutors/uid-tut-a').update({ centreId: 'centre-b' }));
  });
  await check('E4. tutor A self-update unchanged allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('tutors/uid-tut-a').update({ phone: '0801' }));
  });

  // F. Admissions: centre-scoped admin reads and writes.
  await check('F1. centre A admin reads own-centre admission allowed', async () => {
    await assertSucceeds(admA().firestore().doc('admissions/adv-a').get());
  });
  await check('F2. centre A admin reads centre B admission denied', async () => {
    await assertFails(admA().firestore().doc('admissions/adv-b').get());
  });
  await check('F3. centre A admin approves centre B admission denied', async () => {
    await assertFails(admA().firestore().doc('admissions/adv-b').update({ status: 'Approved' }));
  });

  // G. Attendance and results: centre-scoped admin paths.
  await check('G1. centre A admin marks attendance in own centre allowed', async () => {
    await assertSucceeds(admA().firestore().doc('attendance_logs/att-new').set({
      studentId: 'uid-stu-a', date: '2026-10-28', status: 'Present', centreId: 'centre-a',
    }));
  });
  await check('G2. centre A admin marks attendance tagged centre B denied', async () => {
    await assertFails(admA().firestore().doc('attendance_logs/att-cross').set({
      studentId: 'uid-stu-b', date: '2026-10-28', status: 'Present', centreId: 'centre-b',
    }));
  });
  await check('G3. centre B admin reads centre A attendance denied', async () => {
    await assertFails(admB().firestore().doc('attendance_logs/att-a').get());
  });
  await check('G4. tutor A updates centre A result allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('results/res-a').update({ totalScore: 65, averagePercent: 65 }));
  });
  await check('G5. tutor A updates centre B result denied', async () => {
    await assertFails(tutA().firestore().doc('results/res-b').update({ totalScore: 1 }));
  });
  await check('G6. centre A admin updates centre B result denied', async () => {
    await assertFails(admA().firestore().doc('results/res-b').update({ totalScore: 1 }));
  });

  // H. Activities: centre-scoped admin reads and writes.
  await check('H1. centre A admin reads own-centre activity allowed', async () => {
    await assertSucceeds(admA().firestore().doc('activities/act-a').get());
  });
  await check('H2. centre A admin reads centre B activity denied', async () => {
    await assertFails(admA().firestore().doc('activities/act-b').get());
  });
  await check('H3. centre B admin edits centre A activity denied', async () => {
    await assertFails(admB().firestore().doc('activities/act-a').update({ title: 'X' }));
  });
} finally {
  if (testEnv) await testEnv.cleanup();
}

const failed = results.filter((r) => !r[1]);
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${msg}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} centre-scope checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
