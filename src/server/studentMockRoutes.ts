import express from 'express';
import * as crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { postMockOpenOnce } from './chatAutoPosts';
import { Caller, effectiveStatus, getBillingDoc, getPlatformConfig, httpError, listActiveMembershipsForUser } from './tenantService';
import {
  MOCKS,
  MOCK_ATTEMPTS,
  MOCK_TALLY,
  MOCK_LEADERBOARDS,
  MOCK_PAPERS,
  MOCK_KEYS,
  USERNAMES,
  audit,
  lagosToday,
  bumpMockTally,
  readSettings,
  MockSettings,
  KeyItem,
} from './mockRoutes';

/**
 * Student Mock (Prompt S, piece S2): the student-facing half of the TOS
 * daily mock. Every route here is for the signed-in student of an active
 * centre; identity and centre come from the verified token plus a
 * server-side membership lookup, never from the request body.
 *
 * The spine is unchanged from M1: the paper reaches the device WITHOUT its
 * answers, the marking key is read only inside the submit path, nothing is
 * scored or shown before release, and every time window is computed on the
 * server in Africa/Lagos.
 *
 * Attempt contract (extends the shape mockRelease.ts already expects):
 *   id `${mockId}__${uid}` (one per student per mock, structural),
 *   mockId, uid, centreId, studentId, examType, startedAt, deadline,
 *   status 'open' | 'submitted', submittedAt, markedAt, autoSubmitted,
 *   savedAnswers { [questionId]: { choice, flag, ts } }, lastSavedAt,
 *   shuffleSeed, score {answered, correct}, scoreCorrect, scoreScaled,
 *   perSubject, perTopic, sortMs, username, keyVersion,
 *   questionCount, tallyShards, scoreScale, resultSeenAt.
 *
 * savedAnswers entries keep the client timestamp (ts) of the last write so a
 * resume can merge the device copy with the server copy by timestamp.
 *
 * Read/write budget per action (measured, Firestore counts):
 *   status: 3-5 reads (username, today's attempt, week strip; yesterday's
 *           attempt and its mock only when an unseen result is possible),
 *           cached in instance memory for 60 s. 0 writes.
 *   username/check: 1 read, 0 writes (a GET never writes).
 *   username POST: 2 reads, 2-3 writes (claim, freed old claim, audit).
 *   start: 3 reads (attempt, mock, paper), 1 write on first start + audit,
 *          0 writes on resume. The username lookup rides the cached status
 *          when possible; it is 1 extra read on the cold path.
 *   save: 1 read + 2 writes (attempt update + audit) per batch.
 *   submit: 2 reads inside the transaction (attempt + key), then 1 write to
 *           the attempt, 1 tally shard, 1 audit. A second submit writes
 *           nothing and returns the stored receipt.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const QID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CHOICES = ['A', 'B', 'C', 'D'] as const;
const SAVE_BATCH_MAX = 50;
const SAVE_PAYLOAD_MAX = 64 * 1024;
const SAVE_PER_MINUTE = 30; // per server instance; the payload cap is the real guard
const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const STATUS_CACHE_TTL_MS = 60 * 1000;
const STATUS_CACHE_MAX = 500;

// Starter blocklist, checked case-insensitively on the server. Deliberately
// short: it blocks the obvious, and staff review stays the real control.
const USERNAME_BLOCKED = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'pussy',
  'cunt', 'nigger', 'nigga', 'faggot', 'wanker', 'slut', 'whore', 'porn',
  'sex', 'rape', 'hitler', 'terror',
];

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

/** Lagos wall-clock helpers. All windows live on the server. */
function lagosNowParts(d = new Date()): { ymd: string; hh: number; mm: number; ss: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { ymd, hh: Number(parts.hour) % 24, mm: Number(parts.minute), ss: Number(parts.second) };
}

/** The instant Lagos "today" flips to tomorrow, as a UTC millisecond. */
function lagosDayEndMs(ymd: string): number {
  // Lagos is always UTC+1 (no DST), so midnight Lagos is 23:00 UTC of the
  // same calendar date. The timezone is fixed in settings and never changes.
  return Date.parse(`${ymd}T23:00:00.000Z`) + 999;
}

function dateAddDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status cache: repeat taps cost nothing. Cleared by every mutation this
// student makes, and small enough to stay harmless in memory.
// ---------------------------------------------------------------------------
const statusCache = new Map<string, { at: number; body: any }>();

