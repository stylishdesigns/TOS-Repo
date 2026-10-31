// Firestore rules test: centre isolation for the admins collection and fee-safe
// student self-registration (G2 follow-up). Runs against the real
// firestore.rules on the local Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/adminScope.rules.test.mjs"
// Requires Java 21+. Exits 0 when every check passes.
//
// The hole this suite pins shut: every centre rule trusts the centreId stored
// on the caller's admins record, but that collection was writable by ANY
// admin. An admin of centre A could set their own admins record's centreId to
// centre B and then pass every other centre rule for B, undoing the G2
// scoping with one write. Group K covers that attack and the legitimate admin
// management flows that must keep working. Group S covers student
// self-registration, which may not plant fee or payment state.
//
// EXPECTED ON THE PRE-FIX RULES (66a3d21): K1, K2, K3, K5, K6, K8, K9, K11,
// K14a, K14b and S1, S2, S3 FAIL. If they pass there, this suite is not
// testing what it claims. All checks must pass on the fixed rules.
//
// The S-checks each use their own caller whose uid matches the record it
// creates (doc id == payload uid == auth uid), so each one is a genuine
// create and the fee guard is the only rule deciding S1-S3. S5 is the
// deliberate exception: it creates a record for someone else, denied by the
// uid checks.
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
const admA2 = () => testEnv.authenticatedContext('uid-adm-a2', { email: 'adma2@test.com' });
const admB = () => testEnv.authenticatedContext('uid-adm-b', { email: 'admb@test.com' });
const admNoCentre = () => testEnv.authenticatedContext('uid-adm-nox', { email: 'nox@test.com' });
const tosCtx = () => testEnv.authenticatedContext('uid-tos', { email: 'tos@test.com', tos: true });
const invitedCtx = () => testEnv.authenticatedContext('uid-invited', { email: 'invited@test.com' });
const newStu = () => testEnv.authenticatedContext('uid-newstu', { email: 'newstu@test.com' });
// S1-S3 each use their own caller whose uid matches the record they create, so
// every S-check evaluates as a true create and the fee guard is the only rule
// deciding the outcome.
const newStu1 = () => testEnv.authenticatedContext('uid-s1', { email: 'newstu@test.com' });
const newStu2 = () => testEnv.authenticatedContext('uid-s2', { email: 'newstu@test.com' });
const newStu3 = () => testEnv.authenticatedContext('uid-s3', { email: 'newstu@test.com' });

const studentB = {
  uid: 'uid-stu-b', email: 'stub@test.com', regNumber: 'RB-1', status: 'Active',
  totalFee: 100, paidAmount: 0, outstandingBalance: 100, paymentStatus: 'Pending', centreId: 'centre-b',
};

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('admins/uid-adm-a').set({ name: 'A Admin', email: 'adma@test.com', role: 'Super Administrator', centreId: 'centre-a' });
    await db.doc('admins/uid-adm-a2').set({ name: 'A Admin 2', email: 'adma2@test.com', role: 'Administrator', centreId: 'centre-a' });
    await db.doc('admins/uid-adm-b').set({ name: 'B Admin', email: 'admb@test.com', role: 'Super Administrator', centreId: 'centre-b' });
    await db.doc('admins/uid-adm-nox').set({ name: 'No Centre', email: 'nox@test.com', role: 'Super Administrator' });
    await db.doc('admins/uid-tos').set({ name: 'TOS Staff', email: 'tos@test.com' });
    // A staff record created by invitation: its doc id is not the invitee's uid.
    await db.doc('admins/adm-invited').set({ name: 'Invited', email: 'invited@test.com', role: 'Administrator', centreId: 'centre-a' });
    await db.doc('students/stu-b1').set(studentB);
  });
}

