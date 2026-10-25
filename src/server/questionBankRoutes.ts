import express from 'express';
import { adminDb } from './firebaseAdmin';
import type { Query, QueryDocumentSnapshot, DocumentSnapshot, DocumentData, WriteBatch } from 'firebase-admin/firestore';
import { Caller, httpError } from './tenantService';
import { enrichFields, counterOpsForBatch, counterOpsForBatchMany, appendPublishCounterOps, mapKey, registerQuestionBankLibraryRoutes } from './questionBankLibrary';
import { randomUUID } from 'crypto';

/**
 * Platform Question Bank (Prompt G follow-on, publish pipeline).
 *
 * TOS staff author questions here; nothing leaves the platform until a
 * publish runs. Publish builds ONE versioned JSON file, uploads it to
 * Cloudinary through the unsigned `tos_publish` preset (folder `tos`,
 * resource_type raw) and never overwrites an existing versioned filename:
 * each publish lands on questionbank_v<N>.json with N = previous version + 1,
 * verified by fetching the file back before any Firestore record is written.
 *
 * Student practice later reads that file straight off the CDN, so practicing
 * stays free of Firestore reads; a version check against the published file
 * URL is all that tells a browser its cache is stale.
 *
 * Every route requires the `tos` claim (the /api/tos guard ran already);
 * validation lives here, never only in the UI. All writes happen because a
 * staff member clicked a confirm button in the console after seeing a
 * preview; nothing here writes on a GET.
 */

const QB_QUESTIONS = 'qbQuestions';
const QB_PUBLISHES = 'qbPublishes';
const QB_META = 'qbMeta'; // doc id 'current'
const QB_IMPORTS = 'qbImports'; // one record per bulk import, powers the Imports tab and Undo

// Same windowed-read ceiling the directory views use: a scan stops here
// rather than growing without bound.
const QB_SCAN_CAP = 2000;
// The publish review shows at most this many change rows; the counts stay
// exact, only the rendered list is capped.
const CHANGES_LIST_CAP = 300;

const DIFFICULTIES = ['easy', 'hard'] as const; // Prompt L2: easy and hard only
type Difficulty = (typeof DIFFICULTIES)[number];
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
type OptionKey = (typeof OPTION_KEYS)[number];
// The bank is split into two independent streams, each with its own version
// history and its own published file: practice (global, browser-cached until
// the next publish) and mock (daily CBT mock; built after practice ships).
const KINDS = ['practice', 'mock'] as const;
type Kind = (typeof KINDS)[number];
// Two exam pipelines. Both carry objective (MCQ) questions; essay authoring
// rides with the mock piece.
const EXAM_TYPES = ['jamb', 'waec_neco'] as const;
type ExamType = (typeof EXAM_TYPES)[number];
const EARLIEST_YEAR = 1978;
const IMPORT_MAX = 400;

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
    .catch((err) => console.error('[questionBank] audit write failed:', err?.message || err));
}

// ---------------------------------------------------------------------------
// Validation. Fields outside this whitelist are dropped, never stored.
// ---------------------------------------------------------------------------
const TEXT_MAX = 4000;
const OPTION_TEXT_MAX = 800;

interface ValidatedQuestion {
  kind: Kind;
  examType: ExamType;
  year: number | null;
  topic: string;
  subject: string;
  klass: string;
  difficulty: Difficulty;
  text: string;
  options: { key: OptionKey; text: string }[];
  correct: OptionKey;
  explanation: string;
  imageLink: string;
}

function parseYear(raw: any, required: boolean): number | null {
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw httpError(400, 'Year is required.');
    return null;
  }
  const y = Number(raw);
  if (!Number.isInteger(y) || y < EARLIEST_YEAR || y > 2099) {
    throw httpError(400, `Year must be a whole number between ${EARLIEST_YEAR} and 2099.`);
  }
  return y;
}