function cacheGet(key: string): any | null {
  const hit = statusCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > STATUS_CACHE_TTL_MS) {
    statusCache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheClearFor(uid: string): void {
  for (const key of statusCache.keys()) {
    if (key.startsWith(`status:${uid}:`)) statusCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Student identity: token-verified caller + an active student membership in
// an existing, enabled centre. Two centres never share data: the attempt
// records the centre the membership points at, and nothing else reads it.
// ---------------------------------------------------------------------------
interface StudentContext {
  caller: Caller;
  centreId: string;
  studentId: string;
}

async function requireStudent(req: express.Request): Promise<StudentContext> {
  const caller = getCaller(req);
  if (caller.tos) throw httpError(403, 'TOS staff do not take mocks. Use a student account.');
  const memberships = await listActiveMembershipsForUser(caller.uid, caller.email);
  const student = memberships.find((m) => String(m.role) === 'student' && String(m.status) === 'active');
  if (!student) throw httpError(403, 'You are not an active student of any centre.');
  const centreSnap = await adminDb.collection('centres').doc(student.centreId).get();
  if (!centreSnap.exists) throw httpError(403, 'Your centre is not available.');
  const centre = centreSnap.data() as any;
  // The platform's own member gate (same rule as validateActiveCentreService):
  // only a suspended centre loses its students. Trial and awaiting-payment
  // centres stay open for the students already enrolled in them.
  const billing = await getBillingDoc(student.centreId);
  const config = await getPlatformConfig();
  const effStatus = effectiveStatus({ ...centre } as any, billing, config);
  if (effStatus === 'suspended') throw httpError(403, 'Your centre is not available.');
  // The student record keyed by uid: the username register needs its id.
  const stuSnap = await adminDb.collection('students').where('uid', '==', caller.uid).limit(1).get();
  const stuDoc = stuSnap.docs[0];
  if (!stuDoc) throw httpError(403, 'No student record found for your sign-in.');
  return { caller, centreId: student.centreId, studentId: stuDoc.id };
}

/** One read: the student's current username claim, by uid. */
async function findUsernameByUid(uid: string) {
  const snap = await adminDb.collection(USERNAMES).where('uid', '==', uid).limit(1).get();
  return snap.docs[0] || null;
}

/** Shape of the verified caller context the username helpers take. */
type UsernameCtx = { caller: { uid: string }; centreId: string; studentId: string };

/** The caller's own claim, for the Profile screen (CH1 Step 1). Returns the
 * current username, when it may change again, and whose record it is. */
async function usernameStatusFor(ctx: UsernameCtx) {
  const doc = await findUsernameByUid(ctx.caller.uid);
  const username = doc ? String((doc.data() as any).username || '') : '';
  const lastChangedAt = doc ? String((doc.data() as any).lastChangedAt || (doc.data() as any).updatedAt || '') : '';
  const parsed = Date.parse(lastChangedAt);
  const canChangeAt = doc && Number.isFinite(parsed)
    ? new Date(parsed + USERNAME_CHANGE_COOLDOWN_MS).toISOString()
    : null;
  const canChange = !doc || !Number.isFinite(parsed) || Date.now() - parsed >= USERNAME_CHANGE_COOLDOWN_MS;
  return { username, lastChangedAt: lastChangedAt || null, canChangeAt, canChange, studentId: ctx.studentId };
}

/** Claim or change the caller's username: one transaction so two students can
 * never hold one name. Shared by the mock gate and the Profile screen. */
async function claimStudentUsername(ctx: UsernameCtx, name: string): Promise<{ username: string; changed: boolean }> {
  if (!/^[A-Za-z0-9_]{4,16}$/.test(name)) throw httpError(400, 'Usernames are 4 to 16 letters, numbers or underscores.');
  const lower = name.toLowerCase();
  if (USERNAME_BLOCKED.some((w) => lower.includes(w))) throw httpError(400, 'That name is not allowed. Pick another.');
  const nowIso = new Date().toISOString();
  let changed = false;
  await adminDb.runTransaction(async (tx) => {
    const mine = await tx.get(adminDb.collection(USERNAMES).where('studentId', '==', ctx.studentId));
    const current = mine.docs[0] || null;
    if (current) {
      const lastChange = Date.parse(String((current.data() as any).lastChangedAt || (current.data() as any).updatedAt || ''));
      if (Number.isFinite(lastChange) && Date.now() - lastChange < USERNAME_CHANGE_COOLDOWN_MS) {
        throw httpError(409, 'You can change your username once a month.');
      }
      if (current.id === lower) {
        // Same name, nothing to do.
        return;
      }
    }
    const target = await tx.get(adminDb.collection(USERNAMES).doc(lower));
    if (target.exists && String((target.data() as any)?.studentId || '') !== ctx.studentId) {
      throw httpError(409, 'That username is already taken.');
    }
    changed = true;
    for (const d of mine.docs) if (d.id !== lower) tx.delete(d.ref);
    tx.set(adminDb.collection(USERNAMES).doc(lower), {
      username: name,
      usernameLower: lower,
      studentId: ctx.studentId,
      uid: ctx.caller.uid,
      studentName: '',
      centreId: ctx.centreId,
      setBy: ctx.caller.uid,
      setByStudent: true,
      lastChangedAt: nowIso,
      updatedAt: nowIso,
    });
  });
  cacheClearFor(ctx.caller.uid);
  if (!changed) {
    void audit({ area: 'student-mock', action: 'username.keep', studentId: ctx.studentId, username: name, by: ctx.caller.uid });
    return { username: name, changed: false };
  }
  void audit({ area: 'student-mock', action: 'username.claim', studentId: ctx.studentId, username: name, by: ctx.caller.uid });
  return { username: name, changed: true };
}

// ---------------------------------------------------------------------------
// Marking. A pure function over the saved answers and the server-only key.
// The score scale comes from the mock's frozen settings, never from code.
// ---------------------------------------------------------------------------
export interface MarkResult {
  answered: number;
  correct: number;
  scoreScaled: number;
  perSubject: Array<{ subject: string; correct: number; total: number }>;
  perTopic: Array<{ subject: string; topic: string; correct: number; total: number }>;
}

export function markWithKey(savedAnswers: Record<string, any>, keyItems: KeyItem[], scoreScale: number): MarkResult {
  let answered = 0;
  let correct = 0;
  const subj = new Map<string, { correct: number; total: number }>();
  const topic = new Map<string, { subject: string; topic: string; correct: number; total: number }>();
  for (const item of keyItems || []) {
    const pick = savedAnswers?.[item.id];
    const choice = pick && typeof pick === 'object' ? String(pick.choice || '') : String(pick || '');
    const isAnswered = (CHOICES as readonly string[]).includes(choice);
    if (isAnswered) answered += 1;
    const isCorrect = isAnswered && choice === String(item.correct || '').toUpperCase();
    if (isCorrect) correct += 1;
    const subject = String(item.subject || 'General');
    const s = subj.get(subject) || { correct: 0, total: 0 };
    s.total += 1;
    if (isCorrect) s.correct += 1;
    subj.set(subject, s);
    const tKey = `${subject}||${String(item.topic || '')}`;
    const t = topic.get(tKey) || { subject, topic: String(item.topic || ''), correct: 0, total: 0 };
    t.total += 1;
    if (isCorrect) t.correct += 1;
    topic.set(tKey, t);
  }
  const total = (keyItems || []).length || 1;
  const scale = Number.isFinite(scoreScale) && scoreScale > 0 ? scoreScale : 100;
  return {
    answered,
    correct,
    scoreScaled: Math.round((correct / total) * scale),
    perSubject: [...subj.entries()].map(([subject, v]) => ({ subject, ...v })),
    perTopic: [...topic.values()],
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET status?date=: one day's mock view for the student date strip. Today is
// served by the main status route; this covers past and upcoming days: what
// was scheduled, whether the student took it, and the released result.
// ---------------------------------------------------------------------------
async function dayStatus(res: express.Response, ctx: StudentContext, date: string, today: string): Promise<unknown> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'That date is not valid.');
    const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    if (Math.abs(diff) > 62) throw httpError(400, 'That date is out of range.');

    const cacheKey = `status:${ctx.caller.uid}:${date}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const mockSnap = await adminDb.collection(MOCKS).doc(`mock-${date}`).get();
    const m = mockSnap.exists ? (mockSnap.data() as any) : null;
    const usable = Boolean(m) && !['cancelled', 'void', 'draft', 'archived'].includes(String(m.status));

    const aSnap = await adminDb.collection(MOCK_ATTEMPTS).doc(`mock-${date}__${ctx.caller.uid}`).get();
    const a = aSnap.exists ? (aSnap.data() as any) : null;

    const mock = usable ? {
      id: `mock-${date}`,
      title: String(m.title || ''),
      examType: String(m.examType || ''),
      subjects: (m.subjects || []).map((x: any) => String(x.subject || x)),
      questionCount: Number(m.questionCount || 0),
      durationMinutes: Number(m.durationMinutes || 0),
      status: String(m.status),
    } : null;

    let state = 'no_mock';
    if (diff > 0 && usable) state = 'upcoming';
    else if (diff < 0 && usable) state = a && String(a.status) === 'submitted' ? 'submitted' : 'missed';

    const released = state === 'submitted' && Boolean(
      (m && String(m.status) === 'released')
      || a?.rankCorrect != null
      || (a?.releasesAt && Date.now() >= Date.parse(String(a.releasesAt))),
    );

    const { settings } = await readSettings();
    const releaseAt = new Date(
      Date.parse(`${dateAddDays(date, 1)}T00:00:00.000Z`)
      + (settings.releaseHourLagos - 1) * 3600_000 + settings.releaseMinuteLagos * 60_000,
    ).toISOString();

    const body = {
      ok: true,
      date,
      isToday: false,
      state,
      mock,
      attempt: a ? {
        status: String(a.status || ''),
        submittedAt: a.submittedAt || null,
        autoSubmitted: Boolean(a.autoSubmitted),
      } : null,
      released,
      result: released ? {
        scoreCorrect: Number(a.scoreCorrect || 0),
        questionCount: Number(a.questionCount || 0),
        scoreScaled: a.scoreScaled == null ? null : Number(a.scoreScaled),
        scoreScale: Number(a.scoreScale || 0),
        rank: a.rankCorrect == null ? null : Number(a.rankCorrect),
      } : null,
      releaseAt,
    };
    if (statusCache.size >= STATUS_CACHE_MAX) statusCache.clear();
    statusCache.set(cacheKey, { at: Date.now(), body });
    res.json(body);
  } catch (error: any) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    console.error('[student-mock] day status failed:', error?.message || error);
    res.status(500).json({ error: 'Could not load that day.' });
  }
}

export function registerStudentMockRoutes(app: express.Express): void {
  // -----------------------------------------------------------------------
  // GET status: everything the Today tab needs, in one call.
  // -----------------------------------------------------------------------
  app.get('/api/student/mock/status', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const today = lagosToday();
      const qDate = String((req.query as any)?.date || '');
      if (qDate && qDate !== today) return dayStatus(res, ctx, qDate, today);
      const cacheKey = `status:${ctx.caller.uid}:${today}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const now = Date.now();
      const serverNow = new Date(now).toISOString();
      const { settings } = await readSettings();

      // One week strip query covers today's mock too (date >= today).
      const weekEnd = dateAddDays(today, 6);
      const weekSnap = await adminDb.collection(MOCKS)
        .where('date', '>=', today)
        .where('date', '<=', weekEnd)
        .get();
      const week = weekSnap.docs
        .map((d) => d.data() as any)
        .filter((m) => !['cancelled', 'void', 'draft', 'archived'].includes(String(m.status)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((m) => ({
          id: m.id, date: m.date, title: m.title, examType: m.examType, status: m.status,
          durationMinutes: m.durationMinutes, subjects: m.subjects, questionCount: m.questionCount,
        }));
      const todayMock = week.find((m) => m.date === today) || null;
      const nextMock = week.find((m) => m.date !== today && ['scheduled', 'live'].includes(String(m.status))) || null;

      // The attempt for today, by id: no query.
      const todayAttemptId = todayMock ? `${todayMock.id}__${ctx.caller.uid}` : '';
      const attemptSnap = todayAttemptId ? await adminDb.collection(MOCK_ATTEMPTS).doc(todayAttemptId).get() : null;
      const attempt: any = attemptSnap && attemptSnap.exists ? attemptSnap!.data() : null;

      // Unseen result: yesterday's attempt only (the release lands the
      // morning after; anything older surfaces in Past). Two direct gets,
      // skipped when there is nothing to check.
      let unseen: { mockId: string; date: string } | null = null;
      const yesterday = dateAddDays(today, -1);
      const yAttemptId = `mock-${yesterday}__${ctx.caller.uid}`;
      const ySnap = await adminDb.collection(MOCK_ATTEMPTS).doc(yAttemptId).get();
      if (ySnap.exists) {
        const y = ySnap.data() as any;
        if (String(y.status) === 'submitted' && !y.resultSeenAt) {
          const yMockSnap = await adminDb.collection(MOCKS).doc(`mock-${yesterday}`).get();
          if (yMockSnap.exists && String((yMockSnap.data() as any)?.status) === 'released') {
            unseen = { mockId: `mock-${yesterday}`, date: yesterday };
          }
        }
      }

      const usernameDoc = await findUsernameByUid(ctx.caller.uid);
      const username = usernameDoc
        ? { username: String((usernameDoc.data() as any).username), lastChangedAt: String((usernameDoc.data() as any).lastChangedAt || (usernameDoc.data() as any).updatedAt || '') }
        : null;

      // State machine. Everything time-related is the server's Lagos clock.
      const dayEnd = lagosDayEndMs(today);
      let state = 'no_mock';
      let canStart = false;
      if (todayMock) {
        const durationMs = Number(todayMock.durationMinutes || 0) * 60 * 1000;
        const status = String(todayMock.status);
        const openNow = ['scheduled', 'live'].includes(status) && attempt?.status !== 'submitted';
        if (attempt?.status === 'submitted' || (attempt?.status === 'open' && now > Number(Date.parse(attempt.deadline)))) {
          state = 'submitted';
        } else if (attempt?.status === 'open') {
          state = 'in_progress';
        } else if (openNow && now < dayEnd && now + durationMs <= dayEnd) {
          state = 'open';
          canStart = true;
        } else if (now + durationMs > dayEnd && now < dayEnd) {
          // The day is not over, but a full attempt no longer fits.
          state = 'closed';
        } else {
          state = 'missed';
        }

      // CH1 Step 6: the first time today's mock registers as open to any
      // student, announce it in the TOS channel. The once-per-mock claim
      // lives on the mock doc itself; fire-and-forget, never blocks this
      // response and never posts twice.
      if (state === 'open' && todayMock) {
        void postMockOpenOnce(adminDb.collection(MOCKS).doc(String(todayMock.id)));
      }
      }

      // Lagos release time on the next day: Lagos is UTC+1, so subtract the hour.
      const releaseTomorrow = new Date(
        Date.parse(`${dateAddDays(today, 1)}T00:00:00.000Z`)
        + (settings.releaseHourLagos - 1) * 3600_000 + settings.releaseMinuteLagos * 60_000
      ).toISOString();

      const body = {
        ok: true,
        serverNow,
        today,
        state,
        canStart,
        mock: todayMock ? {
          id: todayMock.id,
          title: todayMock.title,
          examType: todayMock.examType,
          subjects: (todayMock.subjects || []).map((s: any) => s.subject),
          durationMinutes: todayMock.durationMinutes,
          questionCount: todayMock.questionCount,
          status: todayMock.status,
        } : null,
        attempt: attempt ? {
          status: attempt.status,
          startedAt: attempt.startedAt,
          deadline: attempt.deadline,
          submittedAt: attempt.submittedAt || null,
          autoSubmitted: Boolean(attempt.autoSubmitted),
        } : null,
        cutoffAt: todayMock ? new Date(lagosDayEndMs(today) - Number(todayMock.durationMinutes || 0) * 60 * 1000).toISOString() : null,
        releaseAt: releaseTomorrow,
        nextMockDate: nextMock ? nextMock.date : null,
        week,
        username,
        unseen,
      };
      if (statusCache.size >= STATUS_CACHE_MAX) statusCache.clear();
      statusCache.set(cacheKey, { at: Date.now(), body });
      res.json(body);
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] status failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load your mock status.' });
    }
  });

  // -----------------------------------------------------------------------
  // Username: live availability check (GET, never writes) and the claim
  // (POST, one transaction so two students can never hold one name).
  // -----------------------------------------------------------------------
  app.get('/api/student/mock/username/check', async (req, res) => {
    try {
      await requireStudent(req);
      const name = String(req.query.name || '').trim();
      if (!/^[A-Za-z0-9_]{4,16}$/.test(name)) {
        return res.json({ ok: true, name, valid: false, available: false, reason: 'Usernames are 4 to 16 letters, numbers or underscores.' });
      }
      const lower = name.toLowerCase();
      if (USERNAME_BLOCKED.some((w) => lower.includes(w))) {
        return res.json({ ok: true, name, valid: false, available: false, reason: 'That name is not allowed. Pick another.' });
      }
      const snap = await adminDb.collection(USERNAMES).doc(lower).get();
      return res.json({ ok: true, name, valid: true, available: !snap.exists, reason: snap.exists ? 'That username is taken.' : null });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] username check failed:', error?.message || error);
      res.status(500).json({ error: 'Could not check that username.' });
    }
  });

  app.post('/api/student/mock/username', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const name = String(req.body?.name || '').trim();
      const r = await claimStudentUsername(ctx, name);
      res.json({ ok: true, username: r.username, changed: r.changed });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] username claim failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save your username.' });
    }
  });

  // -----------------------------------------------------------------------
  // CH1 Step 1: the same username register, but Profile is the only screen
  // that offers it. The mock leaderboard keeps reading the same claim; these
  // routes exist so Profile can show, check and save it, and so the mock and
  // chat welcome screens can send an empty student to Profile.
  // -----------------------------------------------------------------------
  app.get('/api/student/profile/username', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const status = await usernameStatusFor(ctx);
      res.json({ ok: true, ...status });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] profile username status failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load your username.' });
    }
  });

  app.get('/api/student/profile/username/check', async (req, res) => {
    try {
      await requireStudent(req);
      const name = String(req.query.name || '').trim();
      if (!/^[A-Za-z0-9_]{4,16}$/.test(name)) {
        return res.json({ ok: true, name, valid: false, available: false, reason: 'Usernames are 4 to 16 letters, numbers or underscores.' });
      }
      const lower = name.toLowerCase();
      if (USERNAME_BLOCKED.some((w) => lower.includes(w))) {
        return res.json({ ok: true, name, valid: false, available: false, reason: 'That name is not allowed. Pick another.' });
      }
      const snap = await adminDb.collection(USERNAMES).doc(lower).get();
      return res.json({ ok: true, name, valid: true, available: !snap.exists, reason: snap.exists ? 'That username is taken.' : null });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] profile username check failed:', error?.message || error);
      res.status(500).json({ error: 'Could not check that username.' });
    }
  });

  app.post('/api/student/profile/username', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const name = String(req.body?.name || '').trim();
      const r = await claimStudentUsername(ctx, name);
      res.json({ ok: true, username: r.username, changed: r.changed });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] profile username claim failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save your username.' });
    }
  });

  // -----------------------------------------------------------------------
  // POST start: one attempt, idempotent, the clock set on the server.
  // -----------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // The short-lived paper link (MB1 Step 3). The student never receives the
  // paper in the start response; they receive a signed, 10-minute link that
  // only their own identity can open, re-minted on every start and resume.
  // The link is an HMAC token over mockId, uid and an expiry, signed with a
  // server-side secret, so it cannot be forged, shared usefully (the uid is
  // bound), or reused after it expires. The paper is served by GET
  // /api/student/mock/paper only while the attempt is open and the mock is
  // scheduled or live; answers stay in mockKeys, never in any link or
  // response.
  // ---------------------------------------------------------------------------
  const PAPER_LINK_TTL_MS = 10 * 60 * 1000; // the 10-minute link, re-minted on resume

  function paperLinkSecret(): string {
    const secret = String(process.env.MOCK_PAPER_SECRET || process.env.INTERNAL_API_SECRET || '');
    if (!secret) throw httpError(500, 'The server is missing its paper-link secret. Contact support.');
    return secret;
  }

  function mintPaperLink(mockId: string, uid: string): { url: string; expiresAt: string } {
    const exp = Date.now() + PAPER_LINK_TTL_MS;
    const payload = `${mockId}|${uid}|${exp}`;
    const sig = crypto.createHmac('sha256', paperLinkSecret()).update(payload).digest('base64url');
    const token = `${Buffer.from(payload).toString('base64url')}.${sig}`;
    return { url: `/api/student/mock/paper?t=${encodeURIComponent(token)}`, expiresAt: new Date(exp).toISOString() };
  }

  function verifyPaperLink(token: string): { mockId: string; uid: string; exp: number } {
    const dot = String(token || '').lastIndexOf('.');
    if (dot <= 0) throw httpError(403, 'That paper link is not valid. Tap Start to get a fresh one.');
    const body = String(token).slice(0, dot);
    const sig = String(token).slice(dot + 1);
    let payload = '';
    try {
      payload = Buffer.from(body, 'base64url').toString('utf8');
    } catch {
      throw httpError(403, 'That paper link is not valid. Tap Start to get a fresh one.');
    }
    const expected = crypto.createHmac('sha256', paperLinkSecret()).update(payload).digest('base64url');
    if (sig !== expected) throw httpError(403, 'That paper link is not valid. Tap Start to get a fresh one.');
    const parts = payload.split('|');
    const exp = Number(parts[2]);
    if (parts.length !== 3 || !Number.isFinite(exp)) throw httpError(403, 'That paper link is not valid. Tap Start to get a fresh one.');
    if (exp < Date.now()) throw httpError(401, 'Your paper link expired. Tap Start again to get a fresh one.');
    return { mockId: parts[0], uid: parts[1], exp };
  }

  app.post('/api/student/mock/start', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const { settings } = await readSettings();
      const today = lagosToday();
      const mockId = `mock-${today}`;
      const now = Date.now();

      const mockSnap = await adminDb.collection(MOCKS).doc(mockId).get();
      if (!mockSnap.exists) throw httpError(404, 'There is no mock today.');
      const mock = mockSnap.data() as any;
      if (!['scheduled', 'live'].includes(String(mock.status))) {
        throw httpError(409, `Today's mock is not open (${mock.status}).`);
      }
      // A mockId in the body is ignored on purpose: the route can only ever
      // open today's mock, so no future or past paper is reachable at all.
      const durationMs = Number(mock.durationMinutes || 0) * 60 * 1000;
      const dayEnd = lagosDayEndMs(today);
      if (now + durationMs > dayEnd) {
        const cutoff = new Date(dayEnd - durationMs);
        throw httpError(409, `Too late to start today: the clock would run past 11:59 pm. Starting was possible until ${cutoff.toISOString()}.`);
      }

      const usernameDoc = await findUsernameByUid(ctx.caller.uid);
      if (!usernameDoc) throw httpError(409, 'username_required');

      const attemptRef = adminDb.collection(MOCK_ATTEMPTS).doc(`${mockId}__${ctx.caller.uid}`);
      let created = false;
      const attemptData = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(attemptRef);
        if (snap.exists) {
          const a = snap.data() as any;
          if (String(a.status) === 'submitted') throw httpError(409, 'You have already submitted this mock.');
          return a;
        }
        created = true;
        const startedAt = new Date(now).toISOString();
        const attempt = {
          id: `${mockId}__${ctx.caller.uid}`,
          mockId,
          uid: ctx.caller.uid,
          centreId: ctx.centreId,
          studentId: ctx.studentId,
          examType: mock.examType,
          startedAt,
          deadline: new Date(now + durationMs).toISOString(),
          status: 'open' as const,
          savedAnswers: {} as Record<string, any>,
          lastSavedAt: null as string | null,
          shuffleSeed: Math.floor(Math.random() * 2_147_483_647),
          username: String((usernameDoc!.data() as any).username || ''),
          mockTitle: String(mock.title || 'Mock'),
          releasesAt: new Date(
            Date.parse(`${dateAddDays(String(mock.date), 1)}T00:00:00.000Z`)
            + (settings.releaseHourLagos - 1) * 3600_000 + settings.releaseMinuteLagos * 60_000
          ).toISOString(),
          keyVersion: 1,
          questionCount: Number(mock.questionCount || 0),
          tallyShards: Number(mock.tallyShards || 1),
          scoreScale: Number(mock.scoreScale || 100),
        };
        tx.set(attemptRef, attempt);
        return attempt;
      });
      if (created) void audit({ area: 'student-mock', action: 'start', mockId, studentId: ctx.studentId, by: ctx.caller.uid });
      cacheClearFor(ctx.caller.uid);

      // The frozen paper stays server-side (MB1 Step 3): only its shape is
      // confirmed here, and the student receives a short-lived link to fetch
      // it. The paper never rides in this response; answers never leave
      // mockKeys.
      const paperSnap = await adminDb.collection(MOCK_PAPERS).doc(mockId).get();
      if (!paperSnap.exists) throw httpError(500, 'The frozen paper is missing. Contact your centre.');
      const paper = paperSnap.data() as any;
      const link = mintPaperLink(mockId, ctx.caller.uid);

      res.json({
        ok: true,
        serverNow: new Date().toISOString(),
        created,
        attempt: {
          status: attemptData.status,
          startedAt: attemptData.startedAt,
          deadline: attemptData.deadline,
          shuffleSeed: attemptData.shuffleSeed,
          savedAnswers: attemptData.savedAnswers || {},
          scoreScale: attemptData.scoreScale,
        },
        paper: {
          mockId,
          examType: paper.examType,
          durationMinutes: paper.durationMinutes,
          questionCount: paper.questionCount,
          url: link.url,
          urlExpiresAt: link.expiresAt,
        },
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] start failed:', error?.message || error);
      res.status(500).json({ error: 'Could not start the mock.' });
    }
  });

  // GET the paper through the short-lived link. Every check runs again here:
  // the link must be valid and unexpired and belong to the caller, the mock
  // must be today's and open, and the attempt must be open. A submitted
  // attempt closes the door at once: a finished exam cannot re-download its
  // paper before results release.
  app.get('/api/student/mock/paper', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const parsed = verifyPaperLink(String(req.query.t || ''));
      if (parsed.uid !== ctx.caller.uid) throw httpError(403, 'That paper link belongs to another student.');
      const today = lagosToday();
      if (parsed.mockId !== `mock-${today}`) throw httpError(403, 'That paper link is not for today. Tap Start.');
      const mockSnap = await adminDb.collection(MOCKS).doc(parsed.mockId).get();
      if (!mockSnap.exists) throw httpError(404, 'There is no mock today.');
      if (!['scheduled', 'live'].includes(String((mockSnap.data() as any)?.status))) {
        throw httpError(409, "Today's mock is not open.");
      }
      const attemptSnap = await adminDb.collection(MOCK_ATTEMPTS).doc(`${parsed.mockId}__${ctx.caller.uid}`).get();
      if (!attemptSnap.exists) throw httpError(404, 'No attempt in progress. Tap Start.');
      if (String((attemptSnap.data() as any)?.status) !== 'open') {
        throw httpError(409, 'This attempt is finished. Results arrive at 6:00 am.');
      }
      const paperSnap = await adminDb.collection(MOCK_PAPERS).doc(parsed.mockId).get();
      if (!paperSnap.exists) throw httpError(500, 'The frozen paper is missing. Contact your centre.');
      const paper = paperSnap.data() as any;
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        paper: {
          mockId: parsed.mockId,
          examType: paper.examType,
          durationMinutes: paper.durationMinutes,
          questionCount: paper.questionCount,
          questions: (paper.questions || []).map((q: any) => ({
            id: q.id, subject: q.subject, topic: q.topic, year: q.year ?? null,
            text: q.text, options: q.options || [], imageLink: q.imageLink || '',
          })),
        },
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] paper failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the paper.' });
    }
  });

  // -----------------------------------------------------------------------
  // POST save: a batch of changed answers and flags. Last write per question
  // wins by server receipt order; every entry keeps its client timestamp for
  // the offline merge. Ignored after the deadline.
  // -----------------------------------------------------------------------
  const saveHits = new Map<string, number[]>();
  app.post('/api/student/mock/save', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const raw = JSON.stringify(req.body || {});
      if (raw.length > SAVE_PAYLOAD_MAX) throw httpError(413, 'That batch is too large.');
      const changes = Array.isArray(req.body?.changes) ? req.body.changes : null;
      if (!changes || changes.length < 1) throw httpError(400, 'No changes in the batch.');
      if (changes.length > SAVE_BATCH_MAX) throw httpError(400, `A batch holds at most ${SAVE_BATCH_MAX} answers.`);
      for (const c of changes) {
        if (!c || !QID_RE.test(String(c.qid || ''))) throw httpError(400, 'A question id in the batch looks wrong.');
        if (c.choice !== undefined && c.choice !== null && !(CHOICES as readonly string[]).includes(String(c.choice))) {
          throw httpError(400, 'An answer choice in the batch looks wrong.');
        }
        if (c.flag !== undefined && typeof c.flag !== 'boolean') throw httpError(400, 'A flag in the batch looks wrong.');
      }
      // In-instance throttle: free, and the payload cap carries the rest.
      const nowMs = Date.now();
      const hits = (saveHits.get(ctx.caller.uid) || []).filter((t) => nowMs - t < 60_000);
      if (hits.length >= SAVE_PER_MINUTE) throw httpError(429, 'Slow down a moment; your answers are still saving.');
      hits.push(nowMs);
      saveHits.set(ctx.caller.uid, hits);

      const today = lagosToday();
      const mockId = `mock-${today}`;
      const attemptRef = adminDb.collection(MOCK_ATTEMPTS).doc(`${mockId}__${ctx.caller.uid}`);
      const snap = await attemptRef.get();
      if (!snap.exists) throw httpError(404, 'Start the mock first.');
      const attempt = snap.data() as any;
      if (String(attempt.status) !== 'open') throw httpError(409, 'This mock is already submitted.');
      const deadline = Date.parse(String(attempt.deadline || ''));
      const serverNow = new Date().toISOString();
      if (Number.isFinite(deadline) && nowMs > deadline) {
        // Past the deadline nothing changes the paper. The release sweep
        // submits what was last saved.
        return res.json({ ok: true, ignored: true, reason: 'deadline', serverNow });
      }
      const update: Record<string, any> = { lastSavedAt: serverNow };
      for (const c of changes) {
        const key = `savedAnswers.${String(c.qid)}`;
        const prev = attempt.savedAnswers?.[String(c.qid)] || {};
        update[key] = {
          choice: c.choice === undefined ? (prev.choice ?? null) : c.choice,
          flag: c.flag === undefined ? Boolean(prev.flag) : Boolean(c.flag),
          ts: Number.isFinite(Number(c.ts)) ? Number(c.ts) : nowMs,
        };
      }
      await attemptRef.update(update);
      void audit({ area: 'student-mock', action: 'save', mockId, studentId: ctx.studentId, changed: changes.length, by: ctx.caller.uid });
      cacheClearFor(ctx.caller.uid);
      res.json({ ok: true, saved: changes.length, serverNow });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] save failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save your answers.' });
    }
  });

  // -----------------------------------------------------------------------
  // POST submit: mark with the server-only key, bump the tally, return
  // nothing about the score. Idempotent; past the deadline it marks what was
  // last saved, as an auto-submit.
  // -----------------------------------------------------------------------
  app.post('/api/student/mock/submit', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const today = lagosToday();
      const mockId = `mock-${today}`;
      const attemptRef = adminDb.collection(MOCK_ATTEMPTS).doc(`${mockId}__${ctx.caller.uid}`);
      const nowMs = Date.now();

      const keySnap = await adminDb.collection(MOCK_KEYS).doc(mockId).get();
      if (!keySnap.exists) throw httpError(500, 'The marking key is missing. Contact your centre.');
      const keyItems = ((keySnap.data() as any)?.items || []) as KeyItem[];

      const receipt = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(attemptRef);
        if (!snap.exists) throw httpError(404, 'Start the mock first.');
        const attempt = snap.data() as any;
        if (String(attempt.status) === 'submitted') {
          return { already: true, submittedAt: attempt.submittedAt, autoSubmitted: Boolean(attempt.autoSubmitted) };
        }
        const deadline = Date.parse(String(attempt.deadline || ''));
        const autoSubmitted = Number.isFinite(deadline) && nowMs > deadline;
        const mark = markWithKey(attempt.savedAnswers || {}, keyItems, Number(attempt.scoreScale || 100));
        const started = Date.parse(String(attempt.startedAt || '')) || nowMs;
        const submittedAt = new Date(nowMs).toISOString();
        tx.update(attemptRef, {
          status: 'submitted',
          submittedAt,
          markedAt: submittedAt,
          autoSubmitted,
          score: { answered: mark.answered, correct: mark.correct },
          scoreCorrect: mark.correct,
          scoreScaled: mark.scoreScaled,
          perSubject: mark.perSubject,
          perTopic: mark.perTopic,
          // Time used, capped at the deadline: a late auto-submit never shows
          // more time spent than the student actually had.
          sortMs: Math.max(0, Math.min(nowMs - started, Number.isFinite(deadline) ? deadline - started : nowMs - started)),
        });
        return { already: false, submittedAt, autoSubmitted, scoreCorrect: mark.correct, tallyShards: Number(attempt.tallyShards || 1), mockId };
      });
      cacheClearFor(ctx.caller.uid);
      if (!receipt.already) {
        await bumpMockTally(mockId, receipt.scoreCorrect, receipt.tallyShards);
        void audit({ area: 'student-mock', action: 'submit', mockId, studentId: ctx.studentId, autoSubmitted: receipt.autoSubmitted, correct: receipt.scoreCorrect, by: ctx.caller.uid });
      }
      // Deliberately no score in the response: results stay hidden until release.
      res.json({ ok: true, serverNow: new Date().toISOString(), submittedAt: receipt.submittedAt, autoSubmitted: Boolean(receipt.autoSubmitted), already: Boolean(receipt.already) });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] submit failed:', error?.message || error);
      res.status(500).json({ error: 'Could not submit the mock.' });
    }
  });


  // -------------------------------------------------------------------------
  // GET history: the student's own submitted attempts, newest first, for the
  // Past tab. Only what the rules allow the phone to see: score, rank and
  // the mock's public shape. Released comes from the attempt's releasesAt
  // stamp, so no mock reads are needed here.
  // -------------------------------------------------------------------------
  app.get('/api/student/mock/history', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const snap = await adminDb.collection(MOCK_ATTEMPTS)
        .where('uid', '==', ctx.caller.uid)
        .where('status', '==', 'submitted')
        .orderBy('startedAt', 'desc')
        .limit(50)
        .get();
      const nowMs = Date.now();
      const rows = snap.docs.map((d) => {
        const a = d.data() as any;
        return {
          mockId: String(a.mockId || ''),
          date: String(a.mockId || '').slice(5),
          title: String(a.mockTitle || 'Mock'),
          examType: String(a.examType || ''),
          scoreCorrect: Number(a.scoreCorrect || 0),
          questionCount: Number(a.questionCount || 0),
          scoreScaled: a.scoreScaled == null ? null : Number(a.scoreScaled),
          scoreScale: Number(a.scoreScale || 0),
          rank: a.rankCorrect == null ? null : Number(a.rankCorrect),
          autoSubmitted: Boolean(a.autoSubmitted),
          // An attempt ranked at release time (rankCorrect written by the
          // release job) is released even if it predates the releasesAt stamp.
          released: (Boolean(a.releasesAt) && nowMs >= Date.parse(String(a.releasesAt))) || a.rankCorrect != null,
          resultSeenAt: a.resultSeenAt ? String(a.resultSeenAt) : null,
        };
      });
      res.json({ ok: true, rows });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] history failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load your past mocks.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET leaderboard: one board shared by every centre. Usernames and scores
  // only; never uids, real names or centre names. rank = 1 + everyone who
  // scored higher, ties share a rank (the same math the release job used).
  // -------------------------------------------------------------------------
  app.get('/api/student/mock/leaderboard', async (req, res) => {
    try {
      await requireStudent(req);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
        ? String(req.query.date)
        : dateAddDays(lagosToday(), -1);
      const mockId = `mock-${date}`;
      const boardSnap = await adminDb.collection(MOCK_LEADERBOARDS).doc(mockId).get();
      if (!boardSnap.exists) {
        return res.json({ ok: true, date, released: false, entries: [], me: null, totalAttempts: 0 });
      }
      const board = boardSnap.data() as any;
      const counts: Record<string, number> = board.scoreCounts || {};
      const attemptSnap = await adminDb.collection(MOCK_ATTEMPTS).doc(`${mockId}__${(req as any).caller.uid}`).get();
      let me: any = null;
      if (attemptSnap.exists) {
        const a = attemptSnap.data() as any;
        const myScore = Number(a.scoreCorrect || 0);
        let higher = 0;
        for (const k of Object.keys(counts)) {
          const v = Number(k);
          if (v > myScore) higher += Number(counts[k] || 0);
        }
        me = { rank: higher + 1, score: myScore, username: String(a.username || '') };
      }
      const entries = ((board.entries || []) as any[]).slice(0, 100).map((e) => ({
        rank: Number(e.rank), username: String(e.username || ''), score: Number(e.score),
      }));
      res.json({
        ok: true, date, released: true,
        mockTitle: String(board.mockTitle || 'Mock'),
        examType: String(board.examType || ''),
        totalAttempts: Number(board.totalAttempts || 0),
        entries, me,
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] leaderboard failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the leaderboard.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET result: the student's own marked attempt with the full review, only
  // after release (the board exists exactly when the mock is released).
  // Explanations come from the server-only key and are handed out here and
  // nowhere else. Marks the result seen so the Today card clears.
  // -------------------------------------------------------------------------
  app.get('/api/student/mock/result', async (req, res) => {
    try {
      const ctx = await requireStudent(req);
      const mockId = String(req.query.mockId || '').trim();
      if (!/^mock-\d{4}-\d{2}-\d{2}$/.test(mockId)) throw httpError(400, 'That mock id looks wrong.');
      const attemptSnap = await adminDb.collection(MOCK_ATTEMPTS).doc(`${mockId}__${ctx.caller.uid}`).get();
      if (!attemptSnap.exists || String((attemptSnap.data() as any).status) !== 'submitted') {
        throw httpError(404, 'You have no submitted attempt for that mock.');
      }
      const attempt = attemptSnap.data() as any;
      const boardSnap = await adminDb.collection(MOCK_LEADERBOARDS).doc(mockId).get();
      if (!boardSnap.exists) {
        throw httpError(403, 'Results are not out yet. They drop the morning after the mock.');
      }
      const paperSnap = await adminDb.collection(MOCK_PAPERS).doc(mockId).get();
      const keySnap = await adminDb.collection(MOCK_KEYS).doc(mockId).get();
      const questions = ((paperSnap.data() as any)?.questions || []) as any[];
      const keyById = new Map<string, any>(
        (((keySnap.data() as any)?.items || []) as any[]).map((k) => [String(k.id), k]),
      );
      const saved = attempt.savedAnswers || {};
      const review = questions.map((q, i) => {
        const k = keyById.get(String(q.id));
        const your = saved[q.id] ? String(saved[q.id].choice || '') : null;
        const correct = k ? String(k.correct || '') : '';
        return {
          n: i + 1,
          id: String(q.id),
          subject: String(q.subject || ''),
          topic: String(q.topic || ''),
          year: q.year ?? null,
          text: String(q.text || ''),
          options: (q.options || []).map((o: any) => String(o)),
          imageLink: String(q.imageLink || ''),
          yourChoice: your,
          correctChoice: correct,
          isCorrect: your != null && your !== '' && your === correct,
          explanation: k ? String(k.explanation || '') : '',
          flagged: Boolean(saved[q.id]?.flag),
        };
      });
      const counts: Record<string, number> = (boardSnap.data() as any).scoreCounts || {};
      const myScore = Number(attempt.scoreCorrect || 0);
      let higher = 0;
      for (const k of Object.keys(counts)) {
        const v = Number(k);
        if (v > myScore) higher += Number(counts[k] || 0);
      }
      // One small write, once per result: clears the Today reminder card.
      if (!attempt.resultSeenAt) void attemptSnap.ref.update({ resultSeenAt: new Date().toISOString() });
      res.json({
        ok: true,
        mockId,
        date: mockId.slice(5),
        title: String(attempt.mockTitle || 'Mock'),
        examType: String(attempt.examType || ''),
        score: {
          correct: myScore,
          questionCount: Number(attempt.questionCount || review.length),
          scaled: attempt.scoreScaled == null ? null : Number(attempt.scoreScaled),
          scale: Number(attempt.scoreScale || 0),
        },
        rank: higher + 1,
        autoSubmitted: Boolean(attempt.autoSubmitted),
        timeSpentMs: Number(attempt.sortMs || 0),
        perSubject: attempt.perSubject || [],
        perTopic: attempt.perTopic || [],
        review,
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[student-mock] result failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load your result.' });
    }
  });

  // The tally collection name is exported for the release sweep's use; the
  // bump helper itself lives with the other mock code.
  void MOCK_TALLY;
}
