import express from 'express';
import { adminDb } from './firebaseAdmin';
import { Caller, httpError, requireMembership } from './tenantService';

// ============================================================================
// Practice Analytics storage (Prompt P5a)
// One document per student per centre: practiceStats/{uid}__{centreId}.
// Written and read ONLY through these admin-SDK routes, so a student can never
// touch another student's record and no Firestore rule changes are needed.
// The uid comes from the verified token; the centreId is verified against the
// caller's membership before it is used. Nothing here feeds Performance,
// assessments or any tutor-facing score: this is the student's private
// practice record.
// ============================================================================

const MAX_SESSION_ANSWERED = 200;
const MAX_RECENT = 20;
const MAX_TOPICS_PER_SUBJECT = 200;
const MAX_SPLIT_ENTRIES = 200;
const MAX_BODY_CHARS = 60_000;
const DAYS_WINDOW = 60;
const RATE_MAX_PER_HOUR = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function toCount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/** Field-path-safe key for subject/topic map fields. The display name always
 * travels in the entry's `name`, so normalising the key never loses it. */
function normKey(raw: string): string {
  // encodeURIComponent escapes everything except A-Za-z0-9-_.!~*'(); the
  // replaces below turn the survivors into safe stand-ins, so no '.', '/',
  // '[', ']', '~', '*', or whitespace can ever reach a field path.
  const key = encodeURIComponent(raw)
    .replace(/%/g, '_p')
    .replace(/\./g, '_d')
    .replace(/~/g, '_t')
    .replace(/\*/g, '_s')
    .replace(/!/g, '_x')
    .replace(/'/g, '_q')
    .replace(/\(/g, '_o')
    .replace(/\)/g, '_c');
  return (key || 'unknown').slice(0, 100);
}

/** Student-local day (YYYY-MM-DD) when the client supplies one, else UTC. */
function dayKey(day: unknown, at: number): string {
  const s = typeof day === 'string' ? day.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Sliding-window rate limit per uid+centre, same shape as the AI limiter. */
async function consumeSummaryRateLimit(key: string): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection('rateLimits').doc(`ps:${key}`);
    const doc = await tx.get(ref);
    const now = Date.now();
    let count = 1;
    let windowStart = now;
    if (doc.exists && now - ((doc.data() as any)?.windowStart || 0) <= RATE_WINDOW_MS) {
      count = ((doc.data() as any)?.count || 0) + 1;
      windowStart = (doc.data() as any).windowStart;
    }
    if (count > RATE_MAX_PER_HOUR) {
      const waitMinutes = Math.ceil((windowStart + RATE_WINDOW_MS - now) / 60000);
      throw httpError(429, `Too many updates. Please wait ${waitMinutes} minutes before trying again.`);
    }
    tx.set(
      ref,
      { count, windowStart, expiresAt: new Date(windowStart + 2 * RATE_WINDOW_MS) },
      { merge: true }
    );
  });
}