function validateQuestion(body: any): ValidatedQuestion {
  if (!body || typeof body !== 'object') throw httpError(400, 'Invalid request body.');

  const kindRaw = String(body.kind ?? 'practice').trim().toLowerCase();
  if (!(KINDS as readonly string[]).includes(kindRaw)) throw httpError(400, 'Kind must be practice or mock.');
  const kind = kindRaw as Kind;
  const examTypeRaw = String(body.examType ?? 'jamb').trim().toLowerCase();
  if (!(EXAM_TYPES as readonly string[]).includes(examTypeRaw)) throw httpError(400, 'Exam pipeline must be jamb or waec_neco.');
  const examType = examTypeRaw as ExamType;

  const subject = String(body.subject ?? '').trim();
  const klass = String(body.klass ?? '').trim();
  const topic = String(body.topic ?? '').trim();
  const difficulty = String(body.difficulty ?? '').trim().toLowerCase();
  const text = String(body.text ?? '').trim();
  const explanation = String(body.explanation ?? '').trim();
  const imageLink = String(body.imageLink ?? '').trim();

  if (!subject) throw httpError(400, 'Subject is required.');
  if (subject.length > 120) throw httpError(400, 'Subject is too long (max 120 characters).');
  if (klass.length > 120) throw httpError(400, 'Class is too long (max 120 characters).');
  if (!topic) throw httpError(400, 'Topic is required.');
  if (topic.length > 160) throw httpError(400, 'Topic is too long (max 160 characters).');
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) {
    throw httpError(400, 'Difficulty is easy or hard only.');
  }
  if (!text) throw httpError(400, 'Question text is required.');
  if (text.length > TEXT_MAX) throw httpError(400, `Question text is too long (max ${TEXT_MAX} characters).`);
  if (explanation.length > TEXT_MAX) throw httpError(400, `Explanation is too long (max ${TEXT_MAX} characters).`);
  if (imageLink) {
    if (!/^https:\/\//i.test(imageLink)) {
      throw httpError(400, 'Image link must be an https:// URL.');
    }
    if (imageLink.length > 2048) throw httpError(400, 'Image link is too long.');
  }
  const year = parseYear(body.year, kind === 'practice');

  const rawOptions: any[] = Array.isArray(body.options) ? body.options : [];
  if (rawOptions.length !== 4) throw httpError(400, 'Exactly four options (A to D) are required.');
  const options = OPTION_KEYS.map((key, i) => {
    const t = String(rawOptions[i]?.text ?? '').trim();
    if (!t) throw httpError(400, `Option ${key} must not be empty.`);
    if (t.length > OPTION_TEXT_MAX) throw httpError(400, `Option ${key} is too long (max ${OPTION_TEXT_MAX} characters).`);
    return { key, text: t };
  });

  const correct = String(body.correct ?? '').trim().toUpperCase();
  if (!(OPTION_KEYS as readonly string[]).includes(correct)) {
    throw httpError(400, 'The correct answer must be one of A, B, C or D.');
  }

  return { kind, examType, year, topic, subject, klass, difficulty: difficulty as Difficulty, text, options, correct: correct as OptionKey, explanation, imageLink };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
