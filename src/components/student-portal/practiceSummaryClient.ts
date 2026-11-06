// Practice summary client (Prompt P5a). One POST when a session finishes, one
// GET when the Analytics tab opens. Fire-and-forget: the results screen never
// waits for it. An unsent summary queues in localStorage and flushes the next
// time Practice or Analytics opens, then clears. The server ignores a repeat
// sessionId, so retries can never double-count.

export interface PracticeTopicSplit {
  subject: string;
  topic: string;
  answered: number;
  correct: number;
}

export interface PracticeSummaryPayload {
  sessionId: string;
  centreId: string;
  examType: string;
  subject: string;
  topic: string;
  mode: 'instant' | 'end';
  answered: number;
  correct: number;
  at: number;
  day: string;
  topics: PracticeTopicSplit[];
}

export interface SummaryQuestionInput {
  id: string;
  subject: string;
  topic: string;
  correct: string;
}

const PENDING_KEY = 'TOS_practice_pending_summaries';
// Set by Analytics "Practise this" (P5b), read once by Practice (P4 flow).
export const PRACTISE_NOW_KEY = 'TOS_practice_practise_now';
const MAX_PENDING = 20;

function loadPending(): PracticeSummaryPayload[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as PracticeSummaryPayload[]) : [];
  } catch { return []; }
}

function savePending(list: PracticeSummaryPayload[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING))); } catch { /* ignore */ }
}

/** The student's own day (YYYY-MM-DD), for the streak and weekly strip. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* ignore */ }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build the summary from the questions actually answered. Skipped questions
 * (no option chosen) never count. For a mixed session every answered question
 * is attributed to its own subject and topic. */
export function buildSummaryPayload(args: {
  centreId: string;
  examType: string;
  subject: string;
  topic: string;
  mode: 'instant' | 'end';
  questions: SummaryQuestionInput[];
  answers: Record<string, string>;
}): PracticeSummaryPayload | null {
  const centreId = String(args.centreId || '').trim();
  if (!centreId) return null;
  let answered = 0;
  let correct = 0;
  const perTopic = new Map<string, PracticeTopicSplit>();
  for (const q of args.questions || []) {
    const given = args.answers?.[q.id];
    if (!given) continue;
    const ok = given === q.correct;
    answered += 1;
    if (ok) correct += 1;
    const sName = args.subject === 'all' ? (q.subject || 'Unknown subject') : args.subject;
    const tName = args.topic === 'all' ? (q.topic || 'All topics') : args.topic;
    const key = `${sName}||${tName}`;
    const e = perTopic.get(key) || { subject: sName, topic: tName, answered: 0, correct: 0 };
    e.answered += 1;
    if (ok) e.correct += 1;
    perTopic.set(key, e);
  }
  return {
    sessionId: newSessionId(),
    centreId,
    examType: args.examType || 'jamb',
    subject: args.subject === 'all' ? 'All subjects' : args.subject,
    topic: args.topic === 'all' ? 'All topics' : args.topic,
    mode: args.mode === 'end' ? 'end' : 'instant',
    answered,
    correct,
    at: Date.now(),
    day: localDay(),
    topics: [...perTopic.values()],
  };
}

export type SummarySendResult = 'sent' | 'offline' | 'rejected';

async function postSummary(payload: PracticeSummaryPayload, token: string): Promise<SummarySendResult> {
  try {
    const res = await fetch('/api/student/practice/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return res.ok ? 'sent' : 'rejected';
  } catch {
    return 'offline';
  }
}

export function queuePendingSummary(payload: PracticeSummaryPayload) {
  const list = loadPending();
  list.push(payload);
  savePending(list);
}

/** Tries every queued summary once. Offline ones stay queued; anything the
 * server rejected is dropped (this is private analytics, never practice). */
export async function flushPendingPracticeSummaries(getToken: () => Promise<string>): Promise<void> {
  const pending = loadPending();
  if (pending.length === 0) return;
  const keep: PracticeSummaryPayload[] = [];
  for (const p of pending) {
    try {
      const token = await getToken();
      const r = await postSummary(p, token);
      if (r === 'offline') keep.push(p);
    } catch { keep.push(p); }
  }
  savePending(keep);
}

export async function sendPracticeSummary(payload: PracticeSummaryPayload, getToken: () => Promise<string>): Promise<void> {
  try {
    const token = await getToken();
    const r = await postSummary(payload, token);
    if (r === 'offline') queuePendingSummary(payload);
  } catch {
    queuePendingSummary(payload);
  }
}
