// Firestore rules test: the "Dirty Dozen" payloads from security_spec.md
// (Prompt A phase 4). Runs against the real firestore.rules on the local
// Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/dirtyDozen.rules.test.mjs"
// Requires Java 21+. Exits 0 when every check passes.
//
// Fee fields are locked server-side now: paidAmount, outstandingBalance,
// totalFee, paymentStatus, status, regNumber and uid all refuse a student
// write, and payment records can only be created by a centre admin's client.
// Student payments are recorded by the server payment route, which writes
// with the admin SDK.
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

const stuCtx = () => testEnv.authenticatedContext('uid-stu', { email: 'stu@test.com' });
const stu2Ctx = () => testEnv.authenticatedContext('uid-stu2', { email: 'stu2@test.com' });
const tutCtx = () => testEnv.authenticatedContext('uid-tut', { email: 'tut@test.com' });
const admCtx = () => testEnv.authenticatedContext('uid-adm', { email: 'adm@test.com' });
const stu3Ctx = () => testEnv.authenticatedContext('uid-stu3', { email: 'stu3@test.com' });
const tut2Ctx = () => testEnv.authenticatedContext('uid-tut2', { email: 'tut2@test.com' });

async function seed() {
  const s = {
    name: 'Student One', uid: 'uid-stu', email: 'stu@test.com', regNumber: 'R-1',
    status: 'Active', totalFee: 100, paidAmount: 0, outstandingBalance: 100,
    paymentStatus: 'Pending',
  };
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await admin.doc('students/uid-stu').set(s);
    await admin.doc('students/uid-stu2').set({ ...s, uid: 'uid-stu2', email: 'stu2@test.com' });
    await admin.doc('students/stu-999').set({ ...s, uid: 'uid-stu', studentId: 'STU-9999' });
    await admin.doc('admins/uid-adm').set({ name: 'Admin', email: 'adm@test.com', role: 'Super Administrator' });
    await admin.doc('programmes/prog-1').set({ name: 'Science' });
    await admin.doc('tutors/uid-tut').set({
    name: 'Tutor', email: 'tut@test.com', status: 'Suspended', hasChangedPassword: true,
  });
  await admin.doc('tutors/uid-tut2').set({
    name: 'Invited', email: 'tut2@test.com', status: 'Suspended', hasChangedPassword: false,
  });
    await admin.doc('payments/pay-b2').set({
      studentId: 'uid-stu2', studentName: 'Student Two', amountPaid: 75, status: 'Paid',
    });
    // Section 13 reads pay-3 and pay-5; since students can no longer create
    // payment records, seed them from the admin context instead.
    await admin.doc('payments/pay-3').set({
      studentId: 'uid-stu', studentName: 'Student One', amountPaid: 50, status: 'Partial',
    });
    await admin.doc('payments/pay-5').set({
      studentId: 'stu-999', studentName: 'Student One', amountPaid: 10, status: 'Partial',
    });
    await admin.doc('admissions/adv-1').set({
      applicantName: 'Applicant', email: 'applicant@test.com', status: 'Pending',
    });
  });
}

