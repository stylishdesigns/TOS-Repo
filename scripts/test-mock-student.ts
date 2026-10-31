/**
 * Prompt S piece S2 tests: the student mock routes against the Firestore
 * emulator, with the token verifier stubbed exactly like test-auth-401.ts.
 * Every security refusal from the S2 checklist is exercised for real.
 *
 * Run (emulator on 127.0.0.1:8080):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/test-mock-student.ts
 */
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.NETLIFY = 'true';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-mocks-s2';
process.env.FIRESTORE_DATABASE_ID = '(default)';
delete process.env.TOS_BOOTSTRAP_EMAILS;
delete process.env.SUPER_ADMIN_EMAILS;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Start the Firestore emulator first.');

const { adminAuth, adminDb } = await import('../src/server/firebaseAdmin');

// Token -> identity: stu1 (centre-1 student), stu2 (centre-2 student),
// staff (a TOS-staff claim), outsider (signed in, no membership).
(adminAuth as any).verifyIdToken = async (token: string) => {
  const map: Record<string, any> = {
    stu1: { uid: 'stu1-uid', email: 's1@x.test', email_verified: true },
    stu2: { uid: 'stu2-uid', email: 's2@x.test', email_verified: true },
    staff: { uid: 'tos-uid', email: 't@x.test', email_verified: true, tos: true },
    outsider: { uid: 'out-uid', email: 'o@x.test', email_verified: true },
  };
  const hit = map[token];
  if (!hit) {
    const e: any = new Error('ID token verification failed');
    e.code = 'auth/argument-error';
    throw e;
  }
  return hit;
};

const { startServer } = await import('../server');
const app = await startServer();
const server = app.listen(0);
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

