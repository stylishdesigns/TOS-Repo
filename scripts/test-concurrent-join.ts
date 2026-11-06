/**
 * Prompt A step 7 test: several students joining the same last seat at the
 * same moment - exactly one succeeds.
 *
 * Needs the Firestore emulator (no cloud access needed):
 *   1. npx firebase-tools emulators:start --only firestore
 *   2. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/test-concurrent-join.ts
 */
import assert from 'node:assert/strict';
import fs from 'fs';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 with the Firestore emulator running.');
  console.error('See the header of this file for the exact commands.');
  process.exit(1);
}

// The emulator ignores real credentials; initializeApp needs something valid-shaped.
const cfg = (() => {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIRESTORE_DATABASE_ID) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID,
    };
  }
  try {
    return JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  } catch {
    console.error('Set FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID, or provide');
    console.error('firebase-applet-config.json locally, and re-run.');
    process.exit(1);
  }
})();
process.env.VITE_FIREBASE_PROJECT_ID = cfg.projectId;
process.env.VITE_FIRESTORE_DATABASE_ID = cfg.firestoreDatabaseId || '(default)';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: 'test@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
  project_id: cfg.projectId,
});

const { adminDb } = await import('../src/server/firebaseAdmin');
const { joinCentreService } = await import('../src/server/tenantService');

const centreId = `test-centre-${Date.now()}`;

async function main() {
  // One free seat, auto-approve on, so a join immediately takes the seat.
  await adminDb.collection('centres').doc(centreId).set({
    id: centreId,
    name: 'Concurrency Test Centre',
    status: 'active',
    autoApproveStudents: true,
    createdAt: new Date().toISOString(),
  });
  await adminDb.collection('centreBilling').doc(centreId).set({
    centreId,
    planId: 'centre_standard',
    seatCap: 1,
    billedSeatsMinimum: 1,
    skippedTrial: false,
    discountPct: 0,
    activeStudentCount: 0,
  });

  const code = '999991';
  await adminDb.collection('accessCodes').doc(code).set({ centreId });

  const joiners = ['a1', 'b2', 'c3', 'd4', 'e5'];
  const results = await Promise.allSettled(
    joiners.map((uid) =>
      joinCentreService({ uid, userEmail: `${uid}@test.example`, code, ip: '127.0.0.1' })
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const centreFull = results.filter(
    (r) => r.status === 'rejected' && (r.reason as any)?.code === 'CENTRE_FULL'
  ).length;

  const active = await adminDb
    .collection('memberships')
    .where('centreId', '==', centreId)
    .where('status', '==', 'active')
    .get();

  console.log(`joins attempted: ${joiners.length}, succeeded: ${succeeded}, CENTRE_FULL: ${centreFull}, active memberships: ${active.size}`);
  assert.equal(active.size, 1, 'exactly one student took the single seat');
  assert.equal(succeeded + centreFull, joiners.length, 'every join either succeeded or was refused cleanly');
  console.log('PASS: exactly one join took the last seat.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL:', err?.message || err);
  process.exit(1);
});
