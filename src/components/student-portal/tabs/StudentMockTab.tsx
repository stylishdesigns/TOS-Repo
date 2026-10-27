import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Clock, Flag, Play, Trophy, History as HistoryIcon,
  CheckCircle2, XCircle, LayoutGrid, Check, AlertTriangle, Hourglass,
  CalendarX2, X, Send, Medal,
} from 'lucide-react';
import { api } from '../../tos/tosShared';
import { MathText, cleanOptionText } from '../../common/MathText';

/**
 * TOS student mock screens (prompt S, pieces S3-S5). Three tabs wired to the
 * server-side mock routes: Today (status + start + the exam itself), Past
 * (only mocks the student took) and Leaderboard (one board across all
 * centres, usernames and scores only). Every rule the server enforces shows
 * up here as a state the student can see; the phone never decides anything
 * the server has not already told it.
 */

type Json = any;

const LS_KEY = (mockId: string) => `tos_mock_answers_${mockId}`;

/** Deterministic shuffle so a resumed attempt shows the same question order. */
function seededOrder(count: number, seed: number): number[] {
  let s = Number(seed) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const fmtDay = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const fmtClock = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }) : '');

const mmss = (msLeft: number) => {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------------------------------------------------------------------------
// Username gate: the leaderboard shows names, so every student picks a board
// name before their first mock. 4-16 letters, numbers or underscores; the
// server owns every rule, the phone only shows its answers.
// ---------------------------------------------------------------------------
const UsernameGate: React.FC<{ onClaimed: () => void }> = ({ onClaimed }) => {
  const [name, setName] = useState('');
  const [check, setCheck] = useState<Json>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 4) { setCheck(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const r = await api(`/api/student/mock/username/check?name=${encodeURIComponent(trimmed)}`);
        setCheck(r);
      } catch { setCheck(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [name]);

  const claim = async () => {
    setBusy(true); setError('');
    try {
      await api('/api/student/mock/username', { method: 'POST', body: { name: name.trim() } });
      onClaimed();
    } catch (e: any) { setError(e.message || 'Could not save that name.'); }
    finally { setBusy(false); }
  };

  const ok = check?.valid && check?.available;
  return (
    <div className="rounded-3xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Medal className="w-5 h-5 text-[#EA580C]" />
        <h3 className="text-base font-black text-slate-900">Pick your leaderboard name</h3>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">
        The leaderboard shows names, never real ones. Choose a name other students will see.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={16}
        placeholder="e.g. swift_lion"
        autoComplete="off"
        className="w-full min-h-[48px] px-4 rounded-2xl border-2 border-slate-200 focus:border-[#EA580C] outline-none text-base font-bold text-slate-900 placeholder:text-slate-300 placeholder:font-medium"
      />
      {name.trim().length >= 4 && check && (
        <p className={`text-sm font-bold ${check.valid && check.available ? 'text-emerald-600' : 'text-rose-600'}`}>
          {check.valid ? (check.available ? `${name.trim()} is available.` : `${check.reason || 'That name is taken.'}`) : (check.reason || 'Not a valid name.')}
        </p>
      )}
      {name.trim().length > 0 && name.trim().length < 4 && (
        <p className="text-sm text-slate-400 font-medium">At least 4 characters.</p>
      )}
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      <button
        onClick={claim}
        disabled={!ok || busy}
        className={`w-full min-h-[52px] rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${ok && !busy ? 'bg-[#EA580C] text-white active:scale-[0.99]' : 'bg-slate-100 text-slate-400'}`}
      >
        {busy ? 'Saving...' : 'Save this name'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The exam itself: full screen, one question at a time, server deadline on
// the clock. Answers save in batches (5 changes, 10 idle seconds or a
// subject switch) and mirror to the phone's own storage, so a dropped
// network never costs work.
// ---------------------------------------------------------------------------
const MockExam: React.FC<{
  data: Json;
  onDone: () => void;
  onExit: () => void;
}> = ({ data, onDone, onExit }) => {
  const { paper, attempt } = data;
  const skew = useRef(Date.parse(data.serverNow) - Date.now()).current;
  const order = useMemo(() => seededOrder(paper.questions.length, attempt.shuffleSeed), [paper.questions.length, attempt.shuffleSeed]);
  const [answers, setAnswers] = useState<Record<string, Json>>(() => ({ ...(attempt.savedAnswers || {}) }));
  const [idx, setIdx] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now() + skew);
  const [grid, setGrid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<Map<string, Json>>(new Map());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deadline = Date.parse(attempt.deadline);
  const remaining = deadline - nowMs;

  const q = paper.questions[order[idx]];
  const answeredCount = Object.values(answers).filter((a: Json) => a && a.choice).length;

  const mirror = useCallback((next: Record<string, Json>) => {
    try { localStorage.setItem(LS_KEY(paper.mockId), JSON.stringify({ answers: next, at: Date.now() + skew })); } catch { /* storage off */ }
  }, [paper.mockId, skew]);

  const flush = useCallback(async (force = false) => {
    if (submittedRef.current) return;
    const batch = Array.from(pendingRef.current.entries());
    if (batch.length === 0) { if (force) setSaving('saved'); return; }
    pendingRef.current = new Map();
    setSaving('saving');
    try {
      await api('/api/student/mock/save', {
        method: 'POST',
        body: { changes: batch.map(([qid, a]) => ({ qid, choice: a.choice || '', flag: Boolean(a.flag), ts: a.ts })) },
      });
      setSaving('saved');
    } catch {
      // Put the changes back so the next flush tries again; the phone copy
      // already has them.
      batch.forEach(([qid, a]) => pendingRef.current.set(qid, a));
      setSaving('offline');
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => { void flush(); }, 10_000);
  }, [flush]);

  const record = useCallback((qid: string, patch: Json) => {
    const prev = answersRef.current[qid] || { choice: '', flag: false, ts: 0 };
    const next = { ...prev, ...patch, ts: Date.now() + skew };
    const updated = { ...answersRef.current, [qid]: next };
    answersRef.current = updated;
    setAnswers(updated);
    pendingRef.current.set(qid, next);
    mirror(updated);
    if (pendingRef.current.size >= 5) void flush(); else scheduleFlush();
  }, [mirror, flush, scheduleFlush, skew]);

  // One-time merge: answers saved on this phone but never synced (offline).
  useEffect(() => {
    if (attempt.created !== false) return undefined;
    let local: Json = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY(paper.mockId)) || 'null'); } catch { local = null; }
    const server = attempt.savedAnswers || {};
    const changes: Json[] = [];
    if (local?.answers) {
      Object.entries(local.answers as Record<string, Json>).forEach(([qid, a]) => {
        const s = server[qid];
        if (a?.ts && (!s || Number(a.ts) > Number(s.ts || 0))) changes.push({ qid, choice: a.choice || '', flag: Boolean(a.flag), ts: a.ts });
      });
    }
    if (changes.length > 0) {
      pendingRef.current = new Map(changes.map((c) => [c.qid, c]));
      void flush();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clock: the server's time, not the phone's.
  useEffect(() => {
    timerRef.current = setInterval(() => setNowMs(Date.now() + skew), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [skew]);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    await flush(true);
    try {
      await api('/api/student/mock/submit', { method: 'POST', body: {} });
    } catch (e: any) {
      submittedRef.current = false;
      setSubmitting(false);
      setConfirming(false);
      window.alert(e.message || 'Could not submit. Try again.');
      return;
    }
    try { localStorage.removeItem(LS_KEY(paper.mockId)); } catch { /* storage off */ }
    onDone();
  }, [flush, onDone, paper.mockId]);

  // Time up: hand the submit to the server, which marks it auto-submitted.
  useEffect(() => {
    if (remaining <= 0 && !submitting && !submittedRef.current) void doSubmit();
  }, [remaining, submitting, doSubmit]);

  const pick = (letter: string) => record(q.id, { choice: answers[q.id]?.choice === letter ? '' : letter });
  const toggleFlag = () => record(q.id, { flag: !answers[q.id]?.flag });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header: back, timer, save state */}
      <div className="sticky top-0 z-20 bg-[#EA580C] text-white px-4 pt-3 pb-4 rounded-b-3xl">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center active:scale-95" aria-label="Leave the mock">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-lg ${remaining < 60_000 ? 'bg-rose-600' : 'bg-black/10'}`}>
            <Clock className="w-5 h-5" />
            {mmss(remaining)}
          </div>
          <div className="w-11 h-11 flex items-center justify-center" aria-hidden>
            {saving === 'saving' && <Clock className="w-5 h-5 text-white/70 animate-pulse" />}
            {saving === 'saved' && <Check className="w-5 h-5 text-emerald-300" />}
            {saving === 'offline' && <AlertTriangle className="w-5 h-5 text-amber-300" />}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[13px] font-bold text-white/90">Question {idx + 1} of {paper.questions.length}</p>
          <p className="text-[13px] font-bold text-white/90">{answeredCount} answered</p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${(answeredCount / Math.max(1, paper.questions.length)) * 100}%` }} />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 px-4 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="px-3 py-1.5 rounded-lg bg-orange-100 text-[#EA580C] text-xs font-black uppercase tracking-wide">{q.subject}</span>
          <button onClick={toggleFlag} className={`flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-black ${answers[q.id]?.flag ? 'bg-amber-100 text-amber-700' : 'text-slate-400'}`}>
            <Flag className="w-4 h-4" />
            {answers[q.id]?.flag ? 'Flagged' : 'Flag'}
          </button>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 p-5">
          <MathText text={q.text} className="text-[17px] font-black text-slate-900 leading-relaxed" />
        </div>
        <div className="space-y-3">
          {(q.options || []).map((opt: string, i: number) => {
            const letter = LETTERS[i];
            const chosen = answers[q.id]?.choice === letter;
            return (
              <button
                key={letter}
                onClick={() => pick(letter)}
                className={`w-full min-h-[56px] px-4 py-3 rounded-2xl border-2 text-left flex items-center gap-3 transition-all ${chosen ? 'border-[#EA580C] bg-orange-50' : 'border-slate-200 bg-white'}`}
              >
                <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-black text-sm ${chosen ? 'bg-[#EA580C] text-white' : 'bg-slate-100 text-slate-500'}`}>{letter}</span>
                <MathText text={cleanOptionText(opt)} className="flex-1 text-[15px] font-bold text-slate-900" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { void flush(); setIdx((v) => Math.max(0, v - 1)); }}
            disabled={idx === 0}
            className="min-h-[48px] px-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-sm disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button onClick={() => setGrid(true)} className="min-h-[48px] w-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center" aria-label="All questions">
            <LayoutGrid className="w-5 h-5" />
          </button>
          {idx < paper.questions.length - 1 ? (
            <button
              onClick={() => { void flush(); setIdx((v) => Math.min(paper.questions.length - 1, v + 1)); }}
              className="flex-1 min-h-[48px] rounded-2xl bg-[#EA580C] text-white font-black text-sm flex items-center justify-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setConfirming(true)} className="flex-1 min-h-[48px] rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2">
              <Send className="w-4 h-4" /> Submit
            </button>
          )}
        </div>
      </div>

      {/* Question grid */}
      {grid && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end" onClick={() => setGrid(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">All questions</h3>
              <button onClick={() => setGrid(false)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {paper.questions.map((_: Json, i: number) => {
                const qid = paper.questions[order[i]].id;
                const a = answers[qid];
                return (
                  <button
                    key={i}
                    onClick={() => { setIdx(i); setGrid(false); }}
                    className={`min-h-[44px] rounded-xl font-black text-sm ${i === idx ? 'bg-[#EA580C] text-white' : a?.choice ? 'bg-emerald-100 text-emerald-700' : a?.flag ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Submit confirm */}
      {confirming && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Submit your mock?</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              You answered {answeredCount} of {paper.questions.length}. Your score is marked immediately but stays hidden until results are released at 6:00 am tomorrow.
            </p>
            <button onClick={doSubmit} disabled={submitting} className="w-full min-h-[52px] rounded-2xl bg-emerald-600 text-white font-black text-sm uppercase tracking-widest">
              {submitting ? 'Submitting...' : 'Yes, submit now'}
            </button>
            <button onClick={() => setConfirming(false)} className="w-full min-h-[52px] rounded-2xl bg-slate-100 text-slate-600 font-black text-sm uppercase tracking-widest">
              No, keep working
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Result review: your attempt, question by question, with the why. Only
// exists after release; the server refuses earlier.
// ---------------------------------------------------------------------------
const ReviewScreen: React.FC<{ mockId: string; onBack: () => void }> = ({ mockId, onBack }) => {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api(`/api/student/mock/result?mockId=${encodeURIComponent(mockId)}`);
        if (alive) setData(r);
      } catch (e: any) { if (alive) setError(e.message || 'Could not load your result.'); }
    })();
    return () => { alive = false; };
  }, [mockId]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <button onClick={onBack} className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-4"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
        <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen bg-slate-50 p-4"><div className="h-32 rounded-3xl bg-slate-200/60 animate-pulse" /></div>;
  }

  const rows = data.review.filter((r: Json) => (filter === 'all' ? true : !r.isCorrect));
  const pct = data.score.scale === 100;
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-[#EA580C] text-white px-4 pt-3 pb-6 rounded-b-3xl">
        <button onClick={onBack} className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center mb-3" aria-label="Back"><ChevronLeft className="w-6 h-6" /></button>
        <p className="text-xs font-black uppercase tracking-widest text-white/80">{data.title} · {fmtDay(data.date)}</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-black leading-none">{data.score.scaled ?? data.score.correct}</span>
          <span className="text-lg font-bold text-white/80 mb-1">{pct ? '%' : `/ ${data.score.scale || '?'}`}</span>
        </div>
        <p className="mt-2 text-sm font-bold text-white/90">
          {data.score.correct} of {data.score.questionCount} correct · Rank {data.rank}
          {data.autoSubmitted ? ' · auto-submitted at time-up' : ''}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="flex p-1 rounded-xl bg-slate-200/60">
          <button onClick={() => setFilter('all')} className={`flex-1 min-h-[40px] rounded-lg text-sm font-black ${filter === 'all' ? 'bg-white text-[#EA580C] shadow-sm' : 'text-slate-500'}`}>All {data.review.length}</button>
          <button onClick={() => setFilter('wrong')} className={`flex-1 min-h-[40px] rounded-lg text-sm font-black ${filter === 'wrong' ? 'bg-white text-[#EA580C] shadow-sm' : 'text-slate-500'}`}>
            To learn {data.review.filter((r: Json) => !r.isCorrect).length}
          </button>
        </div>

        {rows.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-black text-slate-900">Nothing to fix here</p>
            <p className="text-sm text-slate-500 mt-1">Every question in this view was answered correctly.</p>
          </div>
        )}

        {rows.map((r: Json) => (
          <div key={r.id} className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">Question {r.n} of {data.review.length}</p>
              <span className={`px-3 py-1 rounded-full text-xs font-black ${r.isCorrect ? 'bg-emerald-100 text-emerald-700' : r.yourChoice ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                {r.isCorrect ? '✓ Correct' : r.yourChoice ? '✗ Wrong' : 'Not answered'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-orange-50 text-[#EA580C] text-[11px] font-black uppercase">{r.subject}</span>
              {r.topic && <span className="text-[11px] font-bold text-slate-400 uppercase">{r.topic}</span>}
              {r.flagged && <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1"><Flag className="w-3 h-3" /> flagged</span>}
            </div>
            <MathText text={r.text} className="text-[16px] font-black text-slate-900 leading-relaxed" />
            <div className="space-y-2">
              {(r.options || []).map((opt: string, i: number) => {
                const letter = LETTERS[i];
                const yours = r.yourChoice === letter;
                const right = r.correctChoice === letter;
                return (
                  <div
                    key={letter}
                    className={`min-h-[52px] px-4 py-3 rounded-2xl border-2 flex items-center gap-3 ${right ? 'border-emerald-300 bg-emerald-50' : yours ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                  >
                    <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm ${right ? 'bg-emerald-600 text-white' : yours ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{letter}</span>
                    <MathText text={cleanOptionText(opt)} className="flex-1 text-[15px] font-bold text-slate-900" />
                    {right && <span className="text-emerald-700 font-black text-sm">✓ Correct</span>}
                    {yours && !right && <span className="text-rose-700 font-black text-sm">Your answer</span>}
                  </div>
                );
              })}
            </div>
            {r.explanation && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[15px] text-slate-700 leading-relaxed"><span className="font-black text-slate-900">Why: </span>{r.explanation}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The tab itself.
// ---------------------------------------------------------------------------
export const StudentMockTab: React.FC<{
  initialTab?: 'today' | 'past' | 'board';
  onHideBottomNav?: (hide: boolean) => void;
  onExitToGeneral?: () => void;
}> = ({ initialTab, onHideBottomNav, onExitToGeneral }) => {
  const [tab, setTab] = useState<'today' | 'past' | 'board'>(initialTab || 'today');
  const [status, setStatus] = useState<Json | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [past, setPast] = useState<Json[] | null>(null);
  const [board, setBoard] = useState<Json | null>(null);
  const [boardDate, setBoardDate] = useState<string | null>(null);
  const [exam, setExam] = useState<Json | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const skewRef = useRef(0);

  const loadStatus = useCallback(async () => {
    setLoading(true); setStatusErr('');
    try {
      const r = await api('/api/student/mock/status');
      skewRef.current = Date.parse(r.serverNow) - Date.now();
      setStatus(r);
    } catch (e: any) { setStatusErr(e.message || 'Could not load your mock status.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    onHideBottomNav?.(Boolean(exam || reviewId));
    return () => onHideBottomNav?.(false);
  }, [exam, reviewId, onHideBottomNav]);

  const loadPast = useCallback(async () => {
    setPast(null);
    try { const r = await api('/api/student/mock/history'); setPast(r.rows || []); }
    catch { setPast([]); }
  }, []);

  const loadBoard = useCallback(async (date: string) => {
    setBoard(null);
    try { const r = await api(`/api/student/mock/leaderboard?date=${date}`); setBoard(r); }
    catch { setBoard({ ok: true, date, released: false, entries: [], me: null }); }
  }, []);

  useEffect(() => {
    if (tab === 'past' && past === null) loadPast();
    if (tab === 'board' && board === null && status?.today) loadBoard(boardDate || status.today);
  }, [tab, past, board, boardDate, status?.today, loadPast, loadBoard]);

  const start = async () => {
    setStarting(true); setNotice('');
    try {
      const r = await api('/api/student/mock/start', { method: 'POST', body: {} });
      // Start returns a short-lived paper link, not the paper. Fetch it at
      // once; on a slow phone the 10-minute link can expire, so starting
      // again (which mints a fresh link) and retrying once is built in.
      const fetchPaper = async (link: string) => (await api(link))?.paper || null;
      let meta: Json = r?.paper || null;
      let paper: Json = null;
      try {
        paper = await fetchPaper(String(meta?.url || ''));
      } catch {
        const r2 = await api('/api/student/mock/start', { method: 'POST', body: {} });
        meta = r2?.paper || null;
        paper = await fetchPaper(String(meta?.url || ''));
      }
      if (!paper) throw new Error('The paper did not load. Tap Start again.');
      setExam({ ...r, paper: { ...(meta || {}), ...paper } });
    } catch (e: any) { setNotice(e.message || 'Could not start the mock.'); }
    finally { setStarting(false); }
  };

  const examDone = () => { setExam(null); loadStatus(); };
  const examExit = () => {
    // Leaving mid-mock is safe: the server holds the attempt and the deadline
    // keeps running. Resume puts the student back exactly where they were.
    setExam(null); loadStatus();
  };

  const openReview = (mockId: string) => setReviewId(mockId);

  if (reviewId) return <ReviewScreen mockId={reviewId} onBack={() => { setReviewId(null); loadStatus(); if (tab === 'past') loadPast(); }} />;
  if (exam) return <MockExam data={exam} onDone={examDone} onExit={examExit} />;

  const today = status?.today || '';
  const unseen = status?.unseen || null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#EA580C] text-white px-4 pt-3 pb-4 rounded-b-3xl">
        <div className="flex items-center gap-2">
          <button onClick={onExitToGeneral} className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center" aria-label="Back to CBT">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-black tracking-tight">TOS Mock</h2>
        </div>
        <div className="mt-4 flex p-1 rounded-xl bg-black/10 border border-white/10">
          {([['today', 'Today'], ['past', 'Past'], ['board', 'Leaderboard']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-black ${tab === key ? 'bg-white text-[#EA580C] shadow-sm' : 'text-white/80'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading && <div className="h-40 rounded-3xl bg-slate-200/60 animate-pulse" />}

        {!loading && statusErr && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-600">{statusErr}</p>
            <button onClick={loadStatus} className="min-h-[44px] px-6 rounded-2xl bg-[#EA580C] text-white font-black text-sm">Try again</button>
          </div>
        )}

        {/* ------------------------------------------------ TODAY ---------- */}
        {!loading && !statusErr && tab === 'today' && status && (
          <>
            {unseen && (
              <button onClick={() => openReview(unseen.mockId)} className="w-full bg-emerald-600 text-white rounded-3xl p-5 text-left flex items-center justify-between active:scale-[0.99] transition">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-100">Results ready</p>
                  <p className="text-base font-black mt-1">{unseen.title || 'Your latest mock'}</p>
                  <p className="text-sm font-bold text-emerald-100 mt-0.5">Tap to see your score and the answers</p>
                </div>
                <ChevronRight className="w-6 h-6 shrink-0" />
              </button>
            )}

            <div className="bg-white rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Today · {fmtDay(today)}</p>
                {status.week && (
                  <div className="flex gap-1">
                    {status.week.map((w: Json) => (
                      <span
                        key={w.date}
                        title={`${fmtDay(w.date)}${w.title ? ` · ${w.title}` : ''}`}
                        className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${w.date === today ? 'bg-[#EA580C] text-white' : w.status ? 'bg-orange-100 text-[#EA580C]' : 'bg-slate-100 text-slate-400'}`}
                      >
                        {new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow' })}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {status.state === 'no_mock' && (
                <div className="mt-4 text-center py-6">
                  <CalendarX2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-base font-black text-slate-900">No mock today</p>
                  {status.nextMockDate && <p className="text-sm text-slate-500 mt-1">Next one: {fmtDay(status.nextMockDate)}</p>}
                </div>
              )}

              {status.state === 'open' && (
                <>
                  {!status.username ? (
                    <div className="mt-4">
                      <UsernameGate onClaimed={loadStatus} />
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div>
                        <h3 className="text-lg font-black text-slate-900">{status.mock?.title || 'TOS Mock'}</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          {status.mock?.subjects?.length ? status.mock.subjects.join(' · ') : 'All subjects'}
                          {' · '}{status.mock?.questionCount || '?'} questions · {status.mock?.durationMinutes || '?'} min
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                        <Clock className="w-4 h-4" />
                        You can start until {fmtClock(status.cutoffAt)}
                      </div>
                      {notice && <p className="text-sm font-bold text-rose-600">{notice}</p>}
                      <button
                        onClick={() => setRulesOpen(true)}
                        disabled={starting}
                        className={`w-full min-h-[56px] rounded-2xl font-black text-base uppercase tracking-widest flex items-center justify-center gap-2 ${starting ? 'bg-slate-100 text-slate-400' : 'bg-[#EA580C] text-white active:scale-[0.99]'}`}
                      >
                        <Play className="w-5 h-5" /> {starting ? 'Opening...' : 'Start the mock'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {status.state === 'in_progress' && (
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-black text-slate-900">Your mock is waiting</h3>
                  <p className="text-sm text-slate-500">Time keeps running until {fmtClock(status.attempt?.deadline)}. Go back in and finish.</p>
                  {notice && <p className="text-sm font-bold text-rose-600">{notice}</p>}
                  <button onClick={start} disabled={starting} className="w-full min-h-[56px] rounded-2xl bg-[#EA580C] text-white font-black text-base uppercase tracking-widest flex items-center justify-center gap-2">
                    <Play className="w-5 h-5" /> {starting ? 'Opening...' : 'Resume the mock'}
                  </button>
                </div>
              )}

              {status.state === 'submitted' && (
                <div className="mt-4 text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-base font-black text-slate-900">Done for today</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Your score is already marked but hidden until results are released{status.attempt?.autoSubmitted ? ' (you were auto-submitted at time-up)' : ''}.
                  </p>
                  <p className="text-sm font-bold text-[#EA580C] mt-2">Results drop tomorrow at {fmtClock(status.releaseAt)}</p>
                </div>
              )}

              {status.state === 'closed' && (
                <div className="mt-4 text-center py-6">
                  <Hourglass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-base font-black text-slate-900">Too late to start today</p>
                  <p className="text-sm text-slate-500 mt-1">A mock must finish before midnight, so starting closed at {fmtClock(status.cutoffAt)}.</p>
                  {status.nextMockDate && <p className="text-sm font-bold text-[#EA580C] mt-2">Next one: {fmtDay(status.nextMockDate)}</p>}
                </div>
              )}

              {status.state === 'missed' && (
                <div className="mt-4 text-center py-6">
                  <XCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-base font-black text-slate-900">This one got away</p>
                  <p className="text-sm text-slate-500 mt-1">Missed mocks cannot be retaken. {status.nextMockDate ? `Next one: ${fmtDay(status.nextMockDate)}` : ''}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ------------------------------------------------ PAST ----------- */}
        {!loading && !statusErr && tab === 'past' && (
          <>
            {past === null && <div className="h-40 rounded-3xl bg-slate-200/60 animate-pulse" />}
            {past !== null && past.length === 0 && (
              <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center">
                <HistoryIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-base font-black text-slate-900">Nothing here yet</p>
                <p className="text-sm text-slate-500 mt-1">Only mocks you took appear here. Mocks you missed cannot be retaken.</p>
              </div>
            )}
            {past !== null && past.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Taken</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{past.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Best rank</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">
                      {past.filter((r: Json) => r.rank != null).length ? Math.min(...past.filter((r: Json) => r.rank != null).map((r: Json) => r.rank)) : '—'}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Average</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">
                      {past.filter((r: Json) => r.scoreScaled != null).length
                        ? Math.round(past.filter((r: Json) => r.scoreScaled != null).reduce((n: number, r: Json) => n + r.scoreScaled, 0) / past.filter((r: Json) => r.scoreScaled != null).length)
                        : '—'}
                    </p>
                  </div>
                </div>
                {notice && <p className="text-sm font-bold text-[#EA580C]">{notice}</p>}
                <div className="space-y-3">
                  {past.map((r: Json) => (
                    <button
                      key={r.mockId}
                      onClick={() => (r.released ? openReview(r.mockId) : setNotice(`Results for ${fmtDay(r.date)} drop at 6:00 am the morning after.`))}
                      className="w-full bg-white rounded-2xl border border-slate-200 p-4 text-left flex items-center justify-between active:scale-[0.99] transition"
                    >
                      <div>
                        <p className="text-base font-black text-slate-900">{r.title}</p>
                        <p className="text-sm text-slate-500 font-medium">{fmtDay(r.date)}{r.rank ? `, rank ${r.rank}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-2xl font-black text-slate-900">{r.scoreScaled ?? '—'}</span>
                        <span className="text-sm font-bold text-slate-400">{r.scoreScale === 100 ? '%' : `/ ${r.scoreScale || ''}`}</span>
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ------------------------------------------------ LEADERBOARD ---- */}
        {!loading && !statusErr && tab === 'board' && (
          <>
            {status?.today && (
              <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-3 py-2">
                <button
                  onClick={() => { const d = boardDate || status.today; const next = shiftDate(d, -1); setBoardDate(next); loadBoard(next); }}
                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Earlier day"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <p className="text-sm font-black text-slate-900">{fmtDay(boardDate || status.today)}</p>
                <button
                  disabled={(boardDate || status.today) >= status.today}
                  onClick={() => { const d = boardDate || status.today; const next = shiftDate(d, 1); setBoardDate(next); loadBoard(next); }}
                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center disabled:opacity-40" aria-label="Later day"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            )}
            {board === null && <div className="h-60 rounded-3xl bg-slate-200/60 animate-pulse" />}
            {board !== null && !board.released && (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center">
                <Trophy className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-base font-black text-slate-900">Nothing released for this day</p>
                <p className="text-sm text-slate-500 mt-1">Results and the leaderboard drop at 6:00 am the morning after a mock.</p>
              </div>
            )}
            {board !== null && board.released && (
              <div className="space-y-3">
                {board.entries.length === 0 && (
                  <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center">
                    <p className="text-base font-black text-slate-900">No attempts were marked</p>
                  </div>
                )}
                {board.entries.map((e: Json, i: number) => {
                  const mine = board.me && board.me.username === e.username && board.me.rank === e.rank;
                  return (
                    <div key={`${e.username}-${i}`} className={`rounded-2xl border-2 px-4 py-3 flex items-center gap-3 ${mine ? 'border-[#EA580C] bg-orange-50' : 'border-slate-200 bg-white'}`}>
                      <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-black text-sm ${e.rank === 1 ? 'bg-amber-300 text-amber-900' : e.rank === 2 ? 'bg-slate-200 text-slate-700' : e.rank === 3 ? 'bg-orange-200 text-orange-900' : 'bg-slate-100 text-slate-500'}`}>
                        {e.rank}
                      </span>
                      <span className="flex-1 text-[15px] font-black text-slate-900 truncate">{e.username}</span>
                      <span className="text-lg font-black text-slate-900">{e.score}</span>
                    </div>
                  );
                })}
                {board.me && board.me.rank > 100 && (
                  <div className="rounded-2xl border-2 border-[#EA580C] bg-orange-50 px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-black text-[#EA580C]">#{board.me.rank}</span>
                    <span className="flex-1 text-[15px] font-black text-slate-900 truncate">{board.me.username} (you)</span>
                    <span className="text-lg font-black text-slate-900">{board.me.score}</span>
                  </div>
                )}
                <p className="text-center text-xs font-bold text-slate-400 pt-1">
                  Top 100 shown{board.totalAttempts ? ` of ${board.totalAttempts} attempts` : ''}. Ranks update daily at 6:00 am.
                </p>
              </div>
            )}
          </>
        )}
        {rulesOpen && !exam && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Before you start</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Five rules for every TOS mock, every centre.</p>
                </div>
                <button onClick={() => setRulesOpen(false)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-3">
                {[
                  'One mock each day, one attempt only. A missed mock stays missed.',
                  'The clock runs on our servers: once you start, time keeps running even if you close the app.',
                  'Finish before midnight. Starting closes at the cutoff time shown on your mock.',
                  'Your answers save by themselves as you go, so stepping away for a moment is safe.',
                  'Scores, answers and the leaderboard stay hidden until results drop at 6:00 am the next morning.',
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-[#EA580C] text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span className="text-sm text-slate-600 font-medium leading-relaxed">{rule}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={start}
                disabled={starting}
                className={`w-full min-h-[56px] rounded-2xl font-black text-base uppercase tracking-widest flex items-center justify-center gap-2 ${starting ? 'bg-slate-100 text-slate-400' : 'bg-[#EA580C] text-white active:scale-[0.99]'}`}
              >
                <Play className="w-5 h-5" /> {starting ? 'Opening...' : "I've read the rules, start"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
