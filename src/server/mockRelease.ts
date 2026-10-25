/**
 * Mock release (piece M5a).
 *
 * The overnight job: every mock whose day has ended (its date is before
 * today in Africa/Lagos) moves scheduled | live | closed -> released at
 * 6:00 a.m. Lagos, provided no attempt is still inside its deadline window.
 *
 * Release never re-reads attempts one by one for scoring: the tally was
 * built with atomic increments as students submitted, so release reads only
 * the tiny tally shards, sums them, and writes the leaderboard. Exactly two
 * writes per released mock (the board and the status flip), in one atomic
 * batch, so a re-run can never produce half a release. Already-released
 * mocks are skipped, so the whole thing is safe to re-run.
 *
 * Attempt contract (the student-side piece writes these at start/submit):
 *   { id: `${mockId}__${uid}`, mockId, uid, centreId, examType, startedAt,
 *     deadline (ISO), status: 'open' | 'submitted', savedAnswers,
 *     score: { answered, correct }, scoreCorrect: number, sortMs: number,
 *     username: string, keyVersion: number }
 */
import { adminDb } from './firebaseAdmin';
import { httpError } from './tenantService';
import { MOCKS, MOCK_ATTEMPTS, MOCK_TALLY, MOCK_LEADERBOARDS, audit, lagosToday } from './mockRoutes';

const TOP_ENTRIES = 100;
const OPEN_ATTEMPT_CAP = 25;

async function releaseOne(mockId: string, mock: any, source: string, by?: string): Promise<'released' | 'deferred'> {
  // 1. No attempt may still be inside its deadline window. Deadlines always
  //    end before midnight Lagos, so at release time this is normally empty;
  //    the check is the M1 safety rail, not the common path.
  const openSnap = await adminDb.collection(MOCK_ATTEMPTS)
    .where('mockId', '==', mockId)
    .where('status', '==', 'open')
    .limit(OPEN_ATTEMPT_CAP)
    .get();
  const now = Date.now();
  const stillLive = openSnap.docs.some((d) => {
    const deadline = Date.parse(String((d.data() as any).deadline || ''));
    return Number.isFinite(deadline) && deadline > now;
  });
  if (stillLive) return 'deferred';

  // 2. Sum the tally shards: one equality query over tiny docs.
  const tallySnap = await adminDb.collection(MOCK_TALLY).where('mockId', '==', mockId).get();
  const scoreCounts: Record<string, number> = {};
  for (const doc of tallySnap.docs) {
    const d = doc.data() as any;
    const score = Number(d.score);
    if (!Number.isFinite(score)) continue;
    const k = String(score);
    scoreCounts[k] = (scoreCounts[k] || 0) + (Number(d.count) || 0);
  }
  const totalAttempts = Object.values(scoreCounts).reduce((a, b) => a + b, 0);

  // 3. Top 100 by score, tied scores ordered by faster finish (sortMs).
  //    Needs the mockAttempts composite index (mockId ASC, scoreCorrect DESC)
  //    from firestore.indexes.json. Open (never-submitted) attempts are
  //    filtered out here rather than in the query, so no extra index.
  const topSnap = await adminDb.collection(MOCK_ATTEMPTS)
    .where('mockId', '==', mockId)
    .orderBy('scoreCorrect', 'desc')
    .limit(TOP_ENTRIES)
    .get();
  const rows = topSnap.docs
    .map((d) => d.data() as any)
    .filter((d) => String(d.status || '') === 'submitted')
    .map((d) => ({
      username: String(d.username || ''),
      score: Number(d.scoreCorrect) || 0,
      sortMs: Number(d.sortMs) || 0,
    }));
  rows.sort((a, b) => (b.score - a.score) || (a.sortMs - b.sortMs));
  const entries: Array<{ rank: number; username: string; score: number; sortMs: number }> = [];
  rows.forEach((e, i) => {
    // Ties share the rank of the first of their group (M1 settled answer).
    const rank = i > 0 && rows[i - 1].score === e.score ? entries[i - 1].rank : i + 1;
    entries.push({ rank, username: e.username, score: e.score, sortMs: e.sortMs });
  });

  // 4. One batch: the board + the status flip.
  const releasedAt = new Date().toISOString();
  const batch = adminDb.batch();
  batch.set(adminDb.collection(MOCK_LEADERBOARDS).doc(mockId), {
    id: mockId,
    mockId,
    examType: mock.examType || null,
    mockDate: mock.date,
    mockTitle: mock.title || '',
    releasedAt,
    totalAttempts,
    entries,
    // Per-score counts power each student's own-rank math at read time:
    // rank = 1 + everyone who scored higher, ties share a rank.
    scoreCounts,
    lastEntryScore: entries.length ? entries[entries.length - 1].score : null,
  });
  batch.update(adminDb.collection(MOCKS).doc(mockId), {
    status: 'released',
    releasedAt,
    releasedTotalAttempts: totalAttempts,
    releasedEntries: entries.length,
  });
  await batch.commit();
  void audit({ area: 'mocks', action: 'release', mockId, source, by: by || null, totalAttempts, entries: entries.length });
  return 'released';
}