try {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tos-rules',
    firestore: { rules: RULES },
  });
  await seed();

  // K. The admins collection is the source of every centre check.
  await check('K1. centre A admin re-tags OWN admins record to centre B denied (the takeover)', async () => {
    await assertFails(admA().firestore().doc('admins/uid-adm-a').update({ centreId: 'centre-b' }));
  });
  await check('K2. after the takeover attempt, centre A admin still cannot read a centre B student', async () => {
    await admA().firestore().doc('admins/uid-adm-a').update({ centreId: 'centre-b' }).catch(() => {});
    await assertFails(admA().firestore().doc('students/stu-b1').get());
    await assertFails(admA().firestore().doc('students/stu-b1').update({ paidAmount: 100 }));
  });
  await check('K3. centre A admin creates an admins record in centre B denied', async () => {
    await assertFails(admA().firestore().doc('admins/uid-rogue').set({
      name: 'Rogue', email: 'rogue@test.com', role: 'Super Administrator', centreId: 'centre-b',
    }));
  });
  await check('K4. centre A admin creates an admins record in centre A allowed', async () => {
    await assertSucceeds(admA().firestore().doc('admins/uid-new-a').set({
      name: 'New Staff', email: 'newa@test.com', role: 'Administrator', centreId: 'centre-a',
    }));
  });
  await check('K5. centre A admin updates a centre B admins record denied', async () => {
    await assertFails(admA().firestore().doc('admins/uid-adm-b').update({ phone: '080' }));
  });
  await check('K6. centre A admin deletes a centre B admins record denied', async () => {
    await assertFails(admA().firestore().doc('admins/uid-adm-b').delete());
  });
  await check('K7. centre A admin updates a centre A admins record allowed', async () => {
    await assertSucceeds(admA().firestore().doc('admins/uid-adm-a2').update({ phone: '080', status: 'Active' }));
  });
  await check('K8. centre A admin re-tags a centre A admins record to centre B denied', async () => {
    await assertFails(admA().firestore().doc('admins/uid-adm-a2').update({ centreId: 'centre-b' }));
  });
  await check('K9. centre A admin reads a centre B admins record denied', async () => {
    await assertFails(admA().firestore().doc('admins/uid-adm-b').get());
  });
  await check('K10. centre A admin lists own-centre admins allowed', async () => {
    const snap = await assertSucceeds(admA().firestore().collection('admins').where('centreId', '==', 'centre-a').get());
    if (snap.size < 2) throw new Error(`expected at least 2 centre A admins, saw ${snap.size}`);
  });
  await check('K11. centre A admin lists centre B admins denied', async () => {
    await assertFails(admA().firestore().collection('admins').where('centreId', '==', 'centre-b').get());
  });
  await check('K12. admin reads own record by uid allowed (login flow)', async () => {
    await assertSucceeds(admA().firestore().doc('admins/uid-adm-a').get());
  });
  await check('K13a. invited staff finds own record by email-filtered query allowed (login flow)', async () => {
    const snap = await assertSucceeds(invitedCtx().firestore().collection('admins').where('email', '==', 'invited@test.com').get());
    if (snap.size !== 1) throw new Error(`expected 1 record, saw ${snap.size}`);
  });
  await check('K13b. invited staff lists all admins without the email filter denied', async () => {
    await assertFails(invitedCtx().firestore().collection('admins').get());
  });
  await check('K14a. admin with no centreId cannot assign themselves a centre', async () => {
    await assertFails(admNoCentre().firestore().doc('admins/uid-adm-nox').update({ centreId: 'centre-b' }));
  });
  await check('K14b. admin with no centreId cannot create an admins record', async () => {
    await assertFails(admNoCentre().firestore().doc('admins/uid-rogue2').set({
      name: 'Rogue', email: 'rogue2@test.com', role: 'Super Administrator', centreId: 'centre-a',
    }));
  });
  await check('K15. platform staff (tos) create an admins record in any centre allowed', async () => {
    await assertSucceeds(tosCtx().firestore().doc('admins/uid-new-b').set({
      name: 'B Staff', email: 'newb@test.com', role: 'Administrator', centreId: 'centre-b',
    }));
  });
  await check('K16. student creates an admins record denied', async () => {
    await assertFails(newStu().firestore().doc('admins/uid-newstu').set({
      name: 'Me', email: 'newstu@test.com', role: 'Super Administrator', centreId: 'centre-a',
    }));
  });

  // S. Student self-registration may not plant fee or payment state.
  await check('S1. student self-creates a record with paidAmount set denied', async () => {
    await assertFails(newStu1().firestore().doc('students/uid-s1').set({
      uid: 'uid-s1', email: 'newstu@test.com', status: 'Active', totalFee: 100000, paidAmount: 100000,
      outstandingBalance: 0, centreId: 'centre-a',
    }));
  });
  await check('S2. student self-creates a record with a fee set denied', async () => {
    await assertFails(newStu2().firestore().doc('students/uid-s2').set({
      uid: 'uid-s2', email: 'newstu@test.com', status: 'Active', totalFee: 50000,
      paidAmount: 0, outstandingBalance: 50000, centreId: 'centre-a',
    }));
  });
  await check('S3. student self-creates a record marked Paid denied', async () => {
    await assertFails(newStu3().firestore().doc('students/uid-s3').set({
      uid: 'uid-s3', email: 'newstu@test.com', status: 'Active', totalFee: 0, paidAmount: 0,
      outstandingBalance: 0, paymentStatus: 'Paid', centreId: 'centre-a',
    }));
  });
  await check('S4. student self-registers with the real onboarding payload (zero fees) allowed', async () => {
    await assertSucceeds(newStu().firestore().doc('students/uid-newstu').set({
      uid: 'uid-newstu', name: 'New Student', email: 'newstu@test.com', status: 'Active',
      programmeId: '', programmeName: 'General Programme', attendancePercent: 0,
      totalFee: 0, paidAmount: 0, outstandingBalance: 0, centreId: 'centre-a',
    }));
  });
  await check('S5. student self-creates a record for someone else denied', async () => {
    await assertFails(newStu().firestore().doc('students/uid-other').set({
      uid: 'uid-other', email: 'other@test.com', status: 'Active', totalFee: 0, paidAmount: 0, outstandingBalance: 0,
    }));
  });
} finally {
  if (testEnv) await testEnv.cleanup();
}

const failed = results.filter((r) => !r[1]);
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${msg}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} admin-scope checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
