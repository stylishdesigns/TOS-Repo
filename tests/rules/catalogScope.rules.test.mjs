// Firestore rules test: centre isolation for the catalog, timetable, exam and
// legacy global collections ("Stage B"). Runs against firestore.rules on the
// local Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/catalogScope.rules.test.mjs"
// Requires Java 21+. Exits 0 when every check passes.
//
// The hole this suite pins shut: programmes (fees), branches, announcements,
// subjects, classrooms, timetable, cbt_questions, cbt_exams and mock_grading
// were writable by ANY admin, so an admin of one centre could edit or delete
// another centre's records, and any signed-in user could update any exam. The
// legacy global `settings` and `cms` collections are no longer browser-writable.
//
// SELF-CHECK AGAINST THE OLD RULES. Every check is flagged with whether it is
// expected to FAIL on the pre-fix rules (a3a54ae). To prove the suite actually
// detects the holes, run it against the old rules in PREFIX_CHECK mode:
//   git show a3a54ae:firestore.rules > /tmp/old.rules
//   RULES_FILE=/tmp/old.rules PREFIX_CHECK=1 npx firebase-tools emulators:exec \
//     --only firestore --project demo-tos-rules "node tests/rules/catalogScope.rules.test.mjs"
// That run exits 0 only if the observed failures match the flags exactly.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

const RULES = process.env.RULES_FILE
  ? readFileSync(resolve(process.env.RULES_FILE), 'utf8')
  : readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const PREFIX_CHECK = process.env.PREFIX_CHECK === '1';

let testEnv;
const results = [];

// failsPreFix = true when this check must FAIL on the old rules (it pins a hole).
async function check(name, fn, failsPreFix = false) {
  try {
    await fn();
    results.push({ name, ok: true, failsPreFix });
  } catch (e) {
    results.push({ name, ok: false, failsPreFix, msg: e && e.message ? e.message.split('\n')[0] : String(e) });
  }
}

const unauth = () => testEnv.unauthenticatedContext();
const admA = () => testEnv.authenticatedContext('uid-adm-a', { email: 'adma@test.com' });
const admB = () => testEnv.authenticatedContext('uid-adm-b', { email: 'admb@test.com' });
const admNoCentre = () => testEnv.authenticatedContext('uid-adm-nox', { email: 'nox@test.com' });
const tosCtx = () => testEnv.authenticatedContext('uid-tos', { email: 'tos@test.com', tos: true });
const stuA = () => testEnv.authenticatedContext('uid-stu-a', { email: 'stua@test.com' });
const tutA = () => testEnv.authenticatedContext('uid-tut-a', { email: 'tuta@test.com' });
const tutB = () => testEnv.authenticatedContext('uid-tut-b', { email: 'tutb@test.com' });
// The same tutor as tutA, with a verified email (JIT migration deletes need it).
const tutAv = () => testEnv.authenticatedContext('uid-tut-a', { email: 'tuta@test.com', email_verified: true });

