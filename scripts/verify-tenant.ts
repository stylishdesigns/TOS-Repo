/**
 * Read-only tenant verification (Prompt A step 11).
 *
 * Prints, per tenant collection: total documents, documents with a centreId and
 * without one, centres, access codes, memberships by role and status, and
 * anything that looks wrong. Reads nothing and writes nothing.
 *
 * Credentials (one of):
 *   FIREBASE_SERVICE_ACCOUNT_JSON   - the service-account key JSON as a string
 *                                     (FIREBASE_SERVICE_ACCOUNT_KEY also works)
 *   GOOGLE_APPLICATION_CREDENTIALS  - path to a service-account key file
 * Run:  npx tsx scripts/verify-tenant.ts
 */
import fs from 'fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

async function main() {
  let cfg: { projectId: string; firestoreDatabaseId?: string } = {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID || '',
  };
  if (!cfg.projectId || !cfg.firestoreDatabaseId) {
    try {
      const local = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
      cfg.projectId = cfg.projectId || local.projectId;
      cfg.firestoreDatabaseId = cfg.firestoreDatabaseId || local.firestoreDatabaseId || '(default)';
    } catch {
      // no local file; fall through to the check below
    }
  }
  if (!cfg.projectId || !cfg.firestoreDatabaseId) {
    console.error('Set FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID (or provide');
    console.error('firebase-applet-config.json locally) and re-run.');
    process.exit(1);
  }
  const svcJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!svcJson && !adcPath) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON (the key JSON as a string) or');
    console.error('GOOGLE_APPLICATION_CREDENTIALS (path to the key file) and re-run.');
    process.exit(1);
  }
  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          projectId: cfg.projectId,
          ...(svcJson ? { credential: cert(JSON.parse(svcJson)) } : {}),
        });
  const db = getFirestore(app, cfg.firestoreDatabaseId || '(default)');
  console.log(`Project: ${cfg.projectId}  Database: ${cfg.firestoreDatabaseId || '(default)'}\n`);

  const centres = new Map<string, any>();
  const centreSnap = await db.collection('centres').get();
  centreSnap.forEach((d) => centres.set(d.id, d.data()));
  console.log(`centres: ${centres.size}`);

  const codes = new Map<string, any>();
  const codeSnap = await db.collection('accessCodes').get();
  codeSnap.forEach((d) => codes.set(d.id, d.data()));
  console.log(`accessCodes: ${codes.size}`);

  const memByRole = new Map<string, number>();
  const memByStatus = new Map<string, number>();
  const memSnap = await db.collection('memberships').get();
  memSnap.forEach((d) => {
    const data = d.data();
    memByRole.set(data.role, (memByRole.get(data.role) || 0) + 1);
    memByStatus.set(data.status, (memByStatus.get(data.status) || 0) + 1);
  });
  console.log(`memberships: ${memSnap.size}`);
  console.log('  by role:', JSON.stringify(Object.fromEntries(memByRole)));
  console.log('  by status:', JSON.stringify(Object.fromEntries(memByStatus)));

  console.log('\nPer-collection centreId coverage:');
  let problems: string[] = [];
  for (const name of TENANT_COLLECTIONS) {
    const snap = await db.collection(name).limit(5000).get();
    let withId = 0;
    let without: string[] = [];
    snap.forEach((d) => {
      if (d.data().centreId) withId++;
      else if (without.length < 5) without.push(d.id);
    });
    const flag = without.length ? '  <-- MISSING centreId' : '';
    console.log(`  ${name}: ${snap.size} docs, ${withId} with centreId${flag}`);
    if (without.length) {
      problems.push(`${name}: ${snap.size - withId} docs without centreId (e.g. ${without.join(', ')})`);
    }
  }

  const settingsSnap = await db.collection('settings').get();
  const settingsIds: string[] = [];
  settingsSnap.forEach((d) => settingsIds.push(d.id));
  console.log(`  settings: ${settingsSnap.size} docs (${settingsIds.join(', ')})`);

  for (const [code, data] of codes) {
    if (!data?.centreId || !centres.has(data.centreId)) {
      problems.push(`accessCodes/${code} points to unknown centre "${data?.centreId}"`);
    }
  }
  memSnap.forEach((d) => {
    const data = d.data();
    if (data.centreId && !centres.has(data.centreId)) {
      problems.push(`memberships/${d.id} points to unknown centre "${data.centreId}"`);
    }
  });

  const billingSnap = await db.collection('centreBilling').get();
  console.log(`centreBilling: ${billingSnap.size} docs`);
  billingSnap.forEach((d) => {
    if (!centres.has(d.id)) problems.push(`centreBilling/${d.id} has no matching centre`);
  });

  const plansSnap = await db.collection('platformPlans').get();
  const planIds: string[] = [];
  plansSnap.forEach((d) => planIds.push(d.id));
  console.log(`platformPlans: ${planIds.join(', ') || 'NONE (run scripts/seed-platform-plans.ts)'}`);
  const configDoc = await db.collection('platformConfig').doc('global').get();
  console.log(`platformConfig/global: ${configDoc.exists ? 'present' : 'MISSING (run scripts/seed-platform-plans.ts)'}`);

  console.log('\nAnomalies:');
  if (problems.length === 0) console.log('  none found');
  else problems.forEach((p) => console.log('  - ' + p));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('verify-tenant failed:', err?.message || err);
    process.exit(1);
  });