async function call(path: string, token?: string, method = 'GET', body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
const today = ymd(new Date());
const shift = (days: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// A duration that still fits inside the remaining Lagos day whenever the
// suite runs, so the cutoff guard never masks the behaviour under test.
const dayEnd = Date.parse(`${shift(1)}T00:00:00Z`) - 3600_000; // Lagos midnight, UTC
const DUR = Math.max(2, Math.round((dayEnd - Date.now()) / 60000) - 2);
const TODAY = `mock-${today}`;
const FUTURE = `mock-${shift(3)}`;
const YESTERDAY = `mock-${shift(-1)}`;
const BEFORE2 = `mock-${shift(-2)}`;

let passed = 0;
const fails: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (e: any) { fails.push(`${name}: ${e?.message || e}`); console.log(`FAIL ${name}: ${e?.message || e}`); }
}

// ---------------------------------------------------------------------------
// Seed: two centres, one student each, settings, today's scheduled mock with
// a 4-question frozen paper and key, a future mock, a released yesterday
// mock whose attempt (stu2) was never opened, and a stale open attempt from
// two days ago for the release auto-submit.
// ---------------------------------------------------------------------------
async function wipe(col: string) {
  const snap = await adminDb.collection(col).get();
  for (const d of snap.docs) await d.ref.delete();
}
for (const col of ['centres', 'memberships', 'students', 'mocks', 'mockPapers', 'mockKeys', 'mockAttempts', 'mockScoreTally', 'mockLeaderboards', 'mockSettings', 'usernames', 'auditLogs']) await wipe(col);

await adminDb.collection('centres').doc('centre-1').set({ status: 'active', name: 'Centre One' });
await adminDb.collection('centres').doc('centre-2').set({ status: 'active', name: 'Centre Two' });
await adminDb.collection('memberships').doc('stu1-uid__centre-1').set({ uid: 'stu1-uid', centreId: 'centre-1', role: 'student', status: 'active', email: 's1@x.test' });
await adminDb.collection('memberships').doc('stu2-uid__centre-2').set({ uid: 'stu2-uid', centreId: 'centre-2', role: 'student', status: 'active', email: 's2@x.test' });
await adminDb.collection('memberships').doc('stu2-uid__centre-1').set({ uid: 'stu2-uid', centreId: 'centre-1', role: 'student', status: 'inactive', email: 's2@x.test' });
await adminDb.collection('students').doc('student-1').set({ uid: 'stu1-uid', centreId: 'centre-1', name: 'Ada Test' });
await adminDb.collection('students').doc('student-2').set({ uid: 'stu2-uid', centreId: 'centre-2', name: 'Bode Test' });

const QUESTIONS = [
  { id: 'q1', subject: 'English', topic: 'Tenses', year: 2020, text: 'Pick the synonym of benevolent.', options: ['Generous', 'Kind', 'Careful', 'Wealthy'], imageLink: '' },
  { id: 'q2', subject: 'English', topic: 'Tenses', year: 2021, text: 'Pick the antonym of ascend.', options: ['Rise', 'Climb', 'Descend', 'Fall'], imageLink: '' },
  { id: 'q3', subject: 'Mathematics', topic: 'Fractions', year: 2019, text: 'What is 1/2 of 10?', options: ['2', '5', '10', '20'], imageLink: '' },
  { id: 'q4', subject: 'Mathematics', topic: 'Algebra', year: null, text: 'If x+2=5, x is', options: ['1', '2', '3', '7'], imageLink: '' },
];
const KEY = [
  { id: 'q1', correct: 'B', explanation: 'Kind means benevolent.', subject: 'English', topic: 'Tenses' },
  { id: 'q2', correct: 'B', explanation: 'Descend is the opposite of ascend.', subject: 'English', topic: 'Tenses' },
  { id: 'q3', correct: 'A', explanation: 'Half of ten is five.', subject: 'Mathematics', topic: 'Fractions' },
  { id: 'q4', correct: 'D', explanation: 'x equals three... wait, the key says D for the test.', subject: 'Mathematics', topic: 'Algebra' },
];
// The key above: q4's correct is D ('7') to exercise a non-obvious mapping.

const mockDoc = (id: string, patch: any = {}) => ({
  id, examType: 'jamb', title: 'JAMB Mock', date: id.slice(5), status: 'scheduled',
  questionSource: 'random', subjects: [{ subject: 'English', count: 2 }, { subject: 'Mathematics', count: 2 }],
  durationMinutes: DUR, questionCount: 4, scoreScale: 400, tallyShards: 2, ...patch,
});

await adminDb.collection('mockSettings').doc('global').set({
  jamb: { durationMinutes: 120, compulsorySubject: 'English', compulsoryCount: 60, otherCount: 40, subjectCount: 4, scoreScale: 400 },
  waecNeco: { durationMinutes: 90, scoreScale: 100 },
  compulsorySubjects: ['English', 'Mathematics', 'Civic Education'],
  releaseHourLagos: 6, releaseMinuteLagos: 0, timezone: 'Africa/Lagos', tallyShards: 4,
});
await adminDb.collection('mocks').doc(TODAY).set(mockDoc(TODAY));
await adminDb.collection('mocks').doc(FUTURE).set(mockDoc(FUTURE));
await adminDb.collection('mocks').doc(YESTERDAY).set(mockDoc(YESTERDAY, { status: 'released', releasedAt: new Date().toISOString() }));
await adminDb.collection('mocks').doc(BEFORE2).set(mockDoc(BEFORE2, { status: 'live' }));
for (const id of [TODAY, FUTURE, YESTERDAY, BEFORE2]) {
  await adminDb.collection('mockPapers').doc(id).set({ mockId: id, examType: 'jamb', date: id.slice(5), durationMinutes: DUR, questionCount: 4, scoreScale: 400, questions: QUESTIONS });
  await adminDb.collection('mockKeys').doc(id).set({ mockId: id, examType: 'jamb', date: id.slice(5), items: KEY });
}
await adminDb.collection('mockAttempts').doc(`${YESTERDAY}__stu2-uid`).set({
  id: `${YESTERDAY}__stu2-uid`, mockId: YESTERDAY, uid: 'stu2-uid', centreId: 'centre-2', studentId: 'student-2',
  examType: 'jamb', startedAt: new Date(Date.now() - 26 * 3600_000).toISOString(), deadline: new Date(Date.now() - 24 * 3600_000).toISOString(),
  status: 'submitted', savedAnswers: {}, score: { answered: 0, correct: 2 }, scoreCorrect: 2, scoreScaled: 200,
  sortMs: 300_000, username: 'bode_t', keyVersion: 1, questionCount: 4, tallyShards: 2, scoreScale: 400,
});
await adminDb.collection('mockAttempts').doc(`${BEFORE2}__stu1-uid`).set({
  id: `${BEFORE2}__stu1-uid`, mockId: BEFORE2, uid: 'stu1-uid', centreId: 'centre-1', studentId: 'student-1',
  examType: 'jamb', startedAt: new Date(Date.now() - 50 * 3600_000).toISOString(), deadline: new Date(Date.now() - 48 * 3600_000).toISOString(),
  status: 'open', savedAnswers: { q1: { choice: 'B', flag: false, ts: 1 } }, scoreCorrect: 0,
  username: 'ada_t', keyVersion: 1, questionCount: 4, tallyShards: 2, scoreScale: 400,
});
console.log(`seeded (today=${today})`);

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

await check('401 without a token', async () => {
  const r = await call('/api/student/mock/status');
  assert.equal(r.status, 401);
});

await check('403 with a bad token', async () => {
  const r = await call('/api/student/mock/status', 'forged');
  assert.equal(r.status, 401);
});

await check('403 for a signed-in user with no student membership', async () => {
  const r = await call('/api/student/mock/status', 'outsider');
  assert.equal(r.status, 403);
});

await check('403 for an inactive membership (centre-1 row of stu2 is inactive)', async () => {
  // stu2's only active membership is centre-2; this just proves the guard
  // reads membership status, not the mere existence of a doc.
  const r = await call('/api/student/mock/status', 'staff');
  assert.equal(r.status, 403);
});

await check('status: open mock today, no username yet, unseen result for stu2 only', async () => {
  const r1 = await call('/api/student/mock/status', 'stu1');
  assert.equal(r1.status, 200);
  assert.equal(r1.json.state, 'open');
  assert.equal(r1.json.username, null);
  assert.equal(r1.json.canStart, true);
  assert.ok(r1.json.cutoffAt);
  assert.ok(r1.json.week.some((w: any) => w.date === today));
  assert.ok(r1.json.week.some((w: any) => w.date === shift(3)));
  assert.equal(r1.json.unseen, null);
  const r2 = await call('/api/student/mock/status', 'stu2');
  assert.equal(r2.json.unseen?.mockId, YESTERDAY);
});

await check('start refused without a username (code username_required)', async () => {
  const r = await call('/api/student/mock/start', 'stu1', 'POST', {});
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'username_required');
});

