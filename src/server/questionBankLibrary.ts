import express from 'express';
import { createHash } from 'crypto';
import { adminDb } from './firebaseAdmin';
import {
  FieldValue,
  type WriteBatch,
  type Transaction,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type { Caller } from './tenantService';
import { httpError } from './tenantService';

/**
 * Platform question bank library (Prompt L, piece L2).
 *
 * The old read route scans the whole collection capped at 2,000 documents,
 * which cannot serve a bank that grows into the tens of thousands. This
 * module adds the paged replacement:
 *
 *   GET /api/tos/questionbank/list      one page of rows, server-side filters,
 *                                       cursor pagination (old route stays
 *                                       alive but is deprecated)
 *   GET /api/tos/questionbank/tree      the count tree, built from counters
 *   GET /api/tos/questionbank/item/:id  one full question for the editor
 *   GET  /api/tos/questionbank/backfill-preview   and POST (confirm:"BACKFILL")
 *   GET  /api/tos/questionbank/recount-preview    and POST (confirm:"RECOUNT")
 *
 * Counters follow the reviewed plan as amended: one small top-level summary
 * document per stream (qbCounts/{kind}) plus one counter document per
 * subject per stream (qbCounts/{kind}__s__{subjectKey}). No single document
 * holds the whole tree, so neither the 1 MB document limit nor the
 * 1-write-per-second-per-document limit is at risk in normal use.
 *
 * Normalised keys: subject and topic branch keys are lowercased and
 * whitespace-collapsed, then dots, slashes and backslashes become "_", so
 * "Chemical bonding" and "Chemical Bonding" are one branch and a topic named
 * "1.5 Newton" cannot create nested map fields. The original spelling is
 * kept in a label next to every key. Search tokens are lowercase whole words
 * from the question text (max 40). `hash` is a stable duplicate fingerprint
 * (kind + subject + normalised text + correct answer) used for duplicate
 * detection, never for identity.
 *
 * Every write route in questionBankRoutes.ts now records its change in these
 * counters in the same atomic batch/transaction as the question write, using
 * FieldValue.increment, so a counter can never drift behind a crash. Imports
 * and bulk actions total their whole change set in memory and write each
 * counter document once per commit.
 *
 * Nothing here writes on a GET; both maintenance routes write only with an
 * explicit confirm string from the console after a preview.
 */

const QB_QUESTIONS = 'qbQuestions';
const QB_COUNTS = 'qbCounts';
const QB_META = 'qbMeta';
const QB_IMPORTS = 'qbImports'; // one record per bulk import, powers the Imports tab and Undo

const KINDS: readonly string[] = ['practice', 'mock'];
const QB_LIST_CAP = 100;
const QB_PAGE_BUDGET = 10; // fetch rounds for the search/trim loop, per request
const QB_SCAN_PAGE = 500;
const QB_SCAN_PAGES_MAX = 200; // 100k documents, a hard stop for maintenance scans
const BACKFILL_MAX_DOCS = 400;
const SUBJECT_DOC_CAP = 200;

function parseKind(raw: unknown): Kind {
  const kind = String(raw ?? 'practice').trim().toLowerCase();
  if (!KINDS.includes(kind)) throw httpError(400, 'Kind must be practice or mock.');
  return kind as Kind;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ---------------------------------------------------------------------------
// Normalised keys, tokens, paths, hash
// ---------------------------------------------------------------------------

export function normKey(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function mapKey(raw: unknown): string {
  return normKey(raw).replace(/[.\\/]/g, '_');
}

export function tokensOf(text: unknown): string[] {
  const seen = new Set<string>();
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach((w) => {
      if (w.length >= 2 && w.length <= 40) seen.add(w);
    });
  return Array.from(seen).slice(0, 40);
}

export function enrichFields(d: {
  kind?: unknown; examType?: unknown; subject?: unknown; topic?: unknown;
  year?: unknown; text?: unknown; correct?: unknown; batchId?: unknown;
}) {
  const subjectKey = mapKey(d.subject);
  const topicKey = mapKey(d.topic);
  const paths: string[] = [];
  if (normKey(d.examType)) paths.push(`e:${normKey(d.examType)}`);
  if (subjectKey) paths.push(`s:${subjectKey}`);
  if (topicKey) paths.push(`t:${topicKey}`);
  if (d.year != null && d.year !== '' && Number(d.year)) paths.push(`y:${Number(d.year)}`);
  if (normKey(d.batchId)) paths.push(`b:${normKey(d.batchId)}`);
  const hash = createHash('sha256')
    .update(
      `${String(d.kind || 'practice')}|${subjectKey}|${String(d.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()}|${String(d.correct ?? '').toUpperCase()}`
    )
    .digest('hex');
  return { subjectKey, topicKey, tokens: tokensOf(d.text), paths, hash };
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Write a dotted path as REAL nested objects inside the merge payload.
 * A dotted string key in a merge-set ("byStatus.published") lands in
 * Firestore as one literal field name containing a dot, sitting BESIDE the
 * nested count maps the recount writes, so every reader of summary.byStatus
 * or summary.subjects never sees it. Nesting the same path keeps each
 * counter update inside the maps the screens read.
 */
function setDotted(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const existing = node[key];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

type CounterSide = {
  sKey: string; sLabel: string; tKey: string; tLabel: string;
  year: number | null; examType: string; status: string;
} | null;

function sideOf(d: any): CounterSide {
  if (!d) return null;
  const sKey = mapKey(d.subject);
  if (!sKey) return null;
  return {
    sKey,
    sLabel: String(d.subject || ''),
    tKey: mapKey(d.topic),
    tLabel: String(d.topic || ''),
    year: d.year == null || d.year === '' ? null : Number(d.year) || null,
    examType: String(d.examType || 'jamb'),
    status: String(d.status || 'draft'),
  };
}

type SubjectEntry = { label: string; f: Record<string, number> };

/** Accumulates counter deltas in memory, then writes each document once. */
class CounterAcc {
  summary: Record<string, number> = {};
  sLabels: Record<string, string> = {};
  tLabels: Record<string, Record<string, string>> = {};
  subj: Map<string, SubjectEntry> = new Map();

  private bump(map: Record<string, number>, path: string, n: number) {
    map[path] = (map[path] || 0) + n;
  }

  /** Record one question's contribution n times (imports pass n = count). */
  side(raw: CounterSide, sign: 1 | -1, n = 1) {
    if (!raw || !n) return;
    const active = raw.status !== 'removed';
    this.bump(this.summary, 'changed', sign * n);
    if (active) {
      this.bump(this.summary, 'total', sign * n);
      this.bump(this.summary, `byExamType.${raw.examType}.total`, sign * n);
      this.bump(this.summary, `subjects.${raw.sKey}.total`, sign * n);
      this.sLabels[raw.sKey] = raw.sLabel;
    }
    this.bump(this.summary, `byStatus.${raw.status}`, sign * n);

    const entry = this.subj.get(raw.sKey) || { label: raw.sLabel, f: {} };
    entry.label = raw.sLabel;
    this.subj.set(raw.sKey, entry);
    this.bump(entry.f, `byStatus.${raw.status}`, sign * n);
    if (active) {
      this.bump(entry.f, 'total', sign * n);
      this.bump(entry.f, `byExamType.${raw.examType}.total`, sign * n);
      if (raw.tKey) {
        this.bump(entry.f, `byTopic.${raw.tKey}.total`, sign * n);
        const tl = this.tLabels[raw.sKey] || {};
        tl[raw.tKey] = raw.tLabel;
        this.tLabels[raw.sKey] = tl;
        if (raw.year != null) {
          this.bump(entry.f, `byTopic.${raw.tKey}.byYear.${raw.year}`, sign * n);
          this.bump(entry.f, `byYear.${raw.year}`, sign * n);
        }
      }
    }
  }

  /** Append the batched writes: each counter document is touched once. */
  flush(target: WriteBatch | Transaction, kind: Kind) {
    // The SDK types set() differently on batches and transactions; the calls
    // themselves are identical, so one cast keeps a single implementation.
    const batch = target as WriteBatch;
    const summaryRef = adminDb.collection(QB_COUNTS).doc(kind);
    const sOp: Record<string, unknown> = { kind, updatedAt: new Date().toISOString() };
    for (const [p, n] of Object.entries(this.summary)) setDotted(sOp, p, FieldValue.increment(n));
    for (const [k, label] of Object.entries(this.sLabels)) setDotted(sOp, `subjects.${k}.label`, label);
    batch.set(summaryRef, sOp, { merge: true });

    for (const [sKey, entry] of this.subj) {
      const ref = adminDb.collection(QB_COUNTS).doc(`${kind}__s__${sKey}`);
      const op: Record<string, unknown> = {
        kind, subjectKey: sKey, label: entry.label, updatedAt: new Date().toISOString(),
      };
      for (const [p, n] of Object.entries(entry.f)) setDotted(op, p, FieldValue.increment(n));
      const tl = this.tLabels[sKey] || {};
      for (const [tKey, label] of Object.entries(tl)) setDotted(op, `byTopic.${tKey}.label`, label);
      batch.set(ref, op, { merge: true });
    }
  }

/** Record one document change (prev data before, next data after; null = gone). */
  change(prev: any, next: any) {
    this.side(sideOf(prev), -1);
    this.side(sideOf(next), 1);
  }
}

/** Shared accumulator for bulk actions: totals in memory, one write per counter doc. */
export function createCounterAcc(): CounterAcc {
  return new CounterAcc;
}

/** prev = document data before the change, next = after (null = gone). */
export function counterOpsForBatch(
  batch: WriteBatch, kind: Kind, prev: any, next: any
): void {
  const acc = new CounterAcc();
  acc.side(sideOf(prev), -1);
  acc.side(sideOf(next), 1);
  acc.flush(batch, kind);
}

export function counterOpsForTransaction(
  tx: Transaction, kind: Kind, prev: any, next: any
): void {
  const acc = new CounterAcc();
  acc.side(sideOf(prev), -1);
  acc.side(sideOf(next), 1);
  acc.flush(tx, kind);
}

/** Same as counterOpsForBatch, but next represents n identical documents. */
export function counterOpsForBatchMany(
  batch: WriteBatch, kind: Kind, prev: any, next: any, n: number
): void {
  const acc = new CounterAcc();
  acc.side(sideOf(prev), -1);
  acc.side(sideOf(next), 1, Math.max(0, n));
  acc.flush(batch, kind);
}

/** Publish moves added questions from draft to published and resets changed. */
export function appendPublishCounterOps(
  batch: WriteBatch,
  kind: Kind,
  addedGroups: { sKey: string; count: number }[],
  totalAdded: number
): void {
  const summaryRef = adminDb.collection(QB_COUNTS).doc(kind);
  const sOp: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    changed: 0,
  };
  setDotted(sOp, 'byStatus.draft', FieldValue.increment(-totalAdded));
  setDotted(sOp, 'byStatus.published', FieldValue.increment(totalAdded));
  batch.set(summaryRef, sOp, { merge: true });
  for (const g of addedGroups) {
    if (!g.sKey || !g.count) continue;
    const ref = adminDb.collection(QB_COUNTS).doc(`${kind}__s__${g.sKey}`);
    const op: Record<string, unknown> = {
      kind,
      subjectKey: g.sKey,
      updatedAt: new Date().toISOString(),
    };
    setDotted(op, 'byStatus.draft', FieldValue.increment(-g.count));
    setDotted(op, 'byStatus.published', FieldValue.increment(g.count));
    batch.set(ref, op, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

type KindMeta = { currentVersion: number; currentFileUrl: string; currentPublishedAt: string | null };

async function readKindMeta(kind: Kind): Promise<KindMeta> {
  const doc = await adminDb.collection(QB_META).doc(kind).get();
  const d = (doc.exists ? doc.data() : {}) as any;
  return {
    currentVersion: Number(d?.currentVersion) || 0,
    currentFileUrl: String(d?.currentFileUrl || ''),
    currentPublishedAt: d?.currentPublishedAt ? String(d.currentPublishedAt) : null,
  };
}

async function readSummary(kind: Kind) {
  const doc = await adminDb.collection(QB_COUNTS).doc(kind).get();
  return doc.exists ? (doc.data() as any) : null;
}

async function readSubjectDocs(kind: Kind, sKeys: string[]) {
  const keys = sKeys.slice(0, SUBJECT_DOC_CAP);
  const docs = await Promise.all(
    keys.map((k) => adminDb.collection(QB_COUNTS).doc(`${kind}__s__${k}`).get())
  );
  return docs.map((d, i) => ({ sKey: keys[i], data: d.exists ? (d.data() as any) : null }));
}

/** Full paged scan ordered by document name; for maintenance routes only. */
async function scanAll(
  kind: Kind | null,
  onPage: (docs: QueryDocumentSnapshot[]) => void | Promise<void>
): Promise<number> {
  let cursor: QueryDocumentSnapshot | undefined;
  let count = 0;
  for (let page = 0; page < QB_SCAN_PAGES_MAX; page += 1) {
    let q = adminDb.collection(QB_QUESTIONS).orderBy('__name__').limit(QB_SCAN_PAGE) as Query;
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    onPage(snap.docs);
    count += snap.size;
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.empty || snap.size < QB_SCAN_PAGE) break;
  }
  return count;
}

async function scanKind(
  kind: Kind,
  onPage: (docs: QueryDocumentSnapshot[]) => void | Promise<void>
): Promise<number> {
  return scanAll(null, (docs) => {
    onPage(docs.filter((s) => String((s.data() as any).kind || 'practice') === kind));
  });
}

// ---------------------------------------------------------------------------
// Setup state (drives the "Set up needed" notice on the new screen)
// ---------------------------------------------------------------------------

async function markSetup(kind: Kind, field: 'backfilled' | 'recounted', value: boolean) {
  await adminDb.collection(QB_COUNTS).doc(kind).set(
    { kind, setup: { [field]: value, updatedAt: new Date().toISOString() } },
    { merge: true }
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerQuestionBankLibraryRoutes(
  app: express.Express,
  requireTos: (req: express.Request) => Caller
): void {

  // One page of rows. Search (q) runs across the WHOLE stream by design; it
  // is refused together with a tree scope so the two never blur. Trimming a
  // page after a search keeps fetching until a full page matches or the
  // stream ends (bounded by QB_PAGE_BUDGET rounds per request, ~1,000 docs).
  app.get('/api/tos/questionbank/list', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      const limit = clampInt(req.query.limit, 50, 1, QB_LIST_CAP);
      const status = String(req.query.status || 'all');
      if (!['all', 'draft', 'published', 'removed', 'changed'].includes(status)) {
        throw httpError(400, 'Unknown status tab.');
      }
      const sort = String(req.query.sort || 'updated');
      if (!['updated', 'year', 'subject'].includes(sort)) throw httpError(400, 'Unknown sort.');
      const q = String(req.query.q || '').trim();
      const difficulty = String(req.query.difficulty || '').trim().toLowerCase();
      if (difficulty && !['easy', 'hard'].includes(difficulty)) {
        throw httpError(400, 'Difficulty is easy or hard only.');
      }
      const klass = String(req.query.klass || '').trim();

      // Exactly one tree scope at a time, taken from the normalised key fields.
      const scope: Array<[string, string | number]> = [];
      if (String(req.query.examType || '').trim()) scope.push(['examType', normKey(req.query.examType)]);
      if (String(req.query.subject || '').trim()) scope.push(['subjectKey', mapKey(req.query.subject)]);
      if (String(req.query.topic || '').trim()) scope.push(['topicKey', mapKey(req.query.topic)]);
      if (String(req.query.year || '').trim()) {
        const y = Number(req.query.year);
        if (!Number.isInteger(y) || y < 1978 || y > 2099) throw httpError(400, 'Year must be between 1978 and 2099.');
        // The documents store year as a number (parseYear), so compare with
        // the number, not the string form. The string never matched, which
        // made every year drill-down return zero rows.
        scope.push(['year', y]);
      }
      if (String(req.query.batchId || '').trim()) scope.push(['batchId', normKey(req.query.batchId)]);
      if (scope.length > 1) {
        throw httpError(400, 'Pick one tree scope at a time (exam, subject, topic, year or batch).');
      }
      const search = q.length > 0;
      if (search && scope.length) {
        throw httpError(400, 'Search runs across the whole stream, so it cannot be combined with a tree scope. Clear the tree selection to search.');

      }

      let query = adminDb.collection(QB_QUESTIONS) as Query;
      query = query.where('kind', '==', kind);
      if (status === 'changed') {
        const meta = await readKindMeta(kind);
        if (meta.currentPublishedAt) query = query.where('updatedAt', '>', meta.currentPublishedAt);
      } else if (status !== 'all') {
        query = query.where('status', '==', status);
      }
      if (scope.length === 1) query = query.where(scope[0][0], '==', scope[0][1]);
      if (difficulty) query = query.where('difficulty', '==', difficulty);
      if (klass) query = query.where('klass', '==', klass);

      // Search: lowercase whole words, up to 3, case-insensitive via tokens.
      const words = search
        ? Array.from(new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2))).slice(0, 3)
        : [];
      if (words.length) query = query.where('tokens', 'array-contains-any', words);
      // Search and the changed tab always sort by recency; a scope query with
      // sort=year or sort=subject sorts by that column instead.
      if (words.length || status === 'changed' || sort === 'updated') {
        query = query.orderBy('updatedAt', 'desc');
      } else if (sort === 'year') {
        query = query.orderBy('year', 'desc');
      } else if (sort === 'subject') {
        query = query.orderBy('subject', 'asc');
        query = query.orderBy('updatedAt', 'desc');
      }

      // Cursor: base64 of the order-by values plus the last document id.
      let start: { v: unknown[]; i: string } | null = null;
      if (req.query.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(String(req.query.cursor), 'base64').toString('utf8'));
          if (decoded && Array.isArray(decoded.v) && typeof decoded.i === 'string') start = decoded;
        } catch { throw httpError(400, 'Bad cursor. Clear it and start from the first page.'); }
      }

      const matches = (d: any) => {
        if (words.length) {
          const hay = `${String(d.text || '')} ${String(d.explanation || '')} ${String(d.subject || '')} ${String(d.topic || '')}`.toLowerCase();
          if (!words.every((w) => hay.includes(w))) return false;
        }
        return true;
      };

      const items: any[] = [];
      let nextCursor: string | null = null;
      let hasMore = false;
      let lastDoc: QueryDocumentSnapshot | null = null;
      let lastReturned: QueryDocumentSnapshot | null = null;

      for (let round = 0; round < (search ? QB_PAGE_BUDGET : 1); round += 1) {
        let page = query.limit(limit + 1) as Query;
        if (start) page = page.startAfter(...(start.v as any[]), adminDb.collection(QB_QUESTIONS).doc(start.i));
        const snap = await page.get();
        if (snap.empty) break;
        for (const s of snap.docs) {
          lastDoc = s;
          const d = s.data() as any;
          if (!matches(d)) continue;
          if (items.length >= limit) { hasMore = true; break; }
          lastReturned = s;
          items.push({
            id: s.id,
            kind,
            examType: String(d.examType || 'jamb'),
            subject: String(d.subject || ''),
            subjectKey: String(d.subjectKey || mapKey(d.subject)),
            topic: String(d.topic || ''),
            topicKey: String(d.topicKey || mapKey(d.topic)),
            klass: String(d.klass || ''),
            year: d.year ?? null,
            difficulty: String(d.difficulty || ''),
            status: String(d.status || 'draft'),
            textPreview: String(d.text || '').slice(0, 240),
            correct: String(d.correct || ''),
            optionCount: Array.isArray(d.options) ? d.options.length : 0,
            batchId: d.batchId ? String(d.batchId) : null,
            publishedVersion: d.publishedVersion ?? null,
            createdAt: String(d.createdAt || ''),
            updatedAt: String(d.updatedAt || ''),
          });
        }
        if (items.length >= limit) break;
        if (snap.size <= limit) break;
        // Continue the trim loop from where this round stopped.
        start = { v: orderByValues(sort, words.length > 0 || status === 'changed', lastReturned), i: lastReturned!.id };
      }
      if (items.length >= limit && lastReturned) {
        nextCursor = Buffer.from(JSON.stringify({ v: orderByValues(sort, words.length > 0 || status === 'changed', lastReturned), i: lastReturned.id })).toString('base64');
        hasMore = true;
      }

      const [summary, meta] = await Promise.all([readSummary(kind), readKindMeta(kind)]);
      const setupNeeded = !summary?.setup?.backfilled || !summary?.setup?.recounted;
      const repairNeeded = Boolean(summary) && Object.keys(summary).some((k) => k.includes('.'));
      res.json({
        ok: true,
        scopeEcho: scope,
        kind,
        items,
        nextCursor,
        hasMore,
        setupNeeded,
        repairNeeded,
        publishedAt: meta.currentPublishedAt,
        meta: {
          currentVersion: meta.currentVersion,
          currentFileUrl: meta.currentFileUrl,
          currentPublishedAt: meta.currentPublishedAt,
        },
        tabs: {
          total: Number(summary?.total) || 0,
          draft: Number(summary?.byStatus?.draft) || 0,
          published: Number(summary?.byStatus?.published) || 0,
          removed: Number(summary?.byStatus?.removed) || 0,
          changed: Number(summary?.changed) || 0,
        },
      });
    } catch (error: any) {
      console.error('[tos/questionbank/list] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to list questions.' });
    }
  });

  // One full question for the editor panel (one read).
  app.get('/api/tos/questionbank/item/:id', async (req, res) => {
    try {
      requireTos(req);
      const doc = await adminDb.collection(QB_QUESTIONS).doc(req.params.id).get();
      if (!doc.exists) throw httpError(404, 'Question not found.');
      const d = doc.data() as any;
      res.json({
        ok: true,
        item: {
          id: doc.id,
          ...d,
          subjectKey: String(d.subjectKey || mapKey(d.subject)),
          topicKey: String(d.topicKey || mapKey(d.topic)),
        },
      });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to load the question.' });
    }
  });

  // The count tree: one summary document plus one document per subject.
  app.get('/api/tos/questionbank/tree', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      const summary = await readSummary(kind);
      const setupNeeded = !summary?.setup?.backfilled || !summary?.setup?.recounted;
      // Counter repair check, free on the reads already in hand: a field name
      // containing a dot in a counter document means counter updates were
      // once saved BESIDE the count maps instead of inside them, so the
      // numbers below are stale until a recount rewrites the documents.
      const hasDottedKeys = (d: unknown) =>
        Boolean(d) && Object.keys(d as Record<string, unknown>).some((k) => k.includes('.'));
      if (!summary) {
        res.json({ ok: true, kind, setupNeeded, repairNeeded: false, setup: null, summary: null, subjects: [] });
        return;
      }
      const sKeys = Object.keys(summary.subjects || {}).slice(0, SUBJECT_DOC_CAP);
      const subjectDocs = await readSubjectDocs(kind, sKeys);
      const repairNeeded = hasDottedKeys(summary) || subjectDocs.some(({ data }) => hasDottedKeys(data));
      const subjects = subjectDocs.map(({ sKey, data }) => ({
        key: sKey,
        label: String(data?.label || summary.subjects?.[sKey]?.label || sKey),
        total: Number(data?.total ?? summary.subjects?.[sKey]?.total) || 0,
        byStatus: data?.byStatus || null,
        byExamType: data?.byExamType || null,
        byYear: data?.byYear || {},
        topics: Object.entries(data?.byTopic || {}).map(([tKey, t]: [string, any]) => ({
          key: tKey,
          label: String(t.label || tKey),
          total: Number(t.total) || 0,
          byYear: t.byYear || {},
        })).sort((a, b) => a.label.localeCompare(b.label)),
      }));
      const meta = await readKindMeta(kind);
      res.json({
        ok: true,
        kind,
        setupNeeded,
        repairNeeded,
        setup: summary.setup || null,
        publishedAt: meta.currentPublishedAt,
        summary: {
          total: Number(summary.total) || 0,
          byStatus: summary.byStatus || {},
          changed: Number(summary.changed) || 0,
          byExamType: summary.byExamType || {},
          subjects: Object.keys(summary.subjects || {}).length,
        },
        subjects,
      });
    } catch (error: any) {
      console.error('[tos/questionbank/tree] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to build the tree.' });
    }
  });

  // Backfill preview: read-only scan showing what the backfill would write.
  app.get('/api/tos/questionbank/backfill-preview', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      let total = 0;
      let needing = 0;
      const hashCounts = new Map<string, number>();
      const dupSamples: string[] = [];
      await scanKind(kind, (docs) => {
        total += docs.length;
        for (const s of docs) {
          const d = s.data() as any;
          const e = enrichFields(d);
          const missing = !d.subjectKey || !d.topicKey || !Array.isArray(d.tokens) || d.tokens.length === 0
            || !Array.isArray(d.paths) || d.paths.length === 0 || !d.hash;
          if (missing) needing += 1;
          const h = String(d.hash || e.hash);
          hashCounts.set(h, (hashCounts.get(h) || 0) + 1);
          if (hashCounts.get(h) === 2 && dupSamples.length < 10) {
            dupSamples.push(String(d.text || '').slice(0, 120));
          }
        }
      });
      let dupGroups = 0;
      hashCounts.forEach((c) => { if (c > 1) dupGroups += 1; });
      res.json({
        ok: true,
        kind,
        total,
        needing,
        writeOps: needing,
        dupGroups,
        dupSamples,
        note: 'The backfill adds tokens, paths, hash and the normalised subject/topic keys to every question that is missing them. It writes nothing until you confirm. Duplicate groups share the same hash; review them before publishing.',
      });
    } catch (error: any) {
      console.error('[tos/questionbank/backfill-preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to preview the backfill.' });
    }
  });

  // Backfill run: confirm:"BACKFILL". Processes one bounded chunk per call so
  // a large bank cannot hit the function time limit; the console keeps
  // pressing until done:true. nextCursor is the scan position, so the next
  // call resumes where this one stopped instead of rescanning from the top.
  app.post('/api/tos/questionbank/backfill', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (req.body?.confirm !== 'BACKFILL') {
        throw httpError(400, 'Missing confirm. Call this route with confirm:"BACKFILL" from the console after reviewing the preview.');
      }
      const kind = parseKind(req.body?.kind);
      const maxDocs = clampInt(req.body?.maxDocs, BACKFILL_MAX_DOCS, 1, BACKFILL_MAX_DOCS);
      const PAGE = 200;
      const collected: QueryDocumentSnapshot[] = [];
      let cursorId: string | null = req.body?.cursor ? String(req.body.cursor) : null;
      let reachedEnd = false;
      for (let page = 0; page < QB_SCAN_PAGES_MAX; page += 1) {
        let q = adminDb.collection(QB_QUESTIONS).orderBy('__name__').limit(PAGE) as Query;
        if (cursorId) q = q.startAfter(adminDb.collection(QB_QUESTIONS).doc(cursorId));
        const snap = await q.get();
        if (snap.empty) { reachedEnd = true; break; }
        for (const s of snap.docs) {
          const d = s.data() as any;
          if (String(d.kind || 'practice') !== kind) continue;
          const missing = !d.subjectKey || !d.topicKey || !Array.isArray(d.tokens) || d.tokens.length === 0
            || !Array.isArray(d.paths) || d.paths.length === 0 || !d.hash;
          if (missing) collected.push(s);
          if (collected.length >= maxDocs) break;
        }
        cursorId = snap.docs[snap.docs.length - 1].id;
        if (collected.length >= maxDocs) break;
        if (snap.size < PAGE) { reachedEnd = true; break; }
      }
      const batch = adminDb.batch();
      collected.forEach((s) => batch.update(s.ref, enrichFields(s.data() as any)));
      await batch.commit();
      const done = reachedEnd && collected.length < maxDocs;
      if (done) await markSetup(kind, 'backfilled', true);
      await auditSafe(caller, 'QB_BACKFILL', { kind, updated: collected.length, done });
      res.json({ ok: true, updated: collected.length, nextCursor: done ? null : cursorId, done });
    } catch (error: any) {
      console.error('[tos/questionbank/backfill] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Backfill failed.' });
    }
  });

  // Recount preview: rebuild the whole tree in memory and diff it against
  // the stored counters. Read-only.
  app.get('/api/tos/questionbank/recount-preview', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      const [computed, total] = await buildCounters(kind);
      const stored = await readSummary(kind);
      const diffs: string[] = [];
      if (!stored) diffs.push('No counter documents exist yet; the recount creates them.');
      else {
        if ((Number(stored.total) || 0) !== computed.total) diffs.push(`total: stored ${Number(stored.total) || 0} vs actual ${computed.total}`);
        for (const st of ['draft', 'published', 'removed']) {
          if ((Number(stored.byStatus?.[st]) || 0) !== computed.byStatus[st]) {
            diffs.push(`${st}: stored ${Number(stored.byStatus?.[st]) || 0} vs actual ${computed.byStatus[st]}`);
          }
        }
        if ((Number(stored.changed) || 0) !== computed.changed) diffs.push(`changed: stored ${Number(stored.changed) || 0} vs actual ${computed.changed}`);
        const storedKeys = Object.keys(stored.subjects || {});
        if (storedKeys.length !== computed.subjects.length) diffs.push(`subjects: stored ${storedKeys.length} vs actual ${computed.subjects.length}`);
      }
      res.json({
        ok: true,
        kind,
        total,
        computed,
        diffs,
        writeOps: computed.subjects.length + 1,
        note: 'The recount rebuilds the summary and one counter document per subject from the questions themselves. It writes nothing until you confirm. This also builds the counters the first time.',
      });
    } catch (error: any) {
      console.error('[tos/questionbank/recount-preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to preview the recount.' });
    }
  });

  // Recount run: confirm:"RECOUNT". Writes the summary plus one document per
  // subject in batches, then marks the stream as set up.
  app.post('/api/tos/questionbank/recount', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (req.body?.confirm !== 'RECOUNT') {
        throw httpError(400, 'Missing confirm. Call this route with confirm:"RECOUNT" from the console after reviewing the preview.');
      }
      const kind = parseKind(req.body?.kind);
      const [computed] = await buildCounters(kind);
      let batch = adminDb.batch();
      let ops = 0;
      const flush = async () => { await batch.commit(); batch = adminDb.batch(); ops = 0; };
      const summaryRef = adminDb.collection(QB_COUNTS).doc(kind);
      batch.set(summaryRef, {
        kind,
        total: computed.total,
        byStatus: computed.byStatus,
        changed: computed.changed,
        byExamType: computed.byExamType,
        subjects: Object.fromEntries(computed.subjects.map((s) => [s.key, { total: s.total, label: s.label }])),
        setup: { backfilled: true, recounted: true, updatedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      });
      ops += 1;
      for (const s of computed.subjects) {
        if (ops >= 400) await flush();
        const ref = adminDb.collection(QB_COUNTS).doc(`${kind}__s__${s.key}`);
        const byTopic: Record<string, any> = {};
        for (const t of s.topics) byTopic[t.key] = { label: t.label, total: t.total, byYear: t.byYear };
        batch.set(ref, {
          kind, subjectKey: s.key, label: s.label, total: s.total,
          byStatus: s.byStatus, byExamType: s.byExamType,
          byTopic, byYear: s.byYear, updatedAt: new Date().toISOString(),
        });
        ops += 1;
      }
      await batch.commit();
      await auditSafe(caller, 'QB_RECOUNT', { kind, subjects: computed.subjects.length, total: computed.total });
      res.json({ ok: true, total: computed.total, subjects: computed.subjects.length });
    } catch (error: any) {
      console.error('[tos/questionbank/recount] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Recount failed.' });
    }
  });

  // -------------------------------------------------------------------
  // Bulk actions (Prompt L4). Every action is capped at 200 documents per
  // call and every batch stays at or under 400 writes. Each action totals
  // its whole counter change in memory and writes each counter document
  // once, in the same atomic batch as the question writes.
  // -------------------------------------------------------------------
  const BULK_CAP = 200;

  // Remove a selection made on the Library screen. Drafts are deleted
  // outright; published questions are soft-removed. The screen shows the
  // exact selection and an explicit confirm before calling this.
  app.post('/api/tos/questionbank/bulk-remove', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (req.body?.confirm !== 'BULK-REMOVE') {
        throw httpError(400, 'Missing confirm. Call this route with confirm:"BULK-REMOVE" from the Library screen after reviewing the selection.');
      }
      const kind = parseKind(req.body?.kind);
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
      if (ids.length === 0) throw httpError(400, 'No questions selected.');
      if (ids.length > BULK_CAP) throw httpError(400, `Too many selected (${ids.length}). The cap is ${BULK_CAP} per bulk action.`);
      const uniq = Array.from(new Set(ids));
      const docs = await Promise.all(uniq.map((id) => adminDb.collection(QB_QUESTIONS).doc(id).get()));
      const batch = adminDb.batch();
      const acc = createCounterAcc();
      let soft = 0;
      let hard = 0;
      let skipped = 0;
      const now = new Date().toISOString();
      docs.forEach((doc) => {
        if (!doc.exists) { skipped += 1; return; }
        const d = doc.data() as any;
        if (String(d.kind || 'practice') !== kind) throw httpError(409, `Question ${doc.id} belongs to a different stream. Refresh the list and try again.`);
        if (String(d.status || '') === 'removed') { skipped += 1; return; }
        if (String(d.status || '') === 'draft') {
          batch.delete(doc.ref);
          acc.change(d, null);
          hard += 1;
        } else {
          batch.update(doc.ref, { status: 'removed', removedAt: now, removedByUid: caller.uid, updatedAt: now });
          acc.change(d, { ...d, status: 'removed', removedAt: now, removedByUid: caller.uid, updatedAt: now });
          soft += 1;
        }
      });
      acc.flush(batch, kind);
      await batch.commit();
      await auditSafe(caller, 'QB_BULK_REMOVE', { kind, soft, hard, skipped });
      res.json({ ok: true, softRemoved: soft, hardDeleted: hard, skipped });
    } catch (error: any) {
      console.error('[tos/questionbank/bulk-remove] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Bulk remove failed.' });
    }
  });

  // Empty the removed bin: permanently delete every soft-removed question in
  // this stream. Preview is one aggregated count plus a few samples; the run
  // is typed-confirm gated and processes 200 per call until done.
  app.get('/api/tos/questionbank/empty-removed-preview', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      const base = adminDb.collection(QB_QUESTIONS).where('kind', '==', kind).where('status', '==', 'removed');
      const countSnap = await base.count().get();
      const total = countSnap.data().count || 0;
      const samples = await base.limit(5).get();
      res.json({
        ok: true,
        kind,
        total,
        samples: samples.docs.map((s) => String((s.data() as any).text || '').slice(0, 120)),
        note: 'Emptying permanently deletes these questions and their history. This cannot be undone. Type EMPTY REMOVED in the box to confirm.',
      });
    } catch (error: any) {
      console.error('[tos/questionbank/empty-removed-preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to preview.' });
    }
  });

  app.post('/api/tos/questionbank/empty-removed', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (String(req.body?.confirm || '').trim() !== 'EMPTY REMOVED') {
        throw httpError(400, 'Missing confirm. Type EMPTY REMOVED in the box on the Removed tab; the exact words are required.');
      }
      const kind = parseKind(req.body?.kind);
      const snap = await adminDb.collection(QB_QUESTIONS)
        .where('kind', '==', kind).where('status', '==', 'removed')
        .orderBy('__name__').limit(BULK_CAP).get();
      if (snap.empty) { res.json({ ok: true, deleted: 0, done: true }); return; }
      const batch = adminDb.batch();
      const acc = createCounterAcc();
      snap.docs.forEach((s) => {
        acc.change(s.data() as any, null);
        batch.delete(s.ref);
      });
      acc.flush(batch, kind);
      await batch.commit();
      const done = snap.size < BULK_CAP;
      await auditSafe(caller, 'QB_EMPTY_REMOVED', { kind, deleted: snap.size, done });
      res.json({ ok: true, deleted: snap.size, done });
    } catch (error: any) {
      console.error('[tos/questionbank/empty-removed] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Empty removed failed.' });
    }
  });

  // Topic rename / merge preview. Rename moves every question in one topic
  // branch to a new spelling; merge moves them into an existing branch and
  // keeps the target's spelling. Read-only until confirmed.
  app.get('/api/tos/questionbank/topic-preview', async (req, res) => {
    try {
      requireTos(req);
      const kind = parseKind(req.query.kind);
      const subjectKey = mapKey(req.query.subjectKey);
      const topicKey = mapKey(req.query.topicKey);
      const mode = String(req.query.mode || '');
      if (!['rename', 'merge'].includes(mode)) throw httpError(400, 'Mode must be rename or merge.');
      if (!subjectKey || !topicKey) throw httpError(400, 'Pick a subject and a topic first.');
      const toTopic = String(req.query.toTopic || '').trim();
      const intoTopicKey = mapKey(req.query.intoTopicKey || '');
      if (mode === 'rename' && !toTopic) throw httpError(400, 'Type the new topic name.');
      if (mode === 'rename' && toTopic.length > 160) throw httpError(400, 'Topic is too long (max 160 characters).');
      if (mode === 'merge' && !intoTopicKey) throw httpError(400, 'Pick the topic to merge into.');
      if (mode === 'merge' && intoTopicKey === topicKey) throw httpError(400, 'Pick a different topic to merge into.');

      const subjectDoc = await adminDb.collection(QB_COUNTS).doc(`${kind}__s__${subjectKey}`).get();
      const sd = (subjectDoc.exists ? subjectDoc.data() : {}) as any;
      const sourceLabel = String(sd.byTopic?.[topicKey]?.label || topicKey);
      const sourceCount = Number(sd.byTopic?.[topicKey]?.total) || 0;
      const existingTopics = Object.keys(sd.byTopic || {});

      if (mode === 'rename') {
        const newKey = mapKey(toTopic);
        if (newKey !== topicKey && existingTopics.includes(newKey)) {
          throw httpError(409, `"${toTopic}" already exists in this subject (as ${newKey}). Use Merge instead so the counts stay honest.`);
        }
        res.json({
          ok: true, kind, mode, subjectKey, topicKey,
          sourceLabel, sourceCount, newKey, newLabel: toTopic,
          writeOps: sourceCount,
          note: `Rename moves all ${sourceCount} questions from "${sourceLabel}" to "${toTopic}" and updates the counts. Nothing is written until you confirm.`,
        });
        return;
      }
      const targetLabel = String(sd.byTopic?.[intoTopicKey]?.label || intoTopicKey);
      const targetCount = Number(sd.byTopic?.[intoTopicKey]?.total) || 0;
      res.json({
        ok: true, kind, mode, subjectKey, topicKey,
        sourceLabel, sourceCount, intoTopicKey, targetLabel, targetCount,
        writeOps: sourceCount,
        note: `Merge moves all ${sourceCount} questions from "${sourceLabel}" into "${targetLabel}" (${targetCount} already there) and updates the counts. Nothing is written until you confirm.`,
      });
    } catch (error: any) {
      console.error('[tos/questionbank/topic-preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to preview the topic change.' });
    }
  });

  // Topic rename / merge run. Each call rewrites at most 200 questions of
  // the branch; the screen keeps pressing until done:true. The counters move
  // with every question, inside the same batch.
  app.post('/api/tos/questionbank/topic-change', async (req, res) => {
    try {
      const caller = requireTos(req);
      const confirm = String(req.body?.confirm || '');
      if (!['TOPIC-RENAME', 'TOPIC-MERGE'].includes(confirm)) {
        throw httpError(400, 'Missing confirm. Call with confirm:"TOPIC-RENAME" or "TOPIC-MERGE" from the Library screen after the preview.');
      }
      const kind = parseKind(req.body?.kind);
      const subjectKey = mapKey(req.body?.subjectKey);
      const topicKey = mapKey(req.body?.topicKey);
      const mode = String(req.body?.mode || '');
      if (!subjectKey || !topicKey) throw httpError(400, 'Pick a subject and a topic first.');
      let nextTopic = '';
      let nextKey = '';
      if (mode === 'rename' && confirm === 'TOPIC-RENAME') {
        nextTopic = String(req.body?.toTopic || '').trim();
        nextKey = mapKey(nextTopic);
        if (!nextTopic) throw httpError(400, 'Type the new topic name.');
        if (nextTopic.length > 160) throw httpError(400, 'Topic is too long (max 160 characters).');
      } else if (mode === 'merge' && confirm === 'TOPIC-MERGE') {
        nextKey = mapKey(req.body?.intoTopicKey || '');
        const subjectDoc = await adminDb.collection(QB_COUNTS).doc(`${kind}__s__${subjectKey}`).get();
        nextTopic = String(((subjectDoc.data() || {}) as any).byTopic?.[nextKey]?.label || '');
        if (!nextKey || !nextTopic) throw httpError(400, 'Pick the topic to merge into.');
      } else {
        throw httpError(400, 'Mode does not match the confirm string.');
      }

      const snap = await adminDb.collection(QB_QUESTIONS)
        .where('kind', '==', kind)
        .where('subjectKey', '==', subjectKey)
        .where('topicKey', '==', topicKey)
        .orderBy('__name__').limit(BULK_CAP).get();
      if (snap.empty) { res.json({ ok: true, updated: 0, done: true }); return; }
      const batch = adminDb.batch();
      const acc = createCounterAcc();
      const now = new Date().toISOString();
      snap.docs.forEach((s) => {
        const d = s.data() as any;
        const nextPaths = (Array.isArray(d.paths) ? d.paths : [])
          .filter((pv: string) => pv !== `t:${topicKey}`)
          .concat([`t:${nextKey}`]);
        const next = { ...d, topic: nextTopic, topicKey: nextKey, paths: nextPaths, updatedAt: now, editedByUid: caller.uid };
        batch.update(s.ref, {
          topic: nextTopic, topicKey: nextKey, paths: nextPaths,
          updatedAt: now, editedByUid: caller.uid,
        });
        acc.change(d, next);
      });
      acc.flush(batch, kind);
      await batch.commit();
      const done = snap.size < BULK_CAP;
      await auditSafe(caller, confirm === 'TOPIC-RENAME' ? 'QB_TOPIC_RENAMED' : 'QB_TOPIC_MERGED', { kind, subjectKey, from: topicKey, to: nextKey, updated: snap.size, done });
      res.json({ ok: true, updated: snap.size, done });
    } catch (error: any) {
      console.error('[tos/questionbank/topic-change] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Topic change failed.' });
    }
  });


  // ---- Imports register + undo (Prompt L5) ---------------------------------
  // One page of import batches, newest first, 20 per page. No kind filter on
  // purpose: the list stays a plain single-field query that needs no custom
  // index; rows carry their own stream.
  app.get('/api/tos/questionbank/imports', async (req, res) => {
    try {
      requireTos(req);
      let q = adminDb.collection(QB_IMPORTS).orderBy('importedAt', 'desc');
      const cursorRaw = String(req.query.cursor || '').trim();
      if (cursorRaw) {
        const cur = await adminDb.collection(QB_IMPORTS).doc(cursorRaw).get();
        if (cur.exists) q = q.startAfter(cur);
      }
      const snap = await q.limit(21).get();
      const docs = snap.docs.slice(0, 20);
      const rows = docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id, batchId: String(x.batchId || d.id), kind: x.kind || 'practice',
          examType: x.examType, subject: x.subject, topic: x.topic, year: x.year,
          difficulty: x.difficulty, count: x.count, importedAt: x.importedAt,
          importedByEmail: x.importedByEmail || '', status: String(x.status || 'active'),
          undoneAt: x.undoneAt || null,
        };
      });
      res.json({ ok: true, items: rows, nextCursor: snap.docs.length > 20 ? rows[rows.length - 1].id : null, hasMore: snap.docs.length > 20 });
    } catch (error: any) {
      console.error('[tos/questionbank/imports] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to list imports.' });
    }
  });

  // Undo preview: what an undo would delete, leave live, or leave removed.
  // Three aggregated counts, no document reads beyond the batch record.
  app.get('/api/tos/questionbank/undo-batch-preview', async (req, res) => {
    try {
      requireTos(req);
      const batchId = String(req.query.batchId || '').trim();
      if (!batchId) throw httpError(400, 'No batch chosen.');
      const reg = await adminDb.collection(QB_IMPORTS).doc(batchId).get();
      if (!reg.exists) throw httpError(404, 'That import batch is not on record.');
      const b = reg.data() as any;
      const base = adminDb.collection(QB_QUESTIONS).where('batchId', '==', batchId);
      const [totalSnap, draftSnap, removedSnap] = await Promise.all([
        base.count().get(),
        base.where('status', '==', 'draft').count().get(),
        base.where('status', '==', 'removed').count().get(),
      ]);
      const total = totalSnap.data().count || 0;
      const drafts = draftSnap.data().count || 0;
      const removed = removedSnap.data().count || 0;
      const published = Math.max(0, total - drafts - removed);
      const alreadyUndone = String(b.status || '') === 'undone';
      res.json({
        ok: true,
        batch: {
          batchId, kind: b.kind || 'practice', examType: b.examType, subject: b.subject,
          topic: b.topic, year: b.year, difficulty: b.difficulty, count: b.count,
          importedAt: b.importedAt, importedByEmail: b.importedByEmail || '',
        },
        drafts, published, removed, total, alreadyUndone,
        note: alreadyUndone
          ? 'This batch was already undone. Its drafts are gone; there is nothing left to undo.'
          : `Undo deletes the ${drafts} draft question${drafts === 1 ? '' : 's'} this import added. The ${published} that were already published stay live (their copies are on the CDN), and ${removed} already removed stay removed. The counters move with every deletion.`,
      });
    } catch (error: any) {
      console.error('[tos/questionbank/undo-batch-preview] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Failed to preview the undo.' });
    }
  });

  // Undo run: deletes up to 200 of the batch's remaining drafts per call and
  // marks the batch undone on the last round. Counters move in the same batch.
  app.post('/api/tos/questionbank/undo-batch', async (req, res) => {
    try {
      const caller = requireTos(req);
      if (req.body?.confirm !== 'UNDO-IMPORT') {
        throw httpError(400, 'Missing confirm. Call with confirm:"UNDO-IMPORT" from the Imports tab after the preview.');
      }
      const batchId = String(req.body?.batchId || '').trim();
      if (!batchId) throw httpError(400, 'No batch chosen.');
      const reg = await adminDb.collection(QB_IMPORTS).doc(batchId).get();
      if (!reg.exists) throw httpError(404, 'That import batch is not on record.');
      const b = reg.data() as any;
      if (String(b.status || '') === 'undone') {
        res.json({ ok: true, deleted: 0, done: true, alreadyUndone: true });
        return;
      }
      const snap = await adminDb.collection(QB_QUESTIONS)
        .where('batchId', '==', batchId).where('status', '==', 'draft')
        .orderBy('__name__').limit(200).get();
      if (snap.empty) {
        await adminDb.collection(QB_IMPORTS).doc(batchId).update({
          status: 'undone', undoneAt: new Date().toISOString(), undoneByUid: caller.uid,
        });
        await auditSafe(caller, 'QB_IMPORT_UNDONE', { batchId, deleted: 0, done: true });
        res.json({ ok: true, deleted: 0, done: true });
        return;
      }
      const batch = adminDb.batch();
      const acc = createCounterAcc();
      snap.docs.forEach((s) => {
        acc.change(s.data() as any, null);
        batch.delete(s.ref);
      });
      acc.flush(batch, (String(b.kind || 'practice') as 'practice' | 'mock'));
      await batch.commit();
      const done = snap.size < 200;
      if (done) {
        await adminDb.collection(QB_IMPORTS).doc(batchId).update({
          status: 'undone', undoneAt: new Date().toISOString(), undoneByUid: caller.uid,
        });
        await auditSafe(caller, 'QB_IMPORT_UNDONE', { batchId, deleted: snap.size, done });
      }
      res.json({ ok: true, deleted: snap.size, done });
    } catch (error: any) {
      console.error('[tos/questionbank/undo-batch] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Undo failed.' });
    }
  });

}

