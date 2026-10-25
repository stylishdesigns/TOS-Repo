import express from 'express';
import { FieldValue, WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { Caller, httpError } from './tenantService';

/**
 * TOS Mocks (Prompt M, piece M2): the data model and the TOS-only management
 * routes. Mocks are owned entirely by Tutorial OS: centres, admins and tutors
 * cannot create, edit, see inside or use them. Questions come only from the
 * question bank's mock stream (kind: 'mock', published only).
 *
 * The security spine (agreed in M1): before results are released, a paper
 * reaches a student's device WITHOUT its answers. The frozen paper holds
 * questions and options only; the marking key (correct answers and
 * explanations) is stored server-side and read only by the server's marking
 * code. Nothing here ever puts correct answers or explanations into a
 * browser response before release.
 *
 * All times live on the server in Africa/Lagos. The browser never gets a
 * vote on windows, deadlines or the one-attempt rule.
 *
 * Every route requires the `tos` claim (checked here, not only in the UI).
 * Nothing writes on a GET. Every mutation leaves an auditLogs record.
 *
 * Collections this piece owns (all deny-all for browsers in firestore.rules):
 *   mocks           one document per mock, id = mock-<YYYY-MM-DD>: the id IS
 *                   the date, so one-mock-per-day is structural. Statuses:
 *                   draft | scheduled | live | closed | released | archived |
 *                   cancelled.
 *   mockPapers      the frozen paper: questions and options only.
 *   mockKeys        the server-only marking key: correct + explanation.
 *   mockAttempts    one per student per mock (later student-side piece):
 *                   uid, username snapshot, centreId (internal counts only),
 *                   startedAt/deadline (server time), savedAnswers, status,
 *                   score {answered, correct} + flat scoreCorrect, and
 *                   sortMs (milliseconds taken) so the leaderboard can order
 *                   tied scores by faster finish with one stored sort field.
 *   mockScoreTally  the tally sheet: one tiny doc per score per shard,
 *                   `${mockId}__s${score}__k${shard}`, bumped with atomic
 *                   increments (never transactions) so a busy score never
 *                   hits a per-document write limit. Summed at release.
 *   mockLeaderboards  one doc per mock: top 100 usernames with scores.
 *   mockSettings    doc 'global': durations, per-subject default counts,
 *                   compulsory subjects, release time, timezone, tally
 *                   shards. Changing settings never alters a Scheduled mock:
 *                   the freeze copies the values it needs, and nothing reads
 *                   settings after freeze.
 *   usernames       the uniqueness register (later piece): one doc per
 *                   claimed username pointing to the student.
 *
 * There is deliberately NO per-student review collection: the post-release
 * review is built on request from the attempt plus the paper and the key
 * (reads only, no writes, no storage).
 */

const MOCKS = 'mocks';
const MOCK_PAPERS = 'mockPapers';
const MOCK_KEYS = 'mockKeys';
const MOCK_SETTINGS = 'mockSettings'; // doc id 'global'
const QB_QUESTIONS = 'qbQuestions';
const QB_SCAN_CAP = 2000; // same windowed-read ceiling the bank uses

const STATUSES = ['draft', 'scheduled', 'live', 'closed', 'released', 'archived', 'cancelled'] as const;
type MockStatus = (typeof STATUSES)[number];
const EXAM_TYPES = ['jamb', 'waec_neco'] as const;
type ExamType = (typeof EXAM_TYPES)[number];

const TITLE_MAX = 120;
const SUBJECT_MAX = 80;
const SUBJECTS_MAX = 12;
const COUNT_MAX = 500;
const TOTAL_MAX = 2000;
const QUESTION_IDS_MAX = 2000;

// Seed values for mockSettings/global. They are defaults, not constants: the
// TOS settings screen overwrites them, and every mock copies what it needs at
// freeze time so later setting changes never touch Scheduled mocks.
const DEFAULT_SETTINGS = {
  jamb: { durationMinutes: 120, compulsorySubject: 'English', compulsoryCount: 60, otherCount: 40, subjectCount: 4 },
  waecNeco: { durationMinutes: 90 },
  compulsorySubjects: ['English', 'Mathematics', 'Civic Education'],
  releaseHourLagos: 6,
  releaseMinuteLagos: 0,
  timezone: 'Africa/Lagos',
  tallyShards: 4,
};

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

function requireTos(req: express.Request): Caller {
  const caller = getCaller(req);
  if (!caller.tos) throw httpError(403, 'TOS staff only.');
  return caller;
}

function audit(entry: Record<string, any>): Promise<unknown> {
  return adminDb
    .collection('auditLogs')
    .add({ ...entry, at: entry.at || new Date().toISOString() })
    .catch((err) => console.error('[mocks] audit write failed:', err?.message || err));
}

// ---------------------------------------------------------------------------
// Time: everything is Africa/Lagos, on the server.
// ---------------------------------------------------------------------------
function lagosToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
}