export function registerPracticeStatsRoutes(app: express.Express): void {
  // One write per finished session. Idempotent per sessionId: a repeat POST
  // is ignored, so offline retries can never double-count.
  app.post('/api/student/practice/summary', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.body?.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId);

      const body = req.body || {};
      if (JSON.stringify(body).length > MAX_BODY_CHARS) throw httpError(413, 'Summary payload too large.');

      const sessionId = cleanStr(body.sessionId, 64);
      if (sessionId.length < 8) throw httpError(400, 'sessionId is required.');
      const mode = body.mode === 'end' ? 'end' : 'instant';
      const examType = cleanStr(body.examType, 20) || 'jamb';
      const subject = cleanStr(body.subject, 80) || 'All subjects';
      const topic = cleanStr(body.topic, 80) || 'All topics';
      const answered = toCount(body.answered);
      const correct = toCount(body.correct);
      if (answered < 0 || correct < 0) throw httpError(400, 'answered and correct must be non-negative integers.');
      if (correct > answered) throw httpError(400, 'correct cannot exceed answered.');
      if (answered > MAX_SESSION_ANSWERED) throw httpError(400, `A session cannot have more than ${MAX_SESSION_ANSWERED} answered questions.`);
      const atRaw = toCount(body.at);
      const now = Date.now();
      const at = atRaw >= 0 && atRaw <= now + DAY_MS ? atRaw : now;
      const day = dayKey(body.day, at);

      // Per-topic split taken from the questions actually answered. Entries
      // that fail validation are dropped, not rejected wholesale.
      const splitRaw = Array.isArray(body.topics) ? body.topics : [];
      if (splitRaw.length > MAX_SPLIT_ENTRIES) {
        console.warn(`[practice-stats] split entries ${splitRaw.length} exceed ${MAX_SPLIT_ENTRIES}; extras ignored`);
      }
      const split = splitRaw
        .slice(0, MAX_SPLIT_ENTRIES)
        .map((e: any) => {
          const s = cleanStr(e?.subject, 80) || subject;
          const t = cleanStr(e?.topic, 80) || topic;
          const a = toCount(e?.answered);
          const c = toCount(e?.correct);
          if (a <= 0 || c < 0 || c > a) return null;
          return { subject: s, topic: t, answered: a, correct: c };
        })
        .filter(Boolean) as { subject: string; topic: string; answered: number; correct: number }[];

      try {
        await consumeSummaryRateLimit(`${caller.uid}__${centreId}`);
      } catch (err: any) {
        if (err?.status === 429) throw err;
        // A limiter outage must never block a practice summary write.
      }

      const docRef = adminDb.collection('practiceStats').doc(`${caller.uid}__${centreId}`);
      let saved = false;
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = (snap.exists ? snap.data() : {}) as any;

        const recent: any[] = Array.isArray(data?.recent) ? [...data.recent] : [];
        if (recent.some((r) => r && r.sessionId === sessionId)) return; // repeat: ignored

        const totals = {
          answered: (Number(data?.totals?.answered) || 0) + answered,
          correct: (Number(data?.totals?.correct) || 0) + correct,
          sessions: (Number(data?.totals?.sessions) || 0) + 1,
        };

        const days: Record<string, boolean> = {};
        const prevDays = data?.days && typeof data.days === 'object' ? data.days : {};
        Object.keys(prevDays).forEach((k) => { if (k) days[k] = true; });
        days[day] = true;
        const cutoff = new Date(at - (DAYS_WINDOW - 1) * DAY_MS).toISOString().slice(0, 10);
        Object.keys(days).forEach((k) => { if (k < cutoff) delete days[k]; });

        const subjects = data?.subjects && typeof data.subjects === 'object' ? { ...data.subjects } : {};
        const applySplit = (sName: string, tName: string, a: number, c: number) => {
          const sk = normKey(sName);
          const tk = normKey(tName);
          const subj = subjects[sk] && typeof subjects[sk] === 'object' ? { ...subjects[sk] } : { name: sName, answered: 0, correct: 0, topics: {} as Record<string, any> };
          subj.name = sName;
          subj.answered = (Number(subj.answered) || 0) + a;
          subj.correct = (Number(subj.correct) || 0) + c;
          const topics = subj.topics && typeof subj.topics === 'object' ? { ...subj.topics } : {};
          const existing = topics[tk];
          if (!existing && Object.keys(topics).length >= MAX_TOPICS_PER_SUBJECT) {
            console.warn(`[practice-stats] topic cap reached for subject ${sk}; ignoring new topic`);
          } else {
            const t = existing && typeof existing === 'object' ? { ...existing } : { name: tName, answered: 0, correct: 0, lastAt: 0 };
            t.name = tName;
            t.answered = (Number(t.answered) || 0) + a;
            t.correct = (Number(t.correct) || 0) + c;
            t.lastAt = at;
            topics[tk] = t;
            subj.topics = topics;
          }
          subjects[sk] = subj;
        };
        if (split.length > 0) {
          split.forEach((e) => applySplit(e.subject, e.topic, e.answered, e.correct));
        } else if (answered > 0) {
          applySplit(subject, topic, answered, correct);
        }

        // CH1: per-day totals so the chat access gate can sum the last 7
        // days from this one document instead of counting sessions. Written
        // in this same transaction, so there are no extra writes, and pruned
        // on the same 60-day window as `days`.
        const daily: Record<string, { answered: number; correct: number }> = {};
        const prevDaily = data?.daily && typeof data.daily === 'object' ? data.daily : {};
        Object.keys(prevDaily).forEach((k) => {
          const e = prevDaily[k];
          if (k && e && typeof e === 'object') {
            daily[k] = { answered: Number(e.answered) || 0, correct: Number(e.correct) || 0 };
          }
        });
        const prevDayTotals = daily[day] || { answered: 0, correct: 0 };
        daily[day] = { answered: prevDayTotals.answered + answered, correct: prevDayTotals.correct + correct };
        Object.keys(daily).forEach((k) => { if (k < cutoff) delete daily[k]; });

        recent.unshift({ at, sessionId, subject, topic, examType, mode, answered, correct });
        while (recent.length > MAX_RECENT) recent.pop();

        tx.set(docRef, {
          uid: caller.uid,
          centreId,
          updatedAt: new Date().toISOString(),
          totals,
          days,
          daily,
          subjects,
          recent,
        });
        saved = true;
      });
      res.json({ ok: true, saved });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[practice-stats] summary POST failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save your practice summary.' });
    }
  });

  // One read when the Analytics tab opens. Returns the student's own record
  // only; any other centre's id fails the membership check.
  app.get('/api/student/practice/summary', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.query.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId);
      const snap = await adminDb.collection('practiceStats').doc(`${caller.uid}__${centreId}`).get();
      if (!snap.exists) return res.json({ ok: true, found: false, summary: null });
      const d = snap.data() as any;
      return res.json({
        ok: true,
        found: true,
        summary: {
          updatedAt: typeof d?.updatedAt === 'string' ? d.updatedAt : null,
          totals: d?.totals && typeof d.totals === 'object' ? d.totals : { answered: 0, correct: 0, sessions: 0 },
          days: d?.days && typeof d.days === 'object' ? d.days : {},
          subjects: d?.subjects && typeof d.subjects === 'object' ? d.subjects : {},
          recent: Array.isArray(d?.recent) ? d.recent : [],
        },
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[practice-stats] summary GET failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load your practice summary.' });
    }
  });
}