const CATALOG = [
  { name: 'programmes', publicRead: true },
  { name: 'branches', publicRead: true },
  { name: 'announcements', publicRead: true },
  { name: 'subjects', publicRead: true },
  { name: 'classrooms', publicRead: true },
  { name: 'cbt_questions', publicRead: false },
  { name: 'mock_grading', publicRead: false },
];
// Valid for every catalog collection's validators (branches need name + state).
const item = (centreId, extra = {}) => ({ name: 'Item', state: 'Lagos', title: 'Item', ...(centreId ? { centreId } : {}), ...extra });
const exam = (centreId, tutorId, extra = {}) => ({
  title: 'Exam', status: 'Live', frequency: 'Daily', mode: 'MCQ', attemptsCount: 3, tutorId,
  ...(centreId ? { centreId } : {}), ...extra,
});

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('admins/uid-adm-a').set({ name: 'A', email: 'adma@test.com', role: 'Super Administrator', centreId: 'centre-a' });
    await db.doc('admins/uid-adm-b').set({ name: 'B', email: 'admb@test.com', role: 'Super Administrator', centreId: 'centre-b' });
    await db.doc('admins/uid-adm-nox').set({ name: 'No Centre', email: 'nox@test.com', role: 'Super Administrator' });
    await db.doc('admins/uid-tos').set({ name: 'TOS', email: 'tos@test.com' });
    await db.doc('tutors/uid-tut-a').set({ name: 'Tutor A', email: 'tuta@test.com', status: 'Active', centreId: 'centre-a' });
    await db.doc('tutors/uid-tut-b').set({ name: 'Tutor B', email: 'tutb@test.com', status: 'Active', centreId: 'centre-b' });
    await db.doc('tutors/legacy-dup').set({ name: 'Legacy Tutor', email: 'tuta@test.com', status: 'Active' });
    await db.doc('students/uid-stu-a').set({ uid: 'uid-stu-a', email: 'stua@test.com', status: 'Active', centreId: 'centre-a', totalFee: 0, paidAmount: 0, outstandingBalance: 0 });
    for (const { name } of CATALOG) {
      await db.doc(`${name}/a1`).set(item('centre-a'));
      await db.doc(`${name}/a2`).set(item('centre-a'));
      await db.doc(`${name}/b1`).set(item('centre-b'));
      await db.doc(`${name}/tos1`).set(item('centre-b'));
      await db.doc(`${name}/legacy1`).set(item(null));
    }
    await db.doc('timetable/slot-a1').set({ title: 'Maths', centreId: 'centre-a', tutorId: 'uid-tut-a' });
    await db.doc('timetable/slot-a2').set({ title: 'Physics', centreId: 'centre-a', tutorId: 'uid-tut-a' });
    await db.doc('timetable/slot-a3').set({ title: 'Chem', centreId: 'centre-a', tutorId: 'someone-else' });
    await db.doc('timetable/slot-b1').set({ title: 'Maths B', centreId: 'centre-b', tutorId: 'uid-tut-b' });
    await db.doc('timetable/slot-legacy').set({ title: 'Legacy Maths', centreId: 'centre-a', tutorId: 'legacy-tut-1' });
    await db.doc('timetable/slot-live-b').set({ title: 'B slot in A', centreId: 'centre-a', tutorId: 'uid-tut-b' });
    await db.doc('timetable/slot-unassigned').set({ title: 'Free slot', centreId: 'centre-a', tutorId: '' });
    await db.doc('cbt_exams/exam-a1').set(exam('centre-a', 'uid-tut-a'));
    await db.doc('cbt_exams/exam-a2').set(exam('centre-a', 'someone-else')); // same centre, another tutor's
    await db.doc('cbt_exams/exam-b1').set(exam('centre-b', 'uid-tut-b'));
    for (let i = 1; i <= 5; i++) await db.doc(`cbt_exams/exam-bump-${i}`).set(exam('centre-a', 'uid-tut-a'));
    await db.doc('cbt_exams/exam-del-1').set(exam('centre-a', 'uid-tut-a'));
    await db.doc('cbt_exams/exam-del-2').set(exam('centre-a', 'someone-else'));
    await db.doc('cms/c1').set({ title: 'Legacy page' });
    await db.doc('settings/global').set({ centreName: 'Seed Centre', email: 'seed@test.com' });
  });
}