/** Manual release for one mock (the console's fallback button). */
export async function releaseMock(mockId: string, opts: { source: string; by?: string }): Promise<{ outcome: string; mockId: string }> {
  const id = String(mockId || '').trim();
  if (!/^mock-\d{4}-\d{2}-\d{2}$/.test(id)) throw httpError(400, 'That mock id looks wrong.');
  const snap = await adminDb.collection(MOCKS).doc(id).get();
  if (!snap.exists) throw httpError(404, 'Mock not found.');
  const mock = snap.data() as any;
  if (String(mock.status) === 'released') return { outcome: 'already', mockId: id };
  if (!(String(mock.date) < lagosToday())) {
    throw httpError(400, 'Results release the morning after the mock, not earlier.');
  }
  if (!['scheduled', 'live', 'closed'].includes(String(mock.status))) {
    throw httpError(400, `A ${mock.status} mock cannot be released.`);
  }
  const outcome = await releaseOne(id, mock, opts.source, opts.by);
  return { outcome, mockId: id };
}

/**
 * The sweep the overnight job runs. Past-dated mocks in any pre-release
 * status, oldest first, within a time budget. If the status+date composite
 * index is not deployed yet, falls back to a plain date query filtered in
 * memory so release never depends on deployment order.
 */
export async function runReleaseSweep(opts: { budgetMs?: number } = {}): Promise<{
  today: string;
  examined: number;
  released: Array<{ mockId: string; title?: string; date?: string }>;
  deferred: string[];
  errors: Array<{ mockId: string; error: string }>;
}> {
  const today = lagosToday();
  const t0 = Date.now();
  const budget = Math.max(1000, Math.min(opts.budgetMs ?? 8000, 55_000));
  let past: Array<{ id: string; mock: any }>;
  try {
    const snap = await adminDb.collection(MOCKS)
      .where('date', '<', today)
      .where('status', 'in', ['scheduled', 'live', 'closed'])
      .get();
    past = snap.docs.map((d) => ({ id: d.id, mock: d.data() as any }));
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (!/index/i.test(msg)) throw e;
    const snap = await adminDb.collection(MOCKS).where('date', '<', today).get();
    past = snap.docs
      .map((d) => ({ id: d.id, mock: d.data() as any }))
      .filter((r) => ['scheduled', 'live', 'closed'].includes(String(r.mock.status)));
  }
  past = past
    .filter((r) => ['scheduled', 'live', 'closed'].includes(String(r.mock.status)))
    .sort((a, b) => String(a.mock.date).localeCompare(String(b.mock.date)));
  const released: Array<{ mockId: string; title?: string; date?: string }> = [];
  const deferred: string[] = [];
  const errors: Array<{ mockId: string; error: string }> = [];
  for (const r of past) {
    if (Date.now() - t0 > budget) { deferred.push(r.id); continue; }
    try {
      const outcome = await releaseOne(r.id, r.mock, 'scheduled-job');
      if (outcome === 'released') released.push({ mockId: r.id, title: r.mock.title, date: r.mock.date });
      else deferred.push(r.id);
    } catch (e: any) {
      errors.push({ mockId: r.id, error: e?.message || 'release failed' });
    }
  }
  return { today, examined: past.length, released, deferred, errors };
}