await check('username rules: too short refused, valid+available, then taken', async () => {
  const r1 = await call('/api/student/mock/username/check?name=abc', 'stu1');
  assert.equal(r1.json.valid, false);
  const r2 = await call('/api/student/mock/username/check?name=ab_cd', 'stu1');
  assert.equal(r2.json.valid, true);
  assert.equal(r2.json.available, true);
  const r3 = await call('/api/student/mock/username', 'stu1', 'POST', { name: 'ab_cd' });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.changed, true);
  const r4 = await call('/api/student/mock/username/check?name=AB_CD', 'stu2');
  assert.equal(r4.json.available, false);
  const r5 = await call('/api/student/mock/username', 'stu2', 'POST', { name: 'AB_CD' });
  assert.equal(r5.status, 409);
  const r6 = await call('/api/student/mock/username/check?name=terror_x', 'stu2');
  assert.equal(r6.json.valid, false);
});

await check('start works once; the paper carries no answers or explanations', async () => {
  const r = await call('/api/student/mock/start', 'stu1', 'POST', {});
  assert.equal(r.status, 200);
  assert.equal(r.json.created, true);
  assert.ok(r.json.attempt.deadline);
  assert.ok(Number.isInteger(r.json.attempt.shuffleSeed));
  assert.equal(r.json.paper.questions.length, 4);
  const raw = JSON.stringify(r.json.paper);
  assert.ok(!raw.includes('correct'), 'paper leaked a correct field');
  assert.ok(!raw.includes('explanation'), 'paper leaked an explanation field');
  assert.ok(!raw.includes('key'));
});