try {
  testEnv = await initializeTestEnvironment({ projectId: 'demo-tos-rules', firestore: { rules: RULES } });
  await seed();

  // ---------- catalog collections: same contract for each ----------
  for (const { name: c, publicRead } of CATALOG) {
    const T = (s) => `${c}: ${s}`;
    if (publicRead) {
      await check(T('unauthenticated read allowed (public website)'), async () => {
        await assertSucceeds(unauth().firestore().doc(`${c}/a1`).get());
      });
    } else {
      await check(T('unauthenticated read denied'), async () => {
        await assertFails(unauth().firestore().doc(`${c}/a1`).get());
      });
      await check(T('signed-in read allowed'), async () => {
        await assertSucceeds(stuA().firestore().doc(`${c}/a1`).get());
      });
    }
    await check(T('centre A admin creates in centre A allowed'), async () => {
      await assertSucceeds(admA().firestore().doc(`${c}/new-a`).set(item('centre-a')));
    });
    await check(T('centre A admin creates in centre B denied'), async () => {
      await assertFails(admA().firestore().doc(`${c}/new-b`).set(item('centre-b')));
    }, true);
    await check(T('admin with no centre creates denied'), async () => {
      await assertFails(admNoCentre().firestore().doc(`${c}/new-x`).set(item('centre-a')));
    }, true);
    await check(T('centre A admin updates own-centre record allowed'), async () => {
      await assertSucceeds(admA().firestore().doc(`${c}/a1`).update({ name: 'Renamed' }));
    });
    await check(T('centre A admin updates centre B record denied'), async () => {
      await assertFails(admA().firestore().doc(`${c}/b1`).update({ name: 'Hijacked' }));
    }, true);
    await check(T('centre A admin deletes centre B record denied'), async () => {
      await assertFails(admA().firestore().doc(`${c}/b1`).delete());
    }, true);
    await check(T('centre A admin re-tags own record to centre B denied'), async () => {
      await assertFails(admA().firestore().doc(`${c}/a1`).update({ centreId: 'centre-b' }));
    }, true);
    await check(T('centre A admin updates a legacy untagged record denied (fails closed)'), async () => {
      await assertFails(admA().firestore().doc(`${c}/legacy1`).update({ name: 'Claimed' }));
    }, true);
    await check(T('admin with no centre updates a record denied'), async () => {
      await assertFails(admNoCentre().firestore().doc(`${c}/a1`).update({ name: 'X' }));
    }, true);
    await check(T('tutor write denied'), async () => {
      await assertFails(tutA().firestore().doc(`${c}/a1`).update({ name: 'X' }));
    });
    await check(T('student write denied'), async () => {
      await assertFails(stuA().firestore().doc(`${c}/a1`).update({ name: 'X' }));
    });
    await check(T('platform staff (tos) updates a centre B record allowed'), async () => {
      // Own record: earlier checks may legitimately consume b1 when run against the old rules.
      await assertSucceeds(tosCtx().firestore().doc(`${c}/tos1`).update({ name: 'By platform' }));
    });
    await check(T('centre A admin deletes own-centre record allowed'), async () => {
      await assertSucceeds(admA().firestore().doc(`${c}/a2`).delete());
    });
  }

  // ---------- timetable ----------
  await check('timetable: unauthenticated read allowed (public timetable)', async () => {
    await assertSucceeds(unauth().firestore().doc('timetable/slot-a1').get());
  });
  await check('timetable: centre A admin creates a slot in centre A allowed', async () => {
    await assertSucceeds(admA().firestore().doc('timetable/new-a').set({ title: 'New', centreId: 'centre-a', tutorId: 'uid-tut-a' }));
  });
  await check('timetable: centre A admin creates a slot in centre B denied', async () => {
    await assertFails(admA().firestore().doc('timetable/new-b').set({ title: 'New', centreId: 'centre-b', tutorId: 'uid-tut-b' }));
  }, true);
  await check('timetable: admin with no centre creates a slot denied', async () => {
    await assertFails(admNoCentre().firestore().doc('timetable/new-x').set({ title: 'New', centreId: 'centre-a', tutorId: 'x' }));
  }, true);
  await check('timetable: centre A admin updates an own-centre slot allowed', async () => {
    await assertSucceeds(admA().firestore().doc('timetable/slot-a3').update({ title: 'Chem 2' }));
  });
  await check('timetable: centre A admin updates a centre B slot denied', async () => {
    await assertFails(admA().firestore().doc('timetable/slot-b1').update({ title: 'Hijacked' }));
  }, true);
  await check('timetable: centre A admin deletes a centre B slot denied', async () => {
    await assertFails(admA().firestore().doc('timetable/slot-b1').delete());
  }, true);
  await check('timetable: tutor updates a slot assigned to them allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('timetable/slot-a1').update({ title: 'Maths (moved room)' }));
  });
  await check('timetable: tutor updates a slot assigned to someone else denied', async () => {
    await assertFails(tutA().firestore().doc('timetable/slot-b1').update({ title: 'X' }));
  });
  await check('timetable: tutor moves their own slot to centre B denied', async () => {
    await assertFails(tutA().firestore().doc('timetable/slot-a1').update({ centreId: 'centre-b' }));
  }, true);
  await check('timetable: tutor deletes a slot assigned to them allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('timetable/slot-a2').delete());
  });
  await check('timetable: tutor deletes a slot assigned to someone else denied', async () => {
    await assertFails(tutA().firestore().doc('timetable/slot-a3').delete());
  });
  await check('timetable: tutor creates a slot denied', async () => {
    await assertFails(tutA().firestore().doc('timetable/tut-new').set({ title: 'X', centreId: 'centre-a', tutorId: 'uid-tut-a' }));
  });
  await check('timetable: student updates a slot denied', async () => {
    await assertFails(stuA().firestore().doc('timetable/slot-a1').update({ title: 'X' }));
  });
  await check('timetable: tutor re-points an orphaned legacy slot to themselves allowed (JIT migration)', async () => {
    await assertSucceeds(tutA().firestore().doc('timetable/slot-legacy').update({ tutorId: 'uid-tut-a' }));
  }, true);
  await check("timetable: tutor re-points a live tutor's slot to themselves denied", async () => {
    await assertFails(tutA().firestore().doc('timetable/slot-live-b').update({ tutorId: 'uid-tut-a' }));
  });
  await check('timetable: tutor claims an unassigned slot denied', async () => {
    await assertFails(tutA().firestore().doc('timetable/slot-unassigned').update({ tutorId: 'uid-tut-a' }));
  });

  // ---------- cbt_exams ----------
  await check('cbt_exams: unauthenticated read denied', async () => {
    await assertFails(unauth().firestore().doc('cbt_exams/exam-a1').get());
  });
  await check('cbt_exams: centre A admin creates an exam in centre A allowed', async () => {
    await assertSucceeds(admA().firestore().doc('cbt_exams/new-a').set(exam('centre-a', 'uid-tut-a')));
  });
  await check('cbt_exams: centre A admin creates an exam in centre B denied', async () => {
    await assertFails(admA().firestore().doc('cbt_exams/new-b').set(exam('centre-b', 'uid-tut-b')));
  }, true);
  await check('cbt_exams: admin with no centre creates an exam denied', async () => {
    await assertFails(admNoCentre().firestore().doc('cbt_exams/new-x').set(exam('centre-a', 'x')));
  }, true);
  await check('cbt_exams: tutor creates an exam in their own centre allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('cbt_exams/tut-new-a').set(exam('centre-a', 'uid-tut-a')));
  });
  await check('cbt_exams: tutor creates an exam in another centre denied', async () => {
    await assertFails(tutA().firestore().doc('cbt_exams/tut-new-b').set(exam('centre-b', 'uid-tut-a')));
  }, true);
  await check('cbt_exams: student creates an exam denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/stu-new').set(exam('centre-a', 'uid-stu-a')));
  });
  await check('cbt_exams: student bumps attemptsCount by exactly 1 allowed (their submission)', async () => {
    await assertSucceeds(stuA().firestore().doc('cbt_exams/exam-bump-1').update({ attemptsCount: 4 }));
  });
  await check('cbt_exams: student jumps attemptsCount by more than 1 denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/exam-bump-2').update({ attemptsCount: 8 }));
  }, true);
  await check('cbt_exams: student lowers attemptsCount denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/exam-bump-5').update({ attemptsCount: 2 }));
  }, true);
  await check('cbt_exams: student edits an exam title denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/exam-bump-3').update({ title: 'Defaced' }));
  }, true);
  await check('cbt_exams: student bumps attemptsCount and changes status together denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/exam-bump-4').update({ attemptsCount: 4, status: 'Draft' }));
  }, true);
  await check('cbt_exams: centre A admin updates an own-centre exam allowed', async () => {
    await assertSucceeds(admA().firestore().doc('cbt_exams/exam-a1').update({ title: 'Exam v2' }));
  });
  await check('cbt_exams: centre A admin updates a centre B exam denied', async () => {
    await assertFails(admA().firestore().doc('cbt_exams/exam-b1').update({ title: 'Hijacked' }));
  }, true);
  await check('cbt_exams: tutor in the same centre updates an exam allowed (re-publish)', async () => {
    await assertSucceeds(tutA().firestore().doc('cbt_exams/exam-a2').update({ title: 'Edited by tutor' }));
  });
  await check('cbt_exams: tutor from another centre updates an exam denied', async () => {
    await assertFails(tutB().firestore().doc('cbt_exams/exam-a1').update({ title: 'Hijacked' }));
  }, true);
  await check('cbt_exams: tutor moves an exam to centre B denied', async () => {
    await assertFails(tutA().firestore().doc('cbt_exams/exam-a1').update({ centreId: 'centre-b' }));
  }, true);
  await check('cbt_exams: centre A admin deletes a centre B exam denied', async () => {
    await assertFails(admA().firestore().doc('cbt_exams/exam-b1').delete());
  }, true);
  await check('cbt_exams: tutor deletes their own exam allowed', async () => {
    await assertSucceeds(tutA().firestore().doc('cbt_exams/exam-del-1').delete());
  });
  await check("cbt_exams: tutor deletes another tutor's exam denied", async () => {
    await assertFails(tutA().firestore().doc('cbt_exams/exam-a2').delete());
  });
  await check('cbt_exams: student deletes an exam denied', async () => {
    await assertFails(stuA().firestore().doc('cbt_exams/exam-a1').delete());
  });
  await check('cbt_exams: centre A admin deletes an own-centre exam allowed', async () => {
    await assertSucceeds(admA().firestore().doc('cbt_exams/exam-del-2').delete());
  });

  // ---------- tutors: JIT legacy cleanup ----------
  await check('tutors: the tutor deletes their own legacy duplicate doc allowed (verified email)', async () => {
    await assertSucceeds(tutAv().firestore().doc('tutors/legacy-dup').delete());
  }, true);
  await check('tutors: another user cannot delete a tutors doc by email match', async () => {
    await assertFails(tutB().firestore().doc('tutors/legacy-dup').delete());
  });
  await check('tutors: a tutor cannot delete their own live doc via the legacy path', async () => {
    await assertFails(tutAv().firestore().doc('tutors/uid-tut-a').delete());
  });

  // ---------- legacy global collections: server-only writes ----------
  await check('cms: unauthenticated read allowed (public website)', async () => {
    await assertSucceeds(unauth().firestore().doc('cms/c1').get());
  });
  await check('cms: admin write denied (server only)', async () => {
    await assertFails(admA().firestore().doc('cms/c1').update({ title: 'Defaced' }));
  }, true);
  await check('cms: platform staff browser write denied (server only)', async () => {
    await assertFails(tosCtx().firestore().doc('cms/c1').update({ title: 'Defaced' }));
  }, true);
  await check('settings/global: unauthenticated read allowed (public website)', async () => {
    await assertSucceeds(unauth().firestore().doc('settings/global').get());
  });
  await check('settings/global: admin write with a valid payload denied (server only)', async () => {
    await assertFails(admA().firestore().doc('settings/global').set({ centreName: 'Hijacked Centre', email: 'evil@test.com' }));
  }, true);
  await check('settings/global: platform staff browser write denied (server only)', async () => {
    await assertFails(tosCtx().firestore().doc('settings/global').set({ centreName: 'X', email: 'x@test.com' }));
  }, true);
} finally {
  if (testEnv) await testEnv.cleanup();
}

const total = results.length;
if (PREFIX_CHECK) {
  // Observed failures must match the flags exactly: that proves the suite detects each hole.
  const mismatches = results.filter((r) => !r.ok !== r.failsPreFix);
  const observedFails = results.filter((r) => !r.ok).length;
  const expectedFails = results.filter((r) => r.failsPreFix).length;
  for (const r of mismatches) {
    console.log(`MISMATCH  ${r.name}  expected ${r.failsPreFix ? 'FAIL' : 'PASS'} on the old rules, observed ${r.ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\nPre-fix detection: ${observedFails} of ${total} checks failed on these rules (${expectedFails} expected).`);
  console.log(mismatches.length === 0 ? 'PRE-FIX CHECK OK: failures match the flags exactly.' : `PRE-FIX CHECK FAILED: ${mismatches.length} mismatch(es).`);
  process.exit(mismatches.length === 0 ? 0 : 1);
}
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.msg}`}`);
console.log(`\n${total - failed.length}/${total} catalog-scope checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