try {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tos-rules',
    firestore: { rules: RULES },
  });
  await seed();

  // 1. Unauthenticated write: settings/global stays admin-only.
  await check('1a. unauth write settings/global denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('settings/global').set({ centreName: 'x', email: 'x' }));
  });
  await check('1b. unauth read settings/global allowed (public website data)', async () => {
    await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc('settings/global').get());
  });

  // 2. Student PII leak: student A cannot read student B's profile.
  await check('2a. student A get student B denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu2').get());
  });
  await check('2b. student A get own record allowed', async () => {
    await assertSucceeds(stuCtx().firestore().doc('students/uid-stu').get());
  });

  // 3. Admin escalation: a signed-in student cannot create their own admins
  //    record, and cannot read or write other staff records.
  await check('3a. student create own admins record denied', async () => {
    await assertFails(stuCtx().firestore().doc('admins/uid-stu').set({ name: 'Me', email: 'stu@test.com', role: 'Super Administrator' }));
  });
  await check('3b. student read other admins record denied', async () => {
    await assertFails(stuCtx().firestore().doc('admins/uid-adm').get());
  });
  await check('3c. admin write staff record allowed', async () => {
    await assertSucceeds(admCtx().firestore().doc('admins/uid-adm').update({ phone: '080' }));
  });

  // 4. Fee tampering: a student cannot change their fee configuration or
  //    payment status in a self-service edit (paidAmount/outstandingBalance
  //    remain open, see the known-gap note above).
  await check('4a. student change own totalFee denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu').update({ totalFee: 0 }));
  });
  await check('4b. student change own paymentStatus denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu').update({ paymentStatus: 'Cleared' }));
  });
  await check('4c. student change own status denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu').update({ status: 'Completed' }));
  });
  await check('4d. student edit own profile fields allowed', async () => {
    await assertSucceeds(stuCtx().firestore().doc('students/uid-stu').update({ phone: '+2348000000000' }));
  });
  await check('4e. student change own paidAmount denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu').update({ paidAmount: 9999 }));
  });
  await check('4f. student change own outstandingBalance denied', async () => {
    await assertFails(stuCtx().firestore().doc('students/uid-stu').update({ outstandingBalance: 0 }));
  });

  // 5. Orphaned student: a student record cannot reference a programme that
  //    does not exist, and the record id must be well-formed.
  await check('5a. admin create student with fake programme denied', async () => {
    await assertFails(admCtx().firestore().doc('students/stu-new1').set({
      name: 'New', regNumber: 'R-2', status: 'Active', totalFee: 10, paidAmount: 0, programmeId: 'prog-fake',
    }));
  });
  await check('5b. admin create student with real programme allowed', async () => {
    await assertSucceeds(admCtx().firestore().doc('students/stu-new1').set({
      name: 'New', regNumber: 'R-2', status: 'Active', totalFee: 10, paidAmount: 0, programmeId: 'prog-1',
    }));
  });

  // 6. Fake payment: nobody can inject a payment unauthenticated, and a
  //    student can never create a payment record from a client device; the
  //    server payment route writes student payments with the admin SDK.
  await check('6a. unauth create payment denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('payments/pay-1').set({
      studentId: 'uid-stu', studentName: 'Student One', amountPaid: 999999, status: 'Paid',
    }));
  });
  await check('6b. student A pay for student B denied', async () => {
    await assertFails(stuCtx().firestore().doc('payments/pay-2').set({
      studentId: 'uid-stu2', studentName: 'Other', amountPaid: 500, status: 'Paid',
    }));
  });
  await check('6e. student create payment via own admin-created record denied', async () => {
    await assertFails(stuCtx().firestore().doc('payments/pay-5').set({
      studentId: 'stu-999', studentName: 'Student One', amountPaid: 20, status: 'Partial',
    }));
  });
  await check('6c. student create own payment denied (server route only)', async () => {
    await assertFails(stuCtx().firestore().doc('payments/pay-3').set({
      studentId: 'uid-stu', studentName: 'Student One', amountPaid: 50, status: 'Partial',
    }));
  });
  await check('6d. admin create payment for any student allowed', async () => {
    await assertSucceeds(admCtx().firestore().doc('payments/pay-4').set({
      studentId: 'stu-999', studentName: 'Student One', amountPaid: 10, status: 'Partial',
    }));
  });

  // 13. Payment-read scoping: only admins and the paying student can read a
  //     payment record. A centre's students can never list another centre's,
  //     or another student's, fees.
  await check('13a. unauth read payment denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('payments/pay-3').get());
  });
  await check('13b. student reads own payment (studentId = own uid) allowed', async () => {
    await assertSucceeds(stuCtx().firestore().doc('payments/pay-3').get());
  });
  await check('13c. student reads own payment via own admin-created record allowed', async () => {
    await assertSucceeds(stuCtx().firestore().doc('payments/pay-5').get());
  });
  await check('13d. student reads another student payment denied', async () => {
    await assertFails(stuCtx().firestore().doc('payments/pay-b2').get());
  });
  await check('13e. student centre-wide payments list denied', async () => {
    await assertFails(stuCtx().firestore().collection('payments').where('centreId', '==', 'centre-excellence').get());
  });
  await check('13f. student own-payments query allowed', async () => {
    await assertSucceeds(stuCtx().firestore().collection('payments').where('studentId', '==', 'uid-stu').get());
  });
  await check('13g. admin reads any payment allowed', async () => {
    await assertSucceeds(admCtx().firestore().doc('payments/pay-b2').get());
  });

  // 7. Role spoofing: a tutor who already completed first login cannot
  //    reactivate themselves; profile edits still work.
  await check('7a. tutor change own status denied', async () => {
    await assertFails(tutCtx().firestore().doc('tutors/uid-tut').update({ status: 'Active', phone: 'x' }));
  });
  await check('7b. tutor edit own profile (status unchanged) allowed', async () => {
    await assertSucceeds(tutCtx().firestore().doc('tutors/uid-tut').update({ phone: '+2348000000001' }));
  });
  await check('7c. invited tutor first-login acceptance allowed', async () => {
    await assertSucceeds(tut2Ctx().firestore().doc('tutors/uid-tut2').update({
      status: 'Active', hasChangedPassword: true,
    }));
  });

  // 8. Junk ID poisoning: ids must be short and path-safe.
  await check('8a. admin create student with 200-char id denied', async () => {
    const bad = 'x'.repeat(200);
    await assertFails(admCtx().firestore().doc(`students/${bad}`).set({
      name: 'Junk', regNumber: 'R-3', status: 'Active', totalFee: 1, paidAmount: 0,
    }));
  });

  // 9. Timestamp manipulation: a future createdAt cannot be planted on a
  //    self-created student record.
  await check('9a. student self-create with future createdAt denied', async () => {
    await assertFails(stu3Ctx().firestore().doc('students/uid-stu3').set({
      uid: 'uid-stu3', createdAt: Date.now() + 1000 * 60 * 60 * 24 * 365,
    }));
  });
  await check('9b. student self-create without createdAt allowed', async () => {
    await assertSucceeds(stu3Ctx().firestore().doc('students/uid-stu3').set({ uid: 'uid-stu3' }));
  });

  // 10. Global delete: an unauthenticated user cannot delete settings/global.
  await check('10a. unauth delete settings/global denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('settings/global').delete());
  });

  // 11. Query scraping: a student cannot list all students without a
  //     self-scoping filter.
  await check('11a. student list all students denied', async () => {
    await assertFails(stuCtx().firestore().collection('students').get());
  });

  // 12. Status shortcutting: applicants cannot approve themselves, and a
  //     visitor cannot submit a pre-approved application.
  await check('12a. visitor create Approved admission denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('admissions/adv-2').set({
      applicantName: 'Sneak', status: 'Approved',
    }));
  });
  await check('12b. visitor create Pending admission allowed', async () => {
    await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc('admissions/adv-3').set({
      applicantName: 'Honest', status: 'Pending',
    }));
  });
  await check('12c. visitor update admission status denied', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('admissions/adv-1').update({ status: 'Approved' }));
  });
} finally {
  if (testEnv) await testEnv.cleanup();
}

const failed = results.filter((r) => !r[1]);
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${msg}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} dirty-dozen checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