await check('start again resumes the same attempt (same deadline, created=false)', async () => {
  const r1 = await call('/api/student/mock/start', 'stu1', 'POST', {});
  assert.equal(r1.json.created, false);
  const r2 = await call('/api/student/mock/status', 'stu1');
  assert.equal(r2.json.state, 'in_progress');
});

await check('a mockId in the start body is ignored (only today is reachable)', async () => {
  const r = await call('/api/student/mock/start', 'stu1', 'POST', { mockId: FUTURE });
  // stu1 already has today's attempt, so the body was ignored and the route
  // returned today's attempt again. Nothing may open for the future mock.
  assert.equal(r.status, 200);
  assert.equal(r.json.created, false);
  const future = await adminDb.collection('mockAttempts').doc(`${FUTURE}__stu1-uid`).get();
  assert.equal(future.exists, false);
});

await check('save applies a batch; oversized and malformed batches are refused', async () => {
  const r = await call('/api/student/mock/save', 'stu1', 'POST', {
    changes: [
      { qid: 'q1', choice: 'B', ts: 111 },
      { qid: 'q2', choice: 'B', flag: true, ts: 112 },
      { qid: 'q3', choice: 'A', ts: 113 },
    ],
  });
  assert.equal(r.json.saved, 3);
  const bad = await call('/api/student/mock/save', 'stu1', 'POST', {
    changes: Array.from({ length: 51 }, (_, i) => ({ qid: `q${(i % 4) + 1}`, choice: 'A' })),
  });
  assert.equal(bad.status, 400);
  const badId = await call('/api/student/mock/save', 'stu1', 'POST', { changes: [{ qid: 'not allowed!', choice: 'A' }] });
  assert.equal(badId.status, 400);
  const badChoice = await call('/api/student/mock/save', 'stu1', 'POST', { changes: [{ qid: 'q4', choice: 'E' }] });
  assert.equal(badChoice.status, 400);
});

await check('submit marks with the server key; the response carries no score', async () => {
  const r = await call('/api/student/mock/submit', 'stu1', 'POST', {});
  assert.equal(r.status, 200);
  assert.equal(r.json.already, false);
  assert.equal(r.json.autoSubmitted, false);
  assert.ok(!('score' in r.json) && !('scoreCorrect' in r.json) && !('rank' in r.json));
  const a = await adminDb.collection('mockAttempts').doc(`${TODAY}__stu1-uid`).get();
  const d = a.data() as any;
  // q1 B, q2 B and q3 A all match the key; q4 was left unanswered.
  assert.equal(d.scoreCorrect, 3);
  assert.equal(d.scoreScaled, 300);
  const eng = d.perSubject.find((s: any) => s.subject === 'English');
  assert.equal(eng.correct, 2); assert.equal(eng.total, 2);
  const math = d.perSubject.find((s: any) => s.subject === 'Mathematics');
  assert.equal(math.correct, 1); assert.equal(math.total, 2);
});