async function readAllQuestions(cap: number | null = QB_SCAN_CAP): Promise<QueryDocumentSnapshot[]> {
  const out: QueryDocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;
  for (;;) {
    let q = adminDb.collection(QB_QUESTIONS).orderBy('__name__').limit(400) as Query;
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    out.push(...snap.docs);
    if (snap.empty || snap.size < 400 || (cap != null && out.length >= cap)) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

async function readAllMeta(): Promise<Record<Kind, { currentVersion: number; currentFileUrl: string; currentPublishedAt: string | null }>> {
  const [practice, mock] = await Promise.all([
    adminDb.collection(QB_META).doc('practice').get(),
    adminDb.collection(QB_META).doc('mock').get(),
  ]);
  const shape = (doc: FirebaseFirestoreLikeDocument) => {
    const d = (doc.exists ? doc.data() : {}) as any;
    return {
      currentVersion: Number(d?.currentVersion) || 0,
      currentFileUrl: String(d?.currentFileUrl || ''),
      currentPublishedAt: d?.currentPublishedAt ? String(d.currentPublishedAt) : null,
    };
  };
  return { practice: shape(practice), mock: shape(mock) };
}
// Local type so the helper above reads naturally without pulling the SDK type.
type FirebaseFirestoreLikeDocument = { exists: boolean; data(): any };

function publicQuestion(d: DocumentData, id: string) {
  return {
    id,
    kind: String(d.kind || 'practice'),
    examType: String(d.examType || 'jamb'),
    year: d.year ?? null,
    topic: String(d.topic || ''),
    subject: String(d.subject || ''),
    klass: String(d.klass || ''),
    difficulty: String(d.difficulty || ''),
    text: String(d.text || ''),
    options: Array.isArray(d.options) ? d.options : [],
    correct: String(d.correct || ''),
    explanation: String(d.explanation || ''),
    imageLink: String(d.imageLink || ''),
    status: String(d.status || 'draft'),
    updatedAt: d.updatedAt || d.createdAt || '',
    publishedVersion: d.publishedVersion ?? null,
  };
}

// Deltas against the currently published version. Exported for the publish
// preview route and the publish route to share one definition of "changed".
function computeChanges(
  snaps: QueryDocumentSnapshot[],
  currentPublishedAt: string | null,
  currentVersion: number,
  kind: Kind,
): { added: QueryDocumentSnapshot[]; edited: QueryDocumentSnapshot[]; removed: QueryDocumentSnapshot[] } {
  const added: QueryDocumentSnapshot[] = [];
  const edited: QueryDocumentSnapshot[] = [];
  const removed: QueryDocumentSnapshot[] = [];
  snaps.forEach((s) => {
    const d = s.data() as any;
    // Questions belong to one stream only; each publishes separately.
    if (String(d.kind || 'practice') !== kind) return;
    const status = String(d.status || 'draft');
    const after = !currentPublishedAt || String(d.updatedAt || '') > currentPublishedAt;
    if (status === 'draft') {
      if (after || !currentPublishedAt) added.push(s);
    } else if (status === 'published') {
      if (after) edited.push(s);
    } else if (status === 'removed') {
      // A removed question only counts against the live version it once
      // appeared in.
      const wasInLive = currentVersion === 0 ? false : (Number(d.publishedVersion) || 0) > 0 && (Number(d.publishedVersion) || 0) <= currentVersion;
      if (wasInLive && after) removed.push(s);
    }
  });
  return { added, edited, removed };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export function registerQuestionBankRoutes(app: express.Express): void {
  // DEPRECATED (Prompt L2): this full-scan listing stops at QB_SCAN_CAP and
  // stays only for the current console screen. The paged replacement is
  // GET /api/tos/questionbank/list (see questionBankLibrary.ts).
  app.get('/api/tos/questionbank', async (req, res) => {
    try {
      requireTos(req);
      const [snaps, meta] = await Promise.all([readAllQuestions(), readAllMeta()]);
      const questions = snaps.map((s) => publicQuestion(s.data() as any, s.id));
      const subjects = Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      const ktopics = Array.from(new Set(questions.map((q) => q.topic).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      const counts = (k: Kind) => ({
        total: questions.filter((q) => (q as any).kind === k).length,
        drafts: questions.filter((q) => (q as any).kind === k && q.status === 'draft').length,
        published: questions.filter((q) => (q as any).kind === k && q.status === 'published').length,
        removed: questions.filter((q) => (q as any).kind === k && q.status === 'removed').length,
      });
      res.json({ questions, subjects, topics: ktopics, counts: { practice: counts('practice'), mock: counts('mock') }, meta, scanCapReached: snaps.length >= QB_SCAN_CAP });
    } catch (error: any) {
      console.error('[tos/questionbank] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to load the question bank.' });
    }
  });

  // Publish preview: the exact summary the confirm screen shows. Reads only.
  // One preview per stream: practice and mock publish independently.
  app.get('/api/tos/questionbank/publish-preview', async (req, res) => {
    try {
      requireTos(req);
      const kindRaw = String(req.query.kind ?? 'practice').trim().toLowerCase();
      if (!(KINDS as readonly string[]).includes(kindRaw)) throw httpError(400, 'Kind must be practice or mock.');
      const kind = kindRaw as Kind;
      // Publish-family reads take the WHOLE stream; the 2,000-document scan
      // cap must never truncate a publish (Prompt L2 amendment 4).
      const [snaps, meta] = await Promise.all([readAllQuestions(null), readAllMeta()]);
      const m = meta[kind];
      const { added, edited, removed } = computeChanges(snaps, m.currentPublishedAt, m.currentVersion, kind);
      const changes = [
        ...added.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'added', title: String((s.data() as any).text || '').slice(0, 120) })),
        ...edited.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'edited', title: String((s.data() as any).text || '').slice(0, 120) })),
        ...removed.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'removed', title: String((s.data() as any).text || '').slice(0, 120) })),
      ];
      const liveSnaps = snaps.filter((s) => String((s.data() as any).kind || 'practice') === kind
        && ['published', 'draft'].includes(String((s.data() as any).status || 'draft')));
      const liveCount = liveSnaps.length;
      const subjectSet = Array.from(new Set(
        liveSnaps.map((s) => String((s.data() as any).subject || '').trim()).filter(Boolean),
      )).sort((a, b) => a.localeCompare(b));
      res.json({
        kind,
        currentVersion: m.currentVersion,
        nextVersion: m.currentVersion + 1,
        added: added.length,
        edited: edited.length,
        removed: removed.length,
        changes,
        liveCount,
        subjects: subjectSet,
        fileName: `questionbank_${kind}_v${m.currentVersion + 1}.json`,
      });
    } catch (error: any) {
      console.error('[tos/questionbank/preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to build the publish preview.' });
    }
  });

  // Create a draft question.
  app.post('/api/tos/questionbank/questions', async (req, res) => {
    try {
      const caller = requireTos(req);
      const q = validateQuestion(req.body);
      const now = new Date().toISOString();
      const docData = {
        ...q,
        ...enrichFields({ kind: q.kind, examType: q.examType, subject: q.subject, topic: q.topic, year: q.year, text: q.text, correct: q.correct }),
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        publishedVersion: null,
        createdByUid: caller.uid,
        createdByEmail: caller.email || '',
      };
      const ref = adminDb.collection(QB_QUESTIONS).doc();
      const batch = adminDb.batch();
      batch.create(ref, docData);
      counterOpsForBatch(batch, q.kind, null, docData);
      await batch.commit();
      await audit({
        actorUid: caller.uid,
        action: 'QUESTION_CREATED',
        target: ref.id,
        after: { subject: q.subject, klass: q.klass, difficulty: q.difficulty },
      });
      res.json({ id: ref.id, ok: true });
    } catch (error: any) {
      console.error('[tos/questionbank/create] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to create the question.' });
    }
  });

  // Edit a draft or a published question. Editing a published question marks
  // it as a pending change that the next publish picks up; it never rewrites
  // the live file on its own.
  app.post('/api/tos/questionbank/questions/:id', async (req, res) => {
    try {
      const caller = requireTos(req);
      const q = validateQuestion(req.body);
      const ref = adminDb.collection(QB_QUESTIONS).doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) throw httpError(404, 'Question not found.');
      const prev = doc.data() as any;
      if (prev?.status === 'removed') throw httpError(409, 'This question was removed. Restore is not supported; add it again as a new question.');
      const now = new Date().toISOString();
      const next = { ...prev, ...q, updatedAt: now, editedByUid: caller.uid, editedByEmail: caller.email || '' };
      const batch = adminDb.batch();
      batch.update(ref, next);
      counterOpsForBatch(batch, (String(prev.kind || 'practice') as 'practice' | 'mock'), prev, next);
      await batch.commit();
      await audit({
        actorUid: caller.uid,
        action: 'QUESTION_EDITED',
        target: ref.id,
        before: { subject: prev?.subject, status: prev?.status },
        after: { subject: q.subject, klass: q.klass, difficulty: q.difficulty },
      });
      res.json({ id: ref.id, ok: true });
    } catch (error: any) {
      console.error('[tos/questionbank/edit] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to save the question.' });
    }
  });

  // Bulk import from the paste box: the client runs the same parsing engine
  // the centres' publisher uses, then posts the parsed questions here with
  // the shared defaults (pipeline, subject, class, year, topic, difficulty).
  // Every item is re-validated server-side; the UI's parse is a preview, not
  // a trust boundary. One call, capped, all-or-nothing per item.
  app.post('/api/tos/questionbank/import', async (req, res) => {
    try {
      const caller = requireTos(req);
      const body = req.body || {};
      const kindRaw = String(body.kind ?? 'practice').trim().toLowerCase();
      if (!(KINDS as readonly string[]).includes(kindRaw)) throw httpError(400, 'Kind must be practice or mock.');
      const kind = kindRaw as Kind;
      const examTypeRaw = String(body.examType ?? 'jamb').trim().toLowerCase();
      if (!(EXAM_TYPES as readonly string[]).includes(examTypeRaw)) throw httpError(400, 'Exam pipeline must be jamb or waec_neco.');
      const examType = examTypeRaw as ExamType;
      const subject = String(body.subject ?? '').trim();
      const klass = String(body.klass ?? '').trim();
      const topic = String(body.topic ?? '').trim();
      const difficultyRaw = String(body.difficulty ?? 'easy').trim().toLowerCase();
      if (!(DIFFICULTIES as readonly string[]).includes(difficultyRaw)) throw httpError(400, 'Difficulty is easy or hard only.');
      if (!subject) throw httpError(400, 'Subject is required for an import.');
      if (subject.length > 120) throw httpError(400, 'Subject is too long (max 120 characters).');
      if (klass.length > 120) throw httpError(400, 'Class is too long (max 120 characters).');
      if (!topic) throw httpError(400, 'Topic is required for an import.');
      if (topic.length > 160) throw httpError(400, 'Topic is too long (max 160 characters).');
      const year = parseYear(body.year, kind === 'practice');

      const items: any[] = Array.isArray(body.questions) ? body.questions : [];
      if (items.length === 0) throw httpError(400, 'No parsed questions arrived. Parse the paste again and try once more.');
      if (items.length > IMPORT_MAX) throw httpError(400, `Too many questions in one import (${items.length}). The cap is ${IMPORT_MAX} per import; split the paste.`);

      const now = new Date().toISOString();
      const batchId = `imp-${randomUUID()}`;
      const valid: any[] = [];
      items.forEach((item) => {
        const text = String(item?.text ?? '').trim();
        const explanation = String(item?.explanation ?? '').trim();
        const rawOptions: any[] = Array.isArray(item?.options) ? item.options : [];
        if (!text || text.length > TEXT_MAX) return;
        if (rawOptions.length !== 4) return;
        if (explanation.length > TEXT_MAX) return;
        const options = OPTION_KEYS.map((key, i) => {
          const t = String(rawOptions[i]?.text ?? '').trim();
          if (!t || t.length > OPTION_TEXT_MAX) return null;
          return { key, text: t };
        });
        if (options.some((o) => o === null)) return;
        const correct = String(item?.correct ?? '').trim().toUpperCase();
        if (!(OPTION_KEYS as readonly string[]).includes(correct)) return;
        valid.push({
          enriched: enrichFields({ kind, examType, subject, topic, year, text, correct, batchId }),
          text, options, correct: correct as OptionKey, explanation,
        });
      });
      if (valid.length === 0) throw httpError(400, 'None of the parsed questions passed validation. Check the paste format and try again.');

      // Duplicate check (L5): questions that share a stream, subject, wording
      // and correct answer share a hash. Checked in chunks of 30 with `in`,
      // so a 400-question paste costs 14 indexed queries, never a scan.
      const dupHashes = new Set<string>();
      const dupSamples: string[] = [];
      for (let i = 0; i < valid.length; i += 30) {
        const chunk = valid.slice(i, i + 30).map((v) => String(v.enriched.hash));
        const hits = await adminDb.collection(QB_QUESTIONS).where('hash', 'in', chunk).get();
        hits.docs.forEach((h) => dupHashes.add(String((h.data() as any).hash || '')));
      }
      const duplicateCount = valid.filter((v) => dupHashes.has(String(v.enriched.hash))).length;
      if (duplicateCount > 0) {
        valid.forEach((v) => {
          if (dupHashes.has(String(v.enriched.hash)) && dupSamples.length < 8) dupSamples.push(String(v.text).slice(0, 120));
        });
        const choice = String(body.duplicates ?? '').trim().toLowerCase();
        if (choice !== 'skip' && choice !== 'import') {
          res.json({
            ok: true,
            needsDecision: true,
            duplicateCount,
            total: valid.length,
            samples: dupSamples,
            note: `${duplicateCount} of the ${valid.length} questions in this paste already exist in the bank (same subject, wording and correct answer). Nothing was written. Skip the duplicates and import the rest, or import everything anyway.`,
          });
          return;
        }
      }
      const write = duplicateCount > 0 && String(body.duplicates).trim().toLowerCase() === 'skip'
        ? valid.filter((v) => !dupHashes.has(String(v.enriched.hash)))
        : valid;
      if (write.length === 0) {
        res.json({ ok: true, imported: 0, skipped: items.length, duplicateSkipped: valid.length, note: 'Everything in this paste already exists in the bank. Nothing was written.' });
        return;
      }
      const batch = adminDb.batch();
      const count = write.length;
      write.forEach((v) => {
        batch.create(adminDb.collection(QB_QUESTIONS).doc(), {
          kind, examType, subject, klass, topic, year, difficulty: difficultyRaw,
          ...v.enriched,
          batchId,
          text: v.text, options: v.options, correct: v.correct, explanation: v.explanation, imageLink: '',
          status: 'draft', createdAt: now, updatedAt: now, publishedVersion: null,
          createdByUid: caller.uid, createdByEmail: caller.email || '',
        });
      });
      // Every import gets a record in qbImports so the Library screen can
      // list batches and undo one. Same atomic batch as the questions.
      batch.create(adminDb.collection(QB_IMPORTS).doc(batchId), {
        batchId, kind, examType, subject, klass, topic, year, difficulty: difficultyRaw,
        count, importedAt: now, importedByUid: caller.uid, importedByEmail: caller.email || '',
        status: 'active', undoneAt: null, undoneByUid: null,
      });
      // The whole import totals into the counters in memory; each counter
      // document is written exactly once, in the same atomic batch.
      counterOpsForBatchMany(batch, kind, null, { kind, examType, subject, topic, year, status: 'draft' }, count);
      await batch.commit();
      await audit({
        actorUid: caller.uid,
        action: 'QUESTIONBANK_IMPORTED',
        after: { kind, examType, subject, topic, year, count, batchId, duplicateSkipped: valid.length - count },
      });
      res.json({ ok: true, imported: count, skipped: items.length - count, duplicateSkipped: valid.length - count, batchId });
    } catch (error: any) {
      console.error('[tos/questionbank/import] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Import failed.' });
    }
  });

  // Remove a question. Drafts are deleted outright; published questions are
  // soft-removed so the next publish records the removal in the version
  // history instead of leaving the live file silently out of date.
  app.delete('/api/tos/questionbank/questions/:id', async (req, res) => {
    try {
      const caller = requireTos(req);
      const ref = adminDb.collection(QB_QUESTIONS).doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists) throw httpError(404, 'Question not found.');
      const prev = doc.data() as any;
      if (prev?.status === 'removed') throw httpError(409, 'This question is already removed.');
      const now = new Date().toISOString();
      const batch = adminDb.batch();
      if (prev?.status === 'draft') {
        batch.delete(ref);
        counterOpsForBatch(batch, (String(prev.kind || 'practice') as 'practice' | 'mock'), prev, null);
      } else {
        const next = { ...prev, status: 'removed', removedAt: now, removedByUid: caller.uid, updatedAt: now };
        batch.update(ref, next);
        counterOpsForBatch(batch, (String(prev.kind || 'practice') as 'practice' | 'mock'), prev, next);
      }
      await batch.commit();
      await audit({
        actorUid: caller.uid,
        action: 'QUESTION_REMOVED',
        target: ref.id,
        before: { subject: prev?.subject, status: prev?.status },
      });
      res.json({ ok: true, hard: prev?.status === 'draft' });
    } catch (error: any) {
      console.error('[tos/questionbank/delete] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to remove the question.' });
    }
  });

  // Publish: build the versioned JSON file, upload it to Cloudinary, verify
  // the served bytes, then record the version and stamp the questions.
  // Nothing is written to Firestore unless the file round-trips.
  app.post('/api/tos/questionbank/publish', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (req.body?.confirm !== 'PUBLISH') {
        throw httpError(400, 'Missing confirm. This route publishes the whole live question bank and must be called with confirm:"PUBLISH" from the console review screen.');
      }

      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) {
        throw httpError(500, 'Cloudinary is not configured on this deployment (missing cloud name or upload preset).');
      }

      const kindRaw = String(req.body?.kind ?? 'practice').trim().toLowerCase();
      if (!(KINDS as readonly string[]).includes(kindRaw)) throw httpError(400, 'Kind must be practice or mock.');
      const kind = kindRaw as Kind;
      // Publish-family reads take the WHOLE stream; the 2,000-document scan
      // cap must never truncate a publish (Prompt L2 amendment 4).
      const [snaps, meta] = await Promise.all([readAllQuestions(null), readAllMeta()]);
      const m = meta[kind];
      const { added, edited, removed } = computeChanges(snaps, m.currentPublishedAt, m.currentVersion, kind);
      if (added.length + edited.length + removed.length === 0) {
        throw httpError(400, `Nothing to publish: no question was added, edited or removed since version ${m.currentVersion}.`);
      }

      const version = m.currentVersion + 1;
      const publishedAt = new Date().toISOString();

      // The live set: everything currently published plus the new drafts;
      // soft-removed questions drop out.
      const live = snaps.filter((s) => String((s.data() as any).kind || 'practice') === kind
        && ['published', 'draft'].includes(String((s.data() as any).status || '')));
      const questionsOut = live.map((s) => {
        const d = s.data() as any;
        const opts: Record<string, string> = {};
        (Array.isArray(d.options) ? d.options : []).forEach((o: any) => {
          if (o && typeof o.key === 'string') opts[o.key.toUpperCase()] = String(o.text ?? '');
        });
        return {
          id: s.id,
          examType: String(d.examType || 'jamb'),
          subject: String(d.subject || ''),
          klass: String(d.klass || ''),
          topic: String(d.topic || ''),
          year: Number(d.year) || null,
          difficulty: String(d.difficulty || 'medium'),
          text: String(d.text || ''),
          options: opts,
          correct: String(d.correct || ''),
          explanation: String(d.explanation || ''),
          imageLink: String(d.imageLink || ''),
        };
      });
      const bySubject: Record<string, number> = {};
      questionsOut.forEach((q) => { bySubject[q.subject] = (bySubject[q.subject] || 0) + 1; });

      const payload = {
        format: 'tos-questionbank',
        kind,
        version,
        publishedAt,
        count: questionsOut.length,
        subjects: bySubject,
        questions: questionsOut,
      };
      const bodyText = JSON.stringify(payload);
      // Loud failure, never silent truncation: Cloudinary's free plan caps a
      // raw file at 10 MB. Past that the single-file format cannot carry the
      // bank; the P3 split format takes over at that scale.
      const bodyBytes = Buffer.byteLength(bodyText, 'utf8');
      if (bodyBytes > 9.5 * 1024 * 1024) {
        throw httpError(413, `The ${kind} bank file is ${(bodyBytes / 1024 / 1024).toFixed(1)} MB for ${questionsOut.length} questions. Cloudinary's free plan caps one file at 10 MB, so this publish would fail mid-upload. Nothing was uploaded. Publish in this size range needs the P3 split format.`);
      }

      const changes = [
        ...added.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'added', title: String((s.data() as any).text || '').slice(0, 120) })),
        ...edited.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'edited', title: String((s.data() as any).text || '').slice(0, 120) })),
        ...removed.map((s) => ({ subject: String((s.data() as any).subject || ''), action: 'removed', title: String((s.data() as any).text || '').slice(0, 120) })),
      ];

      // Upload. The preset is unsigned and never overwrites: if a previous
      // publish attempt died between upload and verification, the target
      // file already exists and is an orphan of exactly this version, so the
      // retry lands on a "-r" suffixed name for the same version instead.
      let publicId = `questionbank_${kind}_v${version}`;
      const targetUrl = `https://res.cloudinary.com/${cloud}/raw/upload/tos/${publicId}.json`;
      const preexisting = await fetch(targetUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);

      const uploadOnce = async (pid: string, overwrite: boolean) => {
        const form = new FormData();
        form.append('upload_preset', preset);
        form.append('public_id', pid);
        form.append('folder', 'tos');
        if (overwrite) form.append('overwrite', 'true');
        form.append('file', new Blob([bodyText], { type: 'application/json' }), `${pid}.json`);
        const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, { method: 'POST', body: form });
        const data: any = await resp.json().catch(() => null);
        if (!resp.ok) {
          const detail = data?.error?.message || `Cloudinary returned ${resp.status}`;
          throw httpError(502, `The question bank file could not be uploaded to Cloudinary: ${detail}`);
        }
        return data;
      };

      if (preexisting) publicId = `questionbank_${kind}_v${version}r`;
      const upload = await uploadOnce(publicId, false);
      const fileUrl = String(upload.secure_url || '');

      // Verify the served file before anything is recorded.
      const verify = await fetch(fileUrl).catch(() => null);
      if (!verify || !verify.ok) {
        throw httpError(502, `The published file was uploaded but the verification read failed (${verify ? verify.status : 'no response'}). Nothing was recorded; try publishing again.`);
      }
      const verifyBody: any = await verify.json().catch(() => null);
      if (!verifyBody || verifyBody.version !== version || verifyBody.count !== questionsOut.length) {
        throw httpError(502, `The uploaded ${kind} file did not round-trip with the expected contents. Nothing was recorded; try publishing again.`);
      }

      // File verified. Record the version, refresh the meta doc, and stamp
      // every draft and edited question as part of this version.
      const stampRefs = [...added, ...edited].map((s) => s.ref);
      // Firestore batches cap at 500 operations. The first batch carries the
      // version record and meta doc, later batches carry the stamps only.
      const stampChunk = (refs: typeof stampRefs, includeRecords: boolean): WriteBatch => {
        const b = adminDb.batch();
        if (includeRecords) {
          b.set(adminDb.collection(QB_PUBLISHES).doc(), {
            kind,
            version,
            publicId,
            fileUrl,
            publishedAt,
            publishedByUid: caller.uid,
            publishedByEmail: caller.email || '',
            counts: { added: added.length, edited: edited.length, removed: removed.length, live: questionsOut.length },
            subjects: bySubject,
            changes: changes.slice(0, CHANGES_LIST_CAP),
            changesTruncated: changes.length > CHANGES_LIST_CAP,
          });
          b.set(adminDb.collection(QB_META).doc(kind), {
            currentVersion: version,
            currentFileUrl: fileUrl,
            currentPublicId: publicId,
            currentPublishedAt: publishedAt,
            liveCount: questionsOut.length,
            bySubject,
          }, { merge: false });
        }
        refs.forEach((r) => b.update(r, { status: 'published', publishedVersion: version, publishedAt }));
        return b;
      };
      const CHUNK = 450; // leaves room for the two set() calls in batch one
      for (let i = 0; i < stampRefs.length; i += CHUNK) {
        await stampChunk(stampRefs.slice(i, i + CHUNK), i === 0).commit();
      }
      if (stampRefs.length === 0) {
        await stampChunk([], true).commit();
      }

      // Counter books: the added drafts move draft -> published and the
      // changed count resets. Its own batch, so the 450-op stamp chunks keep
      // headroom; if a crash ever lands between the two, Recount repairs it.
      const addedGroups: { sKey: string; count: number }[] = [];
      const groupTotals = new Map<string, number>();
      added.forEach((s) => {
        const k = mapKey((s.data() as any).subject);
        if (k) groupTotals.set(k, (groupTotals.get(k) || 0) + 1);
      });
      groupTotals.forEach((cnt, sKey) => addedGroups.push({ sKey, count: cnt }));
      if (added.length > 0) {
        const counterBatch = adminDb.batch();
        appendPublishCounterOps(counterBatch, kind, addedGroups, added.length);
        await counterBatch.commit();
      }

      await audit({
        actorUid: caller.uid,
        action: 'QUESTIONBANK_PUBLISHED',
        after: { version, fileUrl, added: added.length, edited: edited.length, removed: removed.length, live: questionsOut.length },
      });

      res.json({
        ok: true,
        version,
        fileUrl,
        counts: { added: added.length, edited: edited.length, removed: removed.length, live: questionsOut.length },
        subjects: bySubject,
      });
    } catch (error: any) {
      console.error('[tos/questionbank/publish] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Publish failed.' });
    }
  });

  registerQuestionBankLibraryRoutes(app, requireTos);
}