function orderByValues(sort: string, forceUpdated: boolean, doc: QueryDocumentSnapshot | null): unknown[] {
  if (!doc) return [];
  const d = doc.data() as any;
  if (forceUpdated || sort === 'updated') return [String(d.updatedAt || '')];
  if (sort === 'year') return [Number(d.year) || 0];
  return [String(d.subject || ''), String(d.updatedAt || '')];
}

function auditSafe(caller: Caller, action: string, after: Record<string, unknown>) {
  return adminDb.collection('auditLogs').add({
    actorUid: caller.uid, action, after, at: new Date().toISOString(),
  }).catch((err) => console.error('[questionBank] audit write failed:', err?.message || err));
}

async function buildCounters(kind: Kind) {
  const byStatus: Record<string, number> = { draft: 0, published: 0, removed: 0 };
  const byExamType: Record<string, number> = {};
  const subjects = new Map<string, {
    key: string; label: string; total: number; byStatus: Record<string, number>;
    byExamType: Record<string, number>; byYear: Record<string, number>;
    topics: Map<string, { key: string; label: string; total: number; byYear: Record<string, number> }>;
  }>();
  let total = 0;
  let changed = 0;
  const meta = await readKindMeta(kind);
  const publishedAt = meta.currentPublishedAt;
  const count = await scanKind(kind, (docs) => {
    for (const s of docs) {
      const d = s.data() as any;
      const status = String(d.status || 'draft');
      const active = status !== 'removed';
      const sKey = mapKey(d.subject);
      if (!sKey) continue;
      if (active) total += 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
      const examType = String(d.examType || 'jamb');
      if (active) byExamType[examType] = (byExamType[examType] || 0) + 1;
      if (publishedAt && String(d.updatedAt || '') > publishedAt) changed += 1;
      const entry = subjects.get(sKey) || {
        key: sKey, label: String(d.subject || ''), total: 0,
        byStatus: { draft: 0, published: 0, removed: 0 },
        byExamType: {}, byYear: {}, topics: new Map(),
      };
      entry.label = String(d.subject || '');
      if (active) entry.total += 1;
      entry.byStatus[status] = (entry.byStatus[status] || 0) + 1;
      if (active) entry.byExamType[examType] = (entry.byExamType[examType] || 0) + 1;
      const tKey = mapKey(d.topic);
      if (tKey && active) {
        const t = entry.topics.get(tKey) || { key: tKey, label: String(d.topic || ''), total: 0, byYear: {} as Record<string, number> };
        t.label = String(d.topic || '');
        t.total += 1;
        const y = d.year == null || d.year === '' ? null : Number(d.year) || null;
        if (y != null) { t.byYear[y] = (t.byYear[y] || 0) + 1; entry.byYear[y] = (entry.byYear[y] || 0) + 1; }
        entry.topics.set(tKey, t);
      }
      subjects.set(sKey, entry);
    }
  });
  return [{
    total,
    byStatus,
    changed,
    byExamType,
    subjects: Array.from(subjects.values()).map((e) => ({ ...e, topics: Array.from(e.topics.values()) })),
  }, count] as const;
}

type Kind = 'practice' | 'mock';