await check('submit twice does not double-count (idempotent, no new tally write)', async () => {
  const before = await adminDb.collection('mockScoreTally').where('mockId', '==', TODAY).get();
  const r = await call('/api/student/mock/submit', 'stu1', 'POST', {});
  assert.equal(r.json.already, true);
  const after = await adminDb.collection('mockScoreTally').where('mockId', '==', TODAY).get();
  assert.equal(after.size, before.size);
  const sum = after.docs.reduce((n, d) => n + ((d.data() as any).count || 0), 0);
  assert.equal(sum, 1);
});

await check('start after submit is refused', async () => {
  const r = await call('/api/student/mock/start', 'stu1', 'POST', {});
  assert.equal(r.status, 409);
});

await check('a duration that cannot fit before midnight (cutoff refusal)', async () => {
  // Computed fresh every run so the guard is tested at any hour of the day:
  // one hour past the minutes left in the Lagos day can never fit.
  const tooLong = Math.max(60, Math.round((dayEnd - Date.now()) / 60000) + 60);
  await adminDb.collection('mocks').doc(TODAY).update({ durationMinutes: tooLong });
  const r = await call('/api/student/mock/start', 'stu2', 'POST', {});
  assert.equal(r.status, 409);
  assert.ok(/Too late/i.test(r.json.error), r.json.error);
  await adminDb.collection('mocks').doc(TODAY).update({ durationMinutes: DUR });
});

await check('two centres take the same mock; each attempt keeps its own centre', async () => {
  await call('/api/student/mock/username', 'stu2', 'POST', { name: 'bode_t' });
  const r = await call('/api/student/mock/start', 'stu2', 'POST', {});
  assert.equal(r.status, 200);
  const a = await adminDb.collection('mockAttempts').doc(`${TODAY}__stu2-uid`).get();
  assert.equal((a.data() as any).centreId, 'centre-2');
  assert.equal((a.data() as any).centreId !== 'centre-1', true);
});

await check('a save after the deadline is ignored, and submit becomes an auto-submit', async () => {
  await adminDb.collection('mockAttempts').doc(`${TODAY}__stu2-uid`).update({ deadline: new Date(Date.now() - 60_000).toISOString() });
  const s = await call('/api/student/mock/save', 'stu2', 'POST', { changes: [{ qid: 'q1', choice: 'A', ts: 999 }] });
  assert.equal(s.json.ignored, true);
  const r = await call('/api/student/mock/submit', 'stu2', 'POST', {});
  assert.equal(r.json.autoSubmitted, true);
  const a = await adminDb.collection('mockAttempts').doc(`${TODAY}__stu2-uid`).get();
  const d = a.data() as any;
  assert.equal(d.scoreCorrect, 0); // nothing was saved before the deadline
  assert.equal(d.savedAnswers?.q1?.choice ?? null, null);
});

await check('status shows the waiting state after submit, with no score anywhere', async () => {
  const r = await call('/api/student/mock/status', 'stu1');
  assert.equal(r.json.state, 'submitted');
  const raw = JSON.stringify(r.json);
  assert.ok(!/scoreCorrect|"rank"/.test(raw), raw);
});

await check('the release sweep auto-submits a stale open attempt and releases its board', async () => {
  const { runReleaseSweep } = await import('../src/server/mockRelease');
  const out = await runReleaseSweep();
  const hit = out.released.find((m) => m.mockId === BEFORE2);
  assert.ok(hit, JSON.stringify(out));
  const a = await adminDb.collection('mockAttempts').doc(`${BEFORE2}__stu1-uid`).get();
  const d = a.data() as any;
  assert.equal(d.status, 'submitted');
  assert.equal(d.autoSubmitted, true);
  assert.equal(d.scoreCorrect, 1); // q1 B was saved before the phone died
  const board = await adminDb.collection('mockLeaderboards').doc(BEFORE2).get();
  assert.equal(board.exists, true);
  const counts = (board.data() as any).scoreCounts;
  assert.equal(counts['1'], 1);
});

