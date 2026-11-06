// Firestore rules test for the centreSettings rule (G1b).
// Runs against the real firestore.rules file on the local Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/centreSettings.rules.test.mjs"
// Requires Java 21+ (the emulator runs on it). Exits 0 when every check passes.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const A = 'centre-a';
const B = 'centre-b';

let testEnv;

// The m claim is what /api/session/sync writes: centreId -> short role code
// (own, adm, sec, fin, tut, stu). Mirror roleCodeMap from server.ts here.
// Custom claims go at the top level of the token options.
const ctx = (m) => testEnv.authenticatedContext('uid-' + Object.values(m).join('-'), { m });
const unauth = () => testEnv.unauthenticatedContext();

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, e && e.message ? e.message.split('\n')[0] : String(e)]);
  }
}

try {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tos-rules',
    firestore: { rules: RULES },
  });

  const write = (who, docId) => (who === 'signed-out'
    ? unauth().firestore().doc(`centreSettings/${docId}`).set({ centreName: 'X' })
    : ctx(who).firestore().doc(`centreSettings/${docId}`).set({ centreName: 'X' }));
  const read = (who, docId) => (who === 'signed-out'
    ? unauth().firestore().doc(`centreSettings/${docId}`).get()
    : ctx(who).firestore().doc(`centreSettings/${docId}`).get());

  // WRITE matrix the rule must enforce
  await check('owner of A writes A__global', () => assertSucceeds(write({ [A]: 'own' }, `${A}__global`)));
  await check('admin of A writes A__attendance', () => assertSucceeds(write({ [A]: 'adm' }, `${A}__attendance`)));
  await check('admin of A writes A__cms', () => assertSucceeds(write({ [A]: 'adm' }, `${A}__cms`)));
  await check('tutor of A writes A__global', () => assertFails(write({ [A]: 'tut' }, `${A}__global`)));
  await check('student of A writes A__global', () => assertFails(write({ [A]: 'stu' }, `${A}__global`)));
  await check('owner of A writes B__global (other centre)', () => assertFails(write({ [A]: 'own' }, `${B}__global`)));
  await check('owner of B writes A__global (other centre)', () => assertFails(write({ [B]: 'own' }, `${A}__global`)));
  await check('signed-out writes A__global', () => assertFails(write('signed-out', `${A}__global`)));
  await check('member writes wrong id shape (A__bogus)', () => assertFails(write({ [A]: 'own' }, `${A}__bogus`)));

  // READ matrix (signed-in members of that centre only)
  await check('student of A reads A__global', () => assertSucceeds(read({ [A]: 'stu' }, `${A}__global`)));
  await check('tutor of A reads A__cms', () => assertSucceeds(read({ [A]: 'tut' }, `${A}__cms`)));
  await check('owner of A reads B__global (other centre)', () => assertFails(read({ [A]: 'own' }, `${B}__global`)));
  await check('signed-out reads A__global', () => assertFails(read('signed-out', `${A}__global`)));
} finally {
  if (testEnv) await testEnv.cleanup();
}

let failed = 0;
for (const [name, ok, msg] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'XX  '} ${name}${ok ? '' : ' -> ' + msg}`);
}
console.log(failed === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