// ---------------------------------------------------------------------------
// Validation. Fields outside the whitelist are dropped, never stored.
// ---------------------------------------------------------------------------
function parseExamType(v: unknown): ExamType {
  const s = String(v ?? '').trim().toLowerCase();
  if (!(EXAM_TYPES as readonly string[]).includes(s)) throw httpError(400, 'Exam type must be jamb or waec_neco.');
  return s as ExamType;
}

function parseDate(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw httpError(400, 'Date must be YYYY-MM-DD.');
  const d = new Date(s + 'T12:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw httpError(400, 'Date must be a real calendar date.');
  return s;
}

function parseTitle(v: unknown): string {
  const s = String(v ?? '').trim();
  if (s.length < 1 || s.length > TITLE_MAX) throw httpError(400, `Title must be 1 to ${TITLE_MAX} characters.`);
  return s;
}

interface SubjectSpec {
  subject: string;
  count: number;
  questionIds?: string[];
}

function parseSubjects(raw: unknown, settings: MockSettings, examType: ExamType, questionSource: 'random' | 'picked'): SubjectSpec[] {
  if (!Array.isArray(raw) || raw.length < 1) throw httpError(400, 'At least one subject is required.');
  if (raw.length > SUBJECTS_MAX) throw httpError(400, `At most ${SUBJECTS_MAX} subjects.`);
  if (examType === 'waec_neco' && raw.length !== 1) {
    throw httpError(400, 'A WAEC/NECO mock is one paper: exactly one subject per date.');
  }
  if (examType === 'jamb' && raw.length > settings.jamb.subjectCount) {
    throw httpError(400, `A JAMB mock takes at most ${settings.jamb.subjectCount} subjects (the setting can be changed).`);
  }
  const seen = new Set<string>();
  let total = 0;
  const out: SubjectSpec[] = [];
  for (const item of raw) {
    const subject = String((item as any)?.subject ?? '').trim();
    if (subject.length < 1 || subject.length > SUBJECT_MAX) throw httpError(400, 'Each subject needs a name of 1 to 80 characters.');
    const key = subject.toLowerCase();
    if (seen.has(key)) throw httpError(400, `Subject "${subject}" appears twice.`);
    seen.add(key);
    const count = (item as any)?.count;
    if (!Number.isInteger(count) || count < 1 || count > COUNT_MAX) throw httpError(400, `Question count for "${subject}" must be a whole number from 1 to ${COUNT_MAX}.`);
    total += count;
    if (total > TOTAL_MAX) throw httpError(400, `A mock holds at most ${TOTAL_MAX} questions in total.`);
    const spec: SubjectSpec = { subject, count };
    if (questionSource === 'picked') {
      const ids = (item as any)?.questionIds;
      if (!Array.isArray(ids) || ids.length !== count) {
        throw httpError(400, `Hand-picked mocks need exactly ${count} question ids for "${subject}".`);
      }
      spec.questionIds = ids.map((x: unknown) => String(x ?? '').trim()).filter(Boolean);
      if (spec.questionIds.length !== count) throw httpError(400, `Invalid question id in "${subject}".`);
    }
    out.push(spec);
  }
  if (examType === 'jamb') {
    const compulsory = settings.jamb.compulsorySubject.toLowerCase();
    if (!out.some((s) => s.subject.toLowerCase() === compulsory)) {
      throw httpError(400, `A JAMB mock must include ${settings.jamb.compulsorySubject} (the compulsory subject can be changed in settings).`);
    }
  }
  return out;
}

function parseQuestionSource(v: unknown): 'random' | 'picked' {
  const s = String(v ?? 'random').trim().toLowerCase();
  if (s !== 'random' && s !== 'picked') throw httpError(400, 'Question source must be random or picked.');
  return s;
}

function rejectDuplicateIds(subjects: SubjectSpec[]) {
  const seen = new Set<string>();
  for (const s of subjects) {
    for (const id of s.questionIds || []) {
      if (seen.has(id)) throw httpError(400, `Question ${id} is picked more than once.`);
      seen.add(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Settings: read with defaults, write with validation. Changing settings
// never alters a Scheduled mock: freeze copies the values it needs and
// nothing reads settings after freeze.
// ---------------------------------------------------------------------------
interface MockSettings {
  jamb: { durationMinutes: number; compulsorySubject: string; compulsoryCount: number; otherCount: number; subjectCount: number };
  waecNeco: { durationMinutes: number };
  compulsorySubjects: string[];
  releaseHourLagos: number;
  releaseMinuteLagos: number;
  timezone: string;
  tallyShards: number;
}

async function readSettings(): Promise<{ settings: MockSettings; stored: boolean }> {
  const snap = await adminDb.collection(MOCK_SETTINGS).doc('global').get();
  if (!snap.exists) return { settings: DEFAULT_SETTINGS, stored: false };
  const d = snap.data() as any;
  const settings = {
    jamb: { ...DEFAULT_SETTINGS.jamb, ...(d?.jamb && typeof d.jamb === 'object' ? d.jamb : {}) },
    waecNeco: { ...DEFAULT_SETTINGS.waecNeco, ...(d?.waecNeco && typeof d.waecNeco === 'object' ? d.waecNeco : {}) },
    compulsorySubjects: Array.isArray(d?.compulsorySubjects) && d.compulsorySubjects.length > 0 ? d.compulsorySubjects : DEFAULT_SETTINGS.compulsorySubjects,
    releaseHourLagos: Number.isInteger(d?.releaseHourLagos) ? d.releaseHourLagos : DEFAULT_SETTINGS.releaseHourLagos,
    releaseMinuteLagos: Number.isInteger(d?.releaseMinuteLagos) ? d.releaseMinuteLagos : DEFAULT_SETTINGS.releaseMinuteLagos,
    timezone: typeof d?.timezone === 'string' && d.timezone ? d.timezone : DEFAULT_SETTINGS.timezone,
    tallyShards: Number.isInteger(d?.tallyShards) ? d.tallyShards : DEFAULT_SETTINGS.tallyShards,
  };
  return { settings, stored: true };
}

function intIn(v: unknown, lo: number, hi: number, label: string): number {
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw httpError(400, `${label} must be a whole number from ${lo} to ${hi}.`);
  return v as number;
}

function validateSettingsBody(body: any): MockSettings {
  const jamb = body?.jamb || {};
  const waecNeco = body?.waecNeco || {};
  const compulsory = body?.compulsorySubjects;
  if (!Array.isArray(compulsory) || compulsory.length < 1 || compulsory.length > SUBJECTS_MAX) {
    throw httpError(400, 'Compulsory subjects must be a list of 1 to 12 subject names.');
  }
  const names = compulsory.map((x: unknown) => String(x ?? '').trim());
  if (names.some((n: string) => n.length < 1 || n.length > SUBJECT_MAX)) throw httpError(400, 'Each compulsory subject name must be 1 to 80 characters.');
  if (new Set(names.map((n: string) => n.toLowerCase())).size !== names.length) throw httpError(400, 'Compulsory subjects must not repeat.');
  const settings: MockSettings = {
    jamb: {
      durationMinutes: intIn(jamb.durationMinutes, 15, 360, 'JAMB duration'),
      compulsorySubject: String(jamb.compulsorySubject ?? '').trim().slice(0, SUBJECT_MAX) || DEFAULT_SETTINGS.jamb.compulsorySubject,
      compulsoryCount: intIn(jamb.compulsoryCount, 1, COUNT_MAX, 'JAMB compulsory count'),
      otherCount: intIn(jamb.otherCount, 1, COUNT_MAX, 'JAMB other-subject count'),
      subjectCount: intIn(jamb.subjectCount, 1, SUBJECTS_MAX, 'JAMB subject count'),
    },
    waecNeco: { durationMinutes: intIn(waecNeco.durationMinutes, 15, 360, 'WAEC/NECO duration') },
    compulsorySubjects: names,
    releaseHourLagos: intIn(body?.releaseHourLagos, 0, 23, 'Release hour'),
    releaseMinuteLagos: intIn(body?.releaseMinuteLagos, 0, 59, 'Release minute'),
    timezone: 'Africa/Lagos',
    tallyShards: intIn(body?.tallyShards, 1, 8, 'Tally shards'),
  };
  return settings;
}

// ---------------------------------------------------------------------------
// Freezing: build the frozen paper (questions and options only) and the
// server-only key from the mock stream of the question bank.
// ---------------------------------------------------------------------------
interface PaperQuestion {
  id: string;
  subject: string;
  topic: string;
  year: number | null;
  text: string;
  options: string[];
  imageLink: string;
}

interface KeyItem {
  id: string;
  correct: string;
  explanation: string;
  subject: string;
  topic: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function pickRandom(subject: string, count: number): Promise<{ paper: PaperQuestion[]; key: KeyItem[] }> {
  const snap = await adminDb
    .collection(QB_QUESTIONS)
    .where('kind', '==', 'mock')
    .where('status', '==', 'published')
    .where('subject', '==', subject)
    .get();
  if (snap.size > QB_SCAN_CAP) throw httpError(413, `Too many mock questions for "${subject}" to pick from; trim the bank.`);
  if (snap.size < count) {
    throw httpError(409, `Not enough published mock questions for "${subject}": ${snap.size} available, ${count} needed.`);
  }
  const docs = shuffle(snap.docs).slice(0, count);
  const paper: PaperQuestion[] = [];
  const key: KeyItem[] = [];
  for (const doc of docs) {
    const d = doc.data() as any;
    paper.push({
      id: doc.id,
      subject: String(d.subject || subject),
      topic: String(d.topic || ''),
      year: typeof d.year === 'number' ? d.year : null,
      text: String(d.text || ''),
      options: Array.isArray(d.options) ? d.options.map((o: unknown) => String(o ?? '')) : [],
      imageLink: String(d.imageLink || ''),
    });
    key.push({
      id: doc.id,
      correct: String(d.correct || ''),
      explanation: String(d.explanation || ''),
      subject: String(d.subject || subject),
      topic: String(d.topic || ''),
    });
  }
  return { paper: shuffle(paper), key };
}

async function pickPicked(subject: string, ids: string[]): Promise<{ paper: PaperQuestion[]; key: KeyItem[] }> {
  const paper: PaperQuestion[] = [];
  const key: KeyItem[] = [];
  for (const id of ids) {
    const doc = await adminDb.collection(QB_QUESTIONS).doc(id).get();
    if (!doc.exists) throw httpError(409, `Question ${id} no longer exists.`);
    const d = doc.data() as any;
    if (String(d.kind || '') !== 'mock' || String(d.status || '') !== 'published') {
      throw httpError(409, `Question ${id} is not a published mock question.`);
    }
    if (String(d.subject || '') !== subject) {
      throw httpError(409, `Question ${id} belongs to "${String(d.subject || '')}", not "${subject}".`);
    }
    paper.push({
      id: doc.id,
      subject: String(d.subject || subject),
      topic: String(d.topic || ''),
      year: typeof d.year === 'number' ? d.year : null,
      text: String(d.text || ''),
      options: Array.isArray(d.options) ? d.options.map((o: unknown) => String(o ?? '')) : [],
      imageLink: String(d.imageLink || ''),
    });
    key.push({
      id: doc.id,
      correct: String(d.correct || ''),
      explanation: String(d.explanation || ''),
      subject: String(d.subject || subject),
      topic: String(d.topic || ''),
    });
  }
  return { paper: shuffle(paper), key };
}

// The tally bump the submit route (student-side piece) will call. Atomic
// increment, never a transaction, and sharded across the mock's stored shard
// count so a busy score never hits a per-document write limit. set+merge
// creates the shard doc on first bump.
export async function bumpMockTally(mockId: string, score: number, shards: number): Promise<void> {
  const shard = Math.floor(Math.random() * Math.max(1, shards));
  const ref = adminDb.collection('mockScoreTally').doc(`${mockId}__s${score}__k${shard}`);
  await ref.set(
    { mockId, score, count: FieldValue.increment(1), updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

// ---------------------------------------------------------------------------
// Series builder (M4): a WAEC/NECO series is a calendar of single-subject
// papers, twice a month, cycling through the subjects with every compulsory
// subject from settings included. Nothing hard-coded: the compulsory list
// comes from mockSettings, and the cadence days and subject rotation are
// chosen by TOS staff for each series.
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

function shiftMonthStr(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

interface SeriesRequest {
  start: string;
  days: number[];
  months: number;
  subjects: string[];
  count: number;
  titlePrefix: string;
}

function parseSeriesRequest(body: any, settings: MockSettings): SeriesRequest {
  const start = parseDate(body?.start);
  const rawDays = Array.isArray(body?.cadenceDays) ? body.cadenceDays : [];
  if (rawDays.length !== 2) throw httpError(400, 'Pick exactly two days of the month for the papers.');
  const days = [...new Set(rawDays.map((d: unknown) => Number(d)))] as number[];
  if (days.length !== 2 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 28)) {
    throw httpError(400, 'The two cadence days must be different days between the 1st and the 28th.');
  }
  days.sort((x, y) => x - y);
  const months = body?.months;
  if (!Number.isInteger(months) || months < 1 || months > 12) throw httpError(400, 'Series length must be 1 to 12 months.');
  const subjects = Array.isArray(body?.subjects) ? body.subjects.map((x: unknown) => String(x ?? '').trim()) : [];
  if (subjects.length < 1 || subjects.length > SUBJECTS_MAX) throw httpError(400, 'List 1 to 12 subjects for the series rotation.');
  if (subjects.some((x: string) => x.length < 1 || x.length > SUBJECT_MAX)) throw httpError(400, 'Each subject name must be 1 to 80 characters.');
  if (new Set(subjects.map((x: string) => x.toLowerCase())).size !== subjects.length) throw httpError(400, 'Subjects must not repeat in the rotation.');
  const have = new Set(subjects.map((x: string) => x.toLowerCase()));
  const missing = settings.compulsorySubjects.filter((c) => !have.has(c.toLowerCase()));
  if (missing.length > 0) throw httpError(400, `The series must cover every compulsory subject. Missing: ${missing.join(', ')}.`);
  const count = body?.count;
  if (!Number.isInteger(count) || count < 1 || count > COUNT_MAX) throw httpError(400, 'Questions per paper must be a whole number from 1 to 500.');
  const titlePrefix = body?.titlePrefix ? String(body.titlePrefix).trim().slice(0, 80) : '';
  return { start, days, months, subjects, count, titlePrefix };
}

function buildSeriesPlan(req: SeriesRequest): Array<{ date: string; subject: string; title: string }> {
  const papers: Array<{ date: string; subject: string; title: string }> = [];
  let idx = 0;
  for (let i = 0; i < req.months; i += 1) {
    const ym = shiftMonthStr(req.start.slice(0, 7), i);
    for (const d of req.days) {
      const date = `${ym}-${pad2(d)}`;
      if (date < req.start) continue;
      const subject = req.subjects[idx % req.subjects.length];
      idx += 1;
      papers.push({ date, subject, title: req.titlePrefix ? `${req.titlePrefix} · ${subject}` : subject });
    }
  }
  if (papers.length < req.subjects.length) {
    throw httpError(400, `The series has only ${papers.length} papers but ${req.subjects.length} subjects to cover. Add a month or fewer subjects.`);
  }
  return papers;
}

// Which dates in the plan already hold a mock: one month query per affected
// month, at most twelve. Returns status per date ('' when free).
async function existingStatuses(papers: Array<{ date: string }>): Promise<Record<string, string>> {
  const months = new Set(papers.map((p) => p.date.slice(0, 7)));
  const out: Record<string, string> = {};
  for (const ym of months) {
    const snap = await adminDb
      .collection(MOCKS)
      .where('date', '>=', `${ym}-01`)
      .where('date', '<=', `${ym}-31`)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data() as any;
      out[String(d.date)] = String(d.status || '');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Routes. TOS staff only, on the server.
// ---------------------------------------------------------------------------
export function registerMockRoutes(app: express.Express): void {
  // Create a Draft. The document id is the date, so one-mock-per-day is
  // structural; a cancelled slot can be reused as a fresh draft.
  app.post('/api/tos/mocks', async (req, res) => {
    try {
      const caller = requireTos(req);
      const body = req.body || {};
      const { settings } = await readSettings();
      const examType = parseExamType(body.examType);
      const date = parseDate(body.date);
      const title = parseTitle(body.title);
      const questionSource = parseQuestionSource(body.questionSource);
      const subjects = parseSubjects(body.subjects, settings, examType, questionSource);
      if (questionSource === 'picked') rejectDuplicateIds(subjects);
      const id = `mock-${date}`;
      const now = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        const ref = adminDb.collection(MOCKS).doc(id);
        const snap = await tx.get(ref);
        if (snap.exists) {
          const st = String((snap.data() as any)?.status || '');
          if (st !== 'cancelled') throw httpError(409, 'A mock already exists for this date.');
        }
        tx.set(ref, {
          id,
          examType,
          title,
          date,
          status: 'draft' as MockStatus,
          questionSource,
          subjects,
          seriesId: body.seriesId ? String(body.seriesId).trim().slice(0, 60) : null,
          createdAt: now,
          createdBy: caller.uid,
          updatedAt: now,
          updatedBy: caller.uid,
        });
      });
      void audit({ area: 'mocks', action: 'create', mockId: id, by: caller.uid, examType, date });
      res.json({ ok: true, id });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] create failed:', error?.message || error);
      res.status(500).json({ error: 'Could not create the mock.' });
    }
  });

  // Edit a Draft only. The date is immutable: to move a mock, cancel it and
  // create a new one on the other date.
  app.post('/api/tos/mocks/:id/edit', async (req, res) => {
    try {
      const caller = requireTos(req);
      const id = String(req.params.id || '');
      const body = req.body || {};
      const { settings } = await readSettings();
      const now = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        const ref = adminDb.collection(MOCKS).doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw httpError(404, 'Mock not found.');
        const mock = snap.data() as any;
        if (mock.status !== 'draft') throw httpError(409, 'Only Draft mocks can be edited. Scheduled mocks are frozen.');
        if (body.date && String(body.date) !== mock.date) {
          throw httpError(400, 'A mock keeps its date. To move it, cancel this one and create a new mock on the other date.');
        }
        const examType = parseExamType(mock.examType);
        const questionSource = body.questionSource ? parseQuestionSource(body.questionSource) : mock.questionSource;
        const subjects = parseSubjects(body.subjects ?? mock.subjects, settings, examType, questionSource);
        if (questionSource === 'picked') rejectDuplicateIds(subjects);
        tx.update(ref, {
          title: body.title !== undefined ? parseTitle(body.title) : mock.title,
          subjects,
          questionSource,
          updatedAt: now,
          updatedBy: caller.uid,
        });
      });
      void audit({ area: 'mocks', action: 'edit', mockId: id, by: caller.uid });
      res.json({ ok: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] edit failed:', error?.message || error);
      res.status(500).json({ error: 'Could not edit the mock.' });
    }
  });

  // List by month. Reads exactly the mocks in the month (31 at most).
  app.get('/api/tos/mocks', async (req, res) => {
    try {
      requireTos(req);
      const month = String((req.query.month as string) || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) throw httpError(400, 'Month must be YYYY-MM.');
      const start = `${month}-01`;
      const end = `${month}-31`;
      const snap = await adminDb
        .collection(MOCKS)
        .where('date', '>=', start)
        .where('date', '<=', end)
        .orderBy('date', 'asc')
        .get();
      const mocks = snap.docs.map((doc) => {
        const d = doc.data() as any;
        return {
          id: doc.id,
          examType: d.examType,
          title: d.title,
          date: d.date,
          status: d.status,
          questionCount: d.questionCount ?? null,
          durationMinutes: d.durationMinutes ?? null,
          seriesId: d.seriesId ?? null,
        };
      });
      res.json({ ok: true, month, mocks });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] list failed:', error?.message || error);
      res.status(500).json({ error: 'Could not list mocks.' });
    }
  });

  // Get one mock (the draft's definition or the frozen summary; never the key).
  app.get('/api/tos/mocks/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params.id || '');
      const snap = await adminDb.collection(MOCKS).doc(id).get();
      if (!snap.exists) throw httpError(404, 'Mock not found.');
      const d = snap.data() as any;
      res.json({
        ok: true,
        mock: {
          id: snap.id,
          examType: d.examType,
          title: d.title,
          date: d.date,
          status: d.status,
          questionSource: d.questionSource,
          subjects: d.subjects,
          seriesId: d.seriesId ?? null,
          durationMinutes: d.durationMinutes ?? null,
          questionCount: d.questionCount ?? null,
          frozenAt: d.frozenAt ?? null,
          createdAt: d.createdAt ?? null,
          updatedAt: d.updatedAt ?? null,
        },
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] get failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the mock.' });
    }
  });

  // The frozen paper, questions and options only, for the TOS preview. The
  // key is never read here and never leaves the server.
  app.get('/api/tos/mocks/:id/paper', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params.id || '');
      const mockSnap = await adminDb.collection(MOCKS).doc(id).get();
      if (!mockSnap.exists) throw httpError(404, 'Mock not found.');
      const status = String((mockSnap.data() as any)?.status || '');
      if (!['scheduled', 'live', 'closed', 'released', 'archived'].includes(status)) {
        throw httpError(409, 'The paper exists only after the mock is scheduled.');
      }
      const snap = await adminDb.collection(MOCK_PAPERS).doc(id).get();
      if (!snap.exists) throw httpError(404, 'Frozen paper not found.');
      res.json({ ok: true, paper: snap.data() });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] paper failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the paper.' });
    }
  });

  // Readiness check: warnings and errors a TOS staff member should see before
  // scheduling. Uses cheap count aggregations, never full document reads.
  app.get('/api/tos/mocks/:id/readiness', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params.id || '');
      const snap = await adminDb.collection(MOCKS).doc(id).get();
      if (!snap.exists) throw httpError(404, 'Mock not found.');
      const mock = snap.data() as any;
      const { settings } = await readSettings();
      const warnings: Array<{ level: 'warn' | 'error'; code: string; message: string }> = [];
      const counts: Record<string, number> = {};
      if (mock.status !== 'draft') {
        warnings.push({ level: 'warn', code: 'status', message: `This mock is ${mock.status}; readiness matters for Drafts.` });
      }
      if (mock.date < lagosToday()) {
        warnings.push({ level: 'error', code: 'past-date', message: 'The mock date is in the past and can no longer be scheduled.' });
      }
      if (mock.examType === 'jamb') {
        const compulsory = String(settings.jamb.compulsorySubject).toLowerCase();
        const subjects: Array<{ subject: string }> = mock.subjects || [];
        if (!subjects.some((s) => String(s.subject).toLowerCase() === compulsory)) {
          warnings.push({ level: 'error', code: 'compulsory-subject', message: `A JAMB mock must include ${settings.jamb.compulsorySubject}.` });
        }
      }
      const subjects: SubjectSpec[] = mock.subjects || [];
      const dupes = new Set<string>();
      for (const s of subjects) {
        for (const q of s.questionIds || []) {
          if (dupes.has(q)) warnings.push({ level: 'error', code: 'duplicate-question', message: `Question ${q} is picked more than once.` });
          dupes.add(q);
        }
      }
      for (const s of subjects) {
        const agg = await adminDb
          .collection(QB_QUESTIONS)
          .where('kind', '==', 'mock')
          .where('status', '==', 'published')
          .where('subject', '==', s.subject)
          .count()
          .get();
        const available = agg.data().count;
        counts[s.subject] = available;
        if (mock.questionSource !== 'picked' && available < s.count) {
          warnings.push({ level: 'error', code: 'not-enough-questions', message: `"${s.subject}" has only ${available} published mock questions but the mock needs ${s.count}.` });
        } else if (mock.questionSource !== 'picked' && available < Math.ceil(s.count * 1.2)) {
          warnings.push({ level: 'warn', code: 'low-margin', message: `"${s.subject}" has only ${available - s.count} spare questions beyond the ${s.count} needed.` });
        }
      }
      res.json({ ok: true, ready: !warnings.some((w) => w.level === 'error'), warnings, counts });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] readiness failed:', error?.message || error);
      res.status(500).json({ error: 'Could not run the readiness check.' });
    }
  });

  // Schedule (freeze): build the frozen paper without answers, build the
  // server-only key, and lock the mock. One batch write: paper + key + mock
  // status land together or not at all.
  app.post('/api/tos/mocks/:id/schedule', async (req, res) => {
    try {
      const caller = requireTos(req);
      const id = String(req.params.id || '');
      const { settings } = await readSettings();
      const mockSnap = await adminDb.collection(MOCKS).doc(id).get();
      if (!mockSnap.exists) throw httpError(404, 'Mock not found.');
      const mock = mockSnap.data() as any;
      if (mock.status !== 'draft') throw httpError(409, 'Only a Draft can be scheduled.');
      if (mock.date < lagosToday()) throw httpError(400, 'The mock date is in the past.');
      const subjects: SubjectSpec[] = mock.subjects || [];
      if (mock.examType === 'jamb') {
        const compulsory = String(settings.jamb.compulsorySubject).toLowerCase();
        if (!subjects.some((s) => s.subject.toLowerCase() === compulsory)) {
          throw httpError(400, `A JAMB mock must include ${settings.jamb.compulsorySubject}.`);
        }
      }
      const paper: PaperQuestion[] = [];
      const key: KeyItem[] = [];
      for (const s of subjects) {
        const picked =
          mock.questionSource === 'picked'
            ? await pickPicked(s.subject, (s.questionIds || []).slice(0, QUESTION_IDS_MAX))
            : await pickRandom(s.subject, s.count);
        paper.push(...picked.paper);
        key.push(...picked.key);
      }
      const expected = subjects.reduce((sum, s) => sum + s.count, 0);
      if (paper.length !== expected) {
        throw httpError(409, `Freeze built ${paper.length} questions but the mock declares ${expected}. Nothing was written.`);
      }
      const durationMinutes = mock.examType === 'jamb' ? settings.jamb.durationMinutes : settings.waecNeco.durationMinutes;
      const batch = adminDb.batch();
      batch.set(adminDb.collection(MOCK_PAPERS).doc(id), {
        mockId: id,
        examType: mock.examType,
        date: mock.date,
        durationMinutes,
        questionCount: paper.length,
        questions: paper,
      });
      // Server-only marking key: correct answers and explanations. Stored in
      // mockKeys, deny-all for browsers, read only by the marking code.
      batch.set(adminDb.collection(MOCK_KEYS).doc(id), {
        mockId: id,
        examType: mock.examType,
        date: mock.date,
        items: key,
      });
      batch.update(adminDb.collection(MOCKS).doc(id), {
        status: 'scheduled' as MockStatus,
        frozenAt: new Date().toISOString(),
        frozenBy: caller.uid,
        durationMinutes,
        questionCount: paper.length,
        tallyShards: settings.tallyShards,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.uid,
      });
      await batch.commit();
      void audit({ area: 'mocks', action: 'schedule', mockId: id, by: caller.uid, questionCount: paper.length });
      res.json({ ok: true, id, questionCount: paper.length, durationMinutes });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] schedule failed:', error?.message || error);
      res.status(500).json({ error: 'Could not schedule the mock.' });
    }
  });

  // Cancel: Draft or Scheduled only. A cancelled slot's date can be reused by
  // creating a new draft. Cancelling a Scheduled mock also deletes its paper
  // and key, so no frozen secret lingers for a mock that never runs.
  app.post('/api/tos/mocks/:id/cancel', async (req, res) => {
    try {
      const caller = requireTos(req);
      const id = String(req.params.id || '');
      let wasScheduled = false;
      await adminDb.runTransaction(async (tx) => {
        const ref = adminDb.collection(MOCKS).doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw httpError(404, 'Mock not found.');
        const status = String((snap.data() as any)?.status || '');
        if (status !== 'draft' && status !== 'scheduled') {
          throw httpError(409, `A ${status} mock cannot be cancelled.`);
        }
        wasScheduled = status === 'scheduled';
        tx.update(ref, {
          status: 'cancelled' as MockStatus,
          cancelledAt: new Date().toISOString(),
          cancelledBy: caller.uid,
        });
      });
      if (wasScheduled) {
        const batch = adminDb.batch();
        batch.delete(adminDb.collection(MOCK_PAPERS).doc(id));
        batch.delete(adminDb.collection(MOCK_KEYS).doc(id));
        await batch.commit();
      }
      void audit({ area: 'mocks', action: 'cancel', mockId: id, by: caller.uid, wasScheduled });
      res.json({ ok: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] cancel failed:', error?.message || error);
      res.status(500).json({ error: 'Could not cancel the mock.' });
    }
  });

  // Settings: read (defaults served when nothing is stored yet; a GET never
  // writes) and replace with validation.
  app.get('/api/tos/mocks/settings', async (req, res) => {
    try {
      requireTos(req);
      const { settings, stored } = await readSettings();
      res.json({ ok: true, settings, stored });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] settings read failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load mock settings.' });
    }
  });

  app.post('/api/tos/mocks/settings', async (req, res) => {
    try {
      const caller = requireTos(req);
      const settings = validateSettingsBody(req.body || {});
      await adminDb.collection(MOCK_SETTINGS).doc('global').set({
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.uid,
      });
      void audit({ area: 'mocks', action: 'settings', by: caller.uid });
      res.json({ ok: true, settings });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] settings write failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save mock settings.' });
    }
  });

  // Series preview: the planned papers with what each date already holds.
  // A preview reads only; nothing is written.
  app.post('/api/tos/mocks/series/preview', async (req, res) => {
    try {
      requireTos(req);
      const { settings } = await readSettings();
      const parsed = parseSeriesRequest(req.body || {}, settings);
      const papers = buildSeriesPlan(parsed);
      const statuses = await existingStatuses(papers);
      const plan = papers.map((p) => ({ ...p, existing: statuses[p.date] || null }));
      res.json({
        ok: true,
        plan,
        firstDate: papers[0]?.date ?? null,
        lastDate: papers[papers.length - 1]?.date ?? null,
        total: papers.length,
        compulsorySubjects: settings.compulsorySubjects,
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] series preview failed:', error?.message || error);
      res.status(500).json({ error: 'Could not build the series preview.' });
    }
  });

  // Series creation: one draft per paper date. Requires the typed confirm
  // word after the preview, per the platform confirm-gate rule. Safe to
  // re-run: dates that already hold a live mock are skipped and reported,
  // and a cancelled slot is rewritten as a fresh draft. Every created draft
  // carries the same seriesId plus the series' first and last dates.
  app.post('/api/tos/mocks/series', async (req, res) => {
    try {
      const caller = requireTos(req);
      const body = req.body || {};
      if (String(body.confirm || '').trim() !== 'CREATE SERIES') {
        throw httpError(400, 'Type CREATE SERIES to confirm creating the drafts.');
      }
      const { settings } = await readSettings();
      const parsed = parseSeriesRequest(body, settings);
      if (parsed.start < lagosToday()) throw httpError(400, 'The series start date is in the past.');
      const papers = buildSeriesPlan(parsed);
      const statuses = await existingStatuses(papers);
      const seriesId = `series-${parsed.start}-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const created: string[] = [];
      const skipped: Array<{ date: string; reason: string }> = [];
      const failed: Array<{ date: string; error: string }> = [];
      for (const p of papers) {
        const existing = statuses[p.date];
        if (existing && existing !== 'cancelled') {
          skipped.push({ date: p.date, reason: `A ${existing} mock is already on this date.` });
          continue;
        }
        try {
          await adminDb.runTransaction(async (tx) => {
            const ref = adminDb.collection(MOCKS).doc(`mock-${p.date}`);
            const snap = await tx.get(ref);
            if (snap.exists) {
              const st = String((snap.data() as any)?.status || '');
              if (st !== 'cancelled') {
                skipped.push({ date: p.date, reason: `A ${st} mock was created for this date moments ago.` });
                return;
              }
            }
            tx.set(ref, {
              id: `mock-${p.date}`,
              examType: 'waec_neco',
              title: p.title,
              date: p.date,
              status: 'draft' as MockStatus,
              questionSource: 'random',
              subjects: [{ subject: p.subject, count: parsed.count }],
              seriesId,
              seriesFirst: papers[0].date,
              seriesLast: papers[papers.length - 1].date,
              createdAt: now,
              createdBy: caller.uid,
              updatedAt: now,
              updatedBy: caller.uid,
            });
          });
          created.push(p.date);
        } catch (e: any) {
          failed.push({ date: p.date, error: e?.message || 'write failed' });
        }
      }
      void audit({ area: 'mocks', action: 'series-create', seriesId, by: caller.uid, total: papers.length, created: created.length, skipped: skipped.length, failed: failed.length });
      res.json({ ok: true, seriesId, total: papers.length, created, skipped, failed });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[mocks] series create failed:', error?.message || error);
      res.status(500).json({ error: 'Could not create the series.' });
    }
  });
}