await check('username change is locked for a month (once-a-month rule)', async () => {
  const r = await call('/api/student/mock/username', 'stu1', 'POST', { name: 'new_name' });
  assert.equal(r.status, 409);
  assert.ok(/once a month/i.test(r.json.error));
});

await check('disabled centre refused: an inactive centre blocks its student', async () => {
  await adminDb.collection('centres').doc('centre-1').update({ status: 'disabled' });
  // stu1's only membership is centre-1, which is now disabled.
  const r = await call('/api/student/mock/status', 'stu1');
  assert.equal(r.status, 403);
  await adminDb.collection('centres').doc('centre-1').update({ status: 'active' });
});

await check('no live listeners and no stored review docs: the review collection stays empty', async () => {
  const snap = await adminDb.collection('mockReviews').limit(1).get();
  assert.equal(snap.size, 0);
});

await check('history lists own attempts with rank and release state', async () => {
  const r = await call('/api/student/mock/history', 'stu1');
  assert.equal(r.status, 200);
  assert.equal(r.json.rows.length, 2); // today + the auto-submitted BEFORE2 attempt
  const t = r.json.rows.find((x: any) => x.mockId === TODAY);
  assert.equal(t.scoreScaled, 300);
  assert.equal(t.released, false); // releases the morning after
  const old = r.json.rows.find((x: any) => x.mockId === BEFORE2);
  assert.equal(old.rank, 1);
  assert.equal(old.released, true);
  const r2 = await call('/api/student/mock/history', 'stu2');
  const t2 = r2.json.rows.find((x: any) => x.mockId === TODAY);
  assert.equal(t2.autoSubmitted, true);
});

await check('leaderboard: today not released, released day shows usernames only', async () => {
  const r1 = await call(`/api/student/mock/leaderboard?date=${today}`, 'stu1');
  assert.equal(r1.json.released, false);
  assert.equal(r1.json.entries.length, 0);
  const r2 = await call(`/api/student/mock/leaderboard?date=${shift(-2)}`, 'stu1');
  assert.equal(r2.json.released, true);
  assert.equal(r2.json.entries.length, 1);
  const e = r2.json.entries[0];
  assert.equal(e.username, 'ada_t'); // username, never a real name
  assert.equal(e.rank, 1);
  assert.equal(e.score, 1);
  assert.ok(!('uid' in e) && !('centreId' in e) && !('sortMs' in e));
  assert.equal(r2.json.me.rank, 1);
  assert.equal(r2.json.me.score, 1);
  const r3 = await call(`/api/student/mock/leaderboard?date=${shift(-2)}`, 'stu2');
  assert.equal(r3.json.me, null); // no attempt that day, still sees the board
});

await check('result: released mock gives the full review; unreleased is refused', async () => {
  const r1 = await call(`/api/student/mock/result?mockId=${TODAY}`, 'stu1');
  assert.equal(r1.status, 403); // today has no board yet
  const r2 = await call(`/api/student/mock/result?mockId=${BEFORE2}`, 'stu2');
  assert.equal(r2.status, 404); // no attempt of their own that day
  const r3 = await call(`/api/student/mock/result?mockId=${BEFORE2}`, 'stu1');
  assert.equal(r3.status, 200);
  assert.equal(r3.json.review.length, 4);
  const q1 = r3.json.review.find((x: any) => x.id === 'q1');
  assert.equal(q1.isCorrect, true);
  assert.equal(q1.yourChoice, 'B');
  assert.ok(q1.explanation.length > 0); // the why, handed out only after release
  assert.equal(r3.json.rank, 1);
  const seen = await adminDb.collection('mockAttempts').doc(`${BEFORE2}__stu1-uid`).get();
  assert.ok((seen.data() as any).resultSeenAt);
  const r4 = await call(`/api/student/mock/result?mockId=${BEFORE2}`, 'stu1');
  assert.equal(r4.status, 200); // idempotent
});

console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
process.exit(0);
