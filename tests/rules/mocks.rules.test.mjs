// Firestore rules test for the TOS Mocks deny blocks (Prompt M, M2).
// Runs against the real firestore.rules file on the local Firestore emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
//     "node tests/rules/mocks.rules.test.mjs"
// Requires Java 21+ (the emulator runs on it). Exits 0 when every check passes.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

// Every collection the mock feature owns must be invisible to browsers: no
// signed-out visitor, no student, no tutor and no centre admin may read or
// write any of it. The server uses the Admin SDK, which bypasses rules, so
// denial here never blocks TOS staff in the app.
const COLLECTIONS = [
  'mocks',
  'mockPapers',
  'mockKeys',
  'mockAttempts',
  'mockScoreTally',
  'mockLeaderboards',
  'usernames',
  'mockSettings',
];

let testEnv;

const contexts = {
  'signed-out': () => testEnv.unauthenticatedContext(),
  'student (m:stu)': () => testEnv.authenticatedContext('uid-stu', { m: { 'centre-excellence': 'stu' } }),
  'tutor (m:tut)': () => testEnv.authenticatedContext('uid-tut', { m: { 'centre-excellence': 'tut' } }),
  'centre admin (m:adm)': () => testEnv.authenticatedContext('uid-adm', { m: { 'centre-excellence': 'adm' } }),
  'verified, no centre': () => testEnv.authenticatedContext('uid-plain', {}),
};

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

  for (const collection of COLLECTIONS) {
    for (const [label, make] of Object.entries(contexts)) {
      await check(`${collection}: ${label} read denied`, async () => {
        await assertFails(make().firestore().doc(`${collection}/doc-x`).get());
      });
      await check(`${collection}: ${label} write denied`, async () => {
        await assertFails(make().firestore().doc(`${collection}/doc-x`).set({ probe: true }));
      });
    }
  }

  // Sanity check that the harness itself works: a collection with a real
  // rule must be writable by the matching role, so a silent all-allow or
  // all-deny regression in the rules file cannot pass this suite unnoticed.
  await check('sanity: centreSettings owner write succeeds', async () => {
    await assertSucceeds(
      contexts['student (m:stu)'] === null
        ? testEnv.unauthenticatedContext().firestore().doc('centreSettings/centre-a__global').set({ centreName: 'X' })
        : testEnv.authenticatedContext('uid-own', { m: { 'centre-a': 'own' } }).firestore().doc('centreSettings/centre-a__global').set({ centreName: 'X' }),
    );
  });
} finally {
  if (testEnv) await testEnv.cleanup();
}

let failed = 0;
for (const [name, ok, msg] of results) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}: ${msg || 'no message'}`);
  }
}
console.log(`mocks rules tests: ${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
