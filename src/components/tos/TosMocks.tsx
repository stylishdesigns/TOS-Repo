import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, HelpCircle, Loader2, Plus, Trash2,
  AlertTriangle, CheckCircle2, FileText, RefreshCw, Rocket, Trophy, X,
} from 'lucide-react';
import { api, Card, Field, inputCls, btnPrimary, btnGhost, fmtDateTime } from './tosShared';

/**
 * TOS Mocks tab (Prompt M, piece M3): the mock calendar plus create and edit
 * screens. Mocks are owned entirely by Tutorial OS, so this lives in the TOS
 * console and talks only to the /api/tos/mocks routes. Nothing here writes to
 * Firestore directly: every change goes through the server, which owns the
 * rules, the timing and the marking key.
 *
 * Guard rails mirrored from the server:
 *  - the mock date is the document id, so one mock per day is structural;
 *  - only Drafts can be edited; Scheduled mocks are frozen;
 *  - scheduling runs the readiness check first and needs the word SCHEDULE;
 *  - cancelling needs the word CANCEL and only works on Drafts and
 *    Scheduled mocks;
 *  - the frozen paper shows questions and options only: the marking key is
 *    server-only and never reaches any screen, before or after release.
 */

type Json = any;

export const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  scheduled: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30',
  live: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  closed: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  released: 'bg-orange-500/15 text-orange-300 border-orange-400/30',
  archived: 'bg-slate-500/15 text-slate-400 border-slate-400/20',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  void: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', scheduled: 'Scheduled', live: 'Live', closed: 'Closed',
  released: 'Results out', archived: 'Archived', cancelled: 'Cancelled', void: 'Voided',
};

export const EXAM_LABELS: Record<string, string> = { jamb: 'JAMB', waec_neco: 'WAEC/NECO' };

const pad = (n: number) => String(n).padStart(2, '0');
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, days, firstWeekday: (first.getUTCDay() + 6) % 7 }; // Monday-first
};
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Subject names can differ in wording ("English" in settings vs "English
// Language" in the bank); match on normalised containment in either direction,
// mirroring the server.
const sameSubject = (a: unknown, b: unknown): boolean => {
  const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

interface SubjectRow { subject: string; count: string; ids: string; }

const emptyForm = (examType: string): { title: string; examType: string; rows: SubjectRow[]; source: 'random' | 'picked' } => ({
  title: '', examType, rows: [{ subject: '', count: '', ids: '' }], source: 'random',
});

// ---------------------------------------------------------------------------
// Editor: the create and edit form. Subjects are picked from what the mock
// bank has published (typed only as a fallback). Hand-picked mocks take
// question ids per subject.
// ---------------------------------------------------------------------------
const MockForm: React.FC<{
  initial: { title: string; examType: string; rows: SubjectRow[]; source: 'random' | 'picked'; date?: string };
  busy: boolean;
  showDate?: boolean;
  onSubmit: (payload: Json) => void;
}> = ({ initial, busy, showDate, onSubmit }) => {
  const [title, setTitle] = useState(initial.title);
  const [examType, setExamType] = useState(initial.examType);
  const [rows, setRows] = useState<SubjectRow[]>(initial.rows);
  const [source, setSource] = useState<'random' | 'picked'>(initial.source);
  const [date, setDate] = useState(initial.date || todayStr());
  const [localError, setLocalError] = useState('');

  // The subjects offered here come from the mock bank itself: anything with
  // published questions shows up as a choice, so a paper is only built from
  // what students can actually be given. Nothing hard-coded; if the bank has
  // no published subjects yet, the form falls back to typing.
  const [publishedSubjects, setPublishedSubjects] = useState<Array<{ label: string; published: number; topics: string[] }>>([]);
  useEffect(() => {
    let alive = true;
    api('/api/tos/questionbank/tree?kind=mock').then((r: any) => {
      if (!alive) return;
      const list = ((r.subjects || []) as any[])
        .filter((x) => Number(x?.byStatus?.published) > 0)
        .map((x) => ({
          label: String(x.label || x.key),
          published: Number(x.byStatus.published) || 0,
          topics: ((x.topics || []) as any[]).map((t) => String(t.label || t.key)),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setPublishedSubjects(list);
    }).catch(() => { /* the typed-input fallback still works */ });
    return () => { alive = false; };
  }, []);

  const subjectOptions = (current: string) => {
    const labels = publishedSubjects.map((x) => x.label);
    if (current && !labels.some((l) => sameSubject(l, current))) labels.unshift(current);
    return labels;
  };
  const subjectField = (i: number, r: SubjectRow) => {
    if (publishedSubjects.length === 0 && !r.subject) {
      return <input className={`${inputCls} flex-1 min-w-0 w-auto`} value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} placeholder="Subject name" maxLength={80} />;
    }
    return (
      <select className={`${inputCls} flex-1 min-w-0 w-auto`} value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })}>
        <option value="">Select subject</option>
        {subjectOptions(r.subject).map((label) => {
          const info = publishedSubjects.find((x) => x.label === label);
          return <option key={label} value={label}>{label}{info ? ` (${info.published} published)` : ''}</option>;
        })}
      </select>
    );
  };
  const subjectHint = (label: string) => {
    const x = publishedSubjects.find((s2) => sameSubject(s2.label, label));
    if (!x) return '';
    return `${x.published} published question${x.published === 1 ? '' : 's'} in the bank${x.topics.length ? ` · topics: ${x.topics.join(', ')}` : ''}`;
  };

  const isJamb = examType === 'jamb';
  const setRow = (i: number, patch: Partial<SubjectRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () => {
    setLocalError('');
    const cleaned = rows.map((r) => ({
      subject: r.subject.trim(),
      count: Number(r.count),
      ids: source === 'picked' ? r.ids.split(/[\s,;]+/).filter(Boolean) : undefined,
    }));
    if (!title.trim()) { setLocalError('Give the mock a title.'); return; }
    if (cleaned.some((r) => !r.subject)) { setLocalError('Every subject row needs a subject name.'); return; }
    if (cleaned.some((r) => !Number.isInteger(r.count) || r.count < 1)) { setLocalError('Every subject needs a question count of 1 or more.'); return; }
    if (source === 'picked' && cleaned.some((r) => (r.ids as string[]).length !== r.count)) {
      setLocalError('Hand-picked mocks need exactly as many question ids as the count, for every subject.');
      return;
    }
    onSubmit({
      title: title.trim(),
      examType,
      questionSource: source,
      subjects: cleaned.map((r) => (source === 'picked'
        ? { subject: r.subject, count: r.count, questionIds: r.ids }
        : { subject: r.subject, count: r.count })),
      ...(showDate ? { date } : {}),
    });
  };

  return (
    <div className="space-y-4">
      {showDate && (
        <Field label="Mock date">
          <input type="date" className={inputCls} value={date} min={todayStr()}
            onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label="Title">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. November full-length practice" maxLength={120} />
      </Field>
      <Field label="Exam type">
        <div className="flex gap-2">
          {['jamb', 'waec_neco'].map((t) => (
            <button key={t} type="button" onClick={() => { setExamType(t); if (t === 'waec_neco') setRows(rows.slice(0, 1)); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${examType === t ? 'bg-orange-500/15 text-orange-300 border-orange-500/40' : 'text-slate-300 border-white/10 hover:border-white/25 bg-slate-950/40'}`}>
              {EXAM_LABELS[t]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Question source">
        <div className="flex gap-2">
          {(['random', 'picked'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${source === s ? 'bg-orange-500/15 text-orange-300 border-orange-500/40' : 'text-slate-300 border-white/10 hover:border-white/25 bg-slate-950/40'}`}>
              {s === 'random' ? 'Pick at random' : 'Hand-pick from the Library'}
            </button>
          ))}
        </div>
      </Field>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Subjects</span>
          {isJamb && (
            <button type="button" onClick={() => setRows([...rows, { subject: '', count: '', ids: '' }])} className="text-xs font-bold text-orange-300 hover:text-orange-200 inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add subject
            </button>
          )}
        </div>
        {source === 'random' ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  {subjectField(i, r)}
                  <input className={`${inputCls} w-20 shrink-0`} style={{ width: '5rem' }} value={r.count} inputMode="numeric"
                    onChange={(e) => setRow(i, { count: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Count" />
                  {isJamb && rows.length > 1 && (
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-500 hover:text-rose-300" aria-label="Remove subject">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {subjectHint(r.subject) && <p className="text-[11px] text-slate-500">{subjectHint(r.subject)}</p>}
              </div>
            ))}
            {!isJamb && <p className="text-xs text-slate-500">A WAEC/NECO mock is one paper: one subject for that day.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  {subjectField(i, r)}
                  <input className={`${inputCls} w-20 shrink-0`} style={{ width: '5rem' }} value={r.count} inputMode="numeric"
                    onChange={(e) => setRow(i, { count: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Count" />
                  {isJamb && rows.length > 1 && (
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-500 hover:text-rose-300" aria-label="Remove subject">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {subjectHint(r.subject) && <p className="text-[11px] text-slate-500">{subjectHint(r.subject)}</p>}
                <textarea className={`${inputCls} h-20`} value={r.ids} onChange={(e) => setRow(i, { ids: e.target.value })}
                  placeholder="Paste the question ids, separated by spaces or commas" />
              </div>
            ))}
          </div>
        )}
      </div>
      {localError && <p className="text-rose-300 text-sm">{localError}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save draft
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Paper preview: questions and options only. The marking key is never fetched
// and never rendered; the server would not send it anyway.
// ---------------------------------------------------------------------------
const PaperPreview: React.FC<{ mockId: string }> = ({ mockId }) => {
  const [paper, setPaper] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPaper(await api(`/api/tos/mocks/${mockId}/paper`)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [mockId]);
  useEffect(() => { setPaper(null); load(); }, [load]);

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading the paper…</div>;
  if (error) return (
    <div className="space-y-2">
      <p className="text-rose-300 text-sm">{error}</p>
      <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Try again</button>
    </div>
  );
  const questions = paper?.paper?.questions || [];
  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      <p className="text-xs text-slate-400">{paper?.paper?.questionCount} questions · {paper?.paper?.durationMinutes} minutes. Questions and options only; the marking key stays on the server.</p>
      {questions.map((q: Json, i: number) => (
        <div key={q.id} className="bg-slate-950/40 border border-white/5 rounded-xl p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{i + 1} · {q.subject}{q.topic ? ` · ${q.topic}` : ''}{q.year ? ` · ${q.year}` : ''}</p>
          <p className="text-sm text-white whitespace-pre-wrap">{q.text}</p>
          {q.imageLink && <p className="text-[11px] text-slate-500 mt-1">Has an image</p>}
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {q.options.map((o: string, j: number) => (
              <p key={j} className="text-xs text-slate-300 bg-white/5 rounded-lg px-2 py-1">{String.fromCharCode(65 + j)}. {o}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// MB2: the three-step workflow strip shown on every mock panel, with the
// current step highlighted. Step 2 is the Mock Bank's Publish tab (the bank
// ships no public file); step 3 is the typed SCHEDULE freeze.
const WORKFLOW_STEPS = ['Draft', 'Publish', 'Scheduled (students can take it)'];
const WorkflowStrip: React.FC<{ active: number }> = ({ active }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5 flex-wrap">
      {WORKFLOW_STEPS.map((label, i) => {
        const done = i < active;
        const now = i === active;
        return (
          <React.Fragment key={label}>
            {i > 0 && <span className="text-slate-600 text-xs" aria-hidden="true">&#8594;</span>}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${done ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300' : now ? 'border-orange-400/60 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-slate-950/40 text-slate-500'}`}>
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
    <p className="text-xs text-slate-500">Scheduling freezes the questions, builds the private paper and opens the mock for students on its date.</p>
  </div>
);

// ---------------------------------------------------------------------------
// Detail panel: definition, readiness, schedule, cancel, paper preview.
// ---------------------------------------------------------------------------
const TypedConfirm: React.FC<{ word: string; label: string; onConfirm: () => void; busy: boolean; onCancel: () => void }> =
  ({ word, label, onConfirm, busy, onCancel }) => {
    const [typed, setTyped] = useState('');
    return (
      <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3 space-y-2">
        <p className="text-xs text-slate-300">Type <span className="font-black text-white">{word}</span> to {label.toLowerCase()}.</p>
        <div className="flex gap-2">
          <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} />
          <button onClick={onConfirm} disabled={busy || typed.trim() !== word} className={btnPrimary}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {label}
          </button>
          <button onClick={onCancel} disabled={busy} className={btnGhost}>Back</button>
        </div>
      </div>
    );
  };

export const MockDetail: React.FC<{ mockId: string; onChanged: () => void; onClose: () => void }> = ({ mockId, onChanged, onClose }) => {
  const [mock, setMock] = useState<Json | null>(null);
  const [loadError, setLoadError] = useState('');
  const [readiness, setReadiness] = useState<Json | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState<'' | 'schedule' | 'cancel' | 'release' | 'void'>('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPaper, setShowPaper] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scheduleBlock, setScheduleBlock] = useState('');

  const load = useCallback(async () => {
    setLoadError(''); setReadiness(null); setEditing(false);
    try { setMock((await api(`/api/tos/mocks/${mockId}`)).mock); }
    catch (e: any) { setLoadError(e.message); }
  }, [mockId]);
  useEffect(() => { setMock(null); setShowPaper(false); load(); }, [load]);

  const runReadiness = async (): Promise<Json | null> => {
    setChecking(true); setNotice('');
    try {
      const r: Json = await api(`/api/tos/mocks/${mockId}/readiness`);
      setReadiness(r);
      if (r.ready) setScheduleBlock('');
      return r;
    }
    catch (e: any) { setNotice(e.message); return null; }
    finally { setChecking(false); }
  };

  // MB2: the Schedule button is always visible on a draft. Pressing it runs
  // the readiness check first (when it has not run yet) and jumps straight to
  // the typed SCHEDULE confirmation when the check passes. When the check
  // fails, the warnings show in red and the button stays disabled with the
  // reason beside it until a fresh check passes.
  const scheduleFromDraft = async () => {
    setScheduleBlock('');
    if (!readiness) {
      const r = await runReadiness();
      if (!r) return;
      if (r.ready) { setConfirming('schedule'); return; }
      const errs = (r.warnings || []).filter((w: Json) => w.level === 'error');
      setScheduleBlock(errs[0]?.message || 'Readiness found problems. Fix them, then check readiness again.');
      return;
    }
    if (readiness.ready) setConfirming('schedule');
  };

  const schedule = async () => {
    setBusy(true); setNotice('');
    try {
      const r = await api(`/api/tos/mocks/${mockId}/schedule`, { method: 'POST' });
      setNotice(`Scheduled: ${r.questionCount} questions, ${r.durationMinutes} minutes.`);
      setConfirming(''); await load(); onChanged();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setNotice('');
    try {
      await api(`/api/tos/mocks/${mockId}/cancel`, { method: 'POST' });
      setConfirming(''); await load(); onChanged();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  const doVoid = async () => {
    setBusy(true); setNotice('');
    try {
      const r = await api(`/api/tos/mocks/${mockId}/void`, { method: 'POST', body: { confirm: 'VOID' } });
      setNotice(r.hadBoard
        ? 'Voided. The leaderboard is hidden and these results do not count.'
        : 'Voided. The date can be reused for a fresh mock.');
      setConfirming(''); await load(); onChanged();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  const [monitor, setMonitor] = useState<Json | null>(null);

  const loadMonitor = useCallback(async () => {
    try { setMonitor(await api(`/api/tos/mocks/${mockId}/monitor`)); }
    catch { setMonitor(null); }
  }, [mockId]);
  useEffect(() => { if (mock && mock.status !== 'draft') loadMonitor(); }, [mock, loadMonitor]);

  const release = async () => {
    setBusy(true); setNotice('');
    try {
      const r = await api('/api/tos/mocks/release', { method: 'POST', body: { mockId, confirm: 'RELEASE' } });
      setNotice(r.outcome === 'already' ? 'Results were already released.' : 'Results released: the leaderboard is built.');
      setConfirming(''); await load(); await loadMonitor(); onChanged();
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  if (loadError) return (
    <div className="space-y-2">
      <p className="text-rose-300 text-sm">{loadError}</p>
      <button onClick={() => { load(); }} className={btnGhost}><RefreshCw className="w-4 h-4" /> Try again</button>
    </div>
  );
  if (!mock) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const isDraft = mock.status === 'draft';
  const isScheduled = mock.status === 'scheduled';
  const ready = readiness?.ready;
  const stripActive = isDraft ? (readiness ? (ready ? 2 : 1) : 0) : 3;
  const errors = (readiness?.warnings || []).filter((w: Json) => w.level === 'error');
  const warns = (readiness?.warnings || []).filter((w: Json) => w.level !== 'error');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-white">{mock.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {EXAM_LABELS[mock.examType] || mock.examType} · {mock.date} ·{' '}
            <span className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[mock.status] || ''}`}>{STATUS_LABELS[mock.status] || mock.status}</span>
          </p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white p-1" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      <WorkflowStrip active={stripActive} />

      {editing ? (
        <MockForm
          initial={{
            title: mock.title,
            examType: mock.examType,
            source: mock.questionSource,
            rows: (mock.subjects || []).map((s: Json) => ({ subject: s.subject, count: String(s.count), ids: (s.questionIds || []).join(', ') })),
          }}
          busy={busy}
          onSubmit={async (payload) => {
            setBusy(true); setNotice('');
            try {
              await api(`/api/tos/mocks/${mockId}/edit`, { method: 'POST', body: payload });
              setEditing(false); await load(); onChanged();
            } catch (e: any) { setNotice(e.message); }
            finally { setBusy(false); }
          }}
        />
      ) : (
        <>
          <div className="bg-slate-950/40 border border-white/5 rounded-xl p-4 space-y-1.5">
            <p className="text-xs text-slate-400">
              {(mock.subjects || []).map((s: Json) => `${s.subject}: ${s.count}`).join(' · ') || 'No subjects set'}
              {' '}· {mock.questionSource === 'picked' ? 'hand-picked questions' : 'picked at random when scheduled'}
            </p>
            {mock.questionCount != null && <p className="text-xs text-slate-400">{mock.questionCount} questions · {mock.durationMinutes} minutes · frozen {fmtDateTime(mock.frozenAt)}</p>}
          </div>

          {isDraft && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setEditing(true)} className={btnGhost}>Edit draft</button>
                {confirming !== 'schedule' && (
                  <button onClick={scheduleFromDraft} disabled={checking || Boolean(readiness && !ready)} className={btnPrimary}>
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />} Schedule this mock
                  </button>
                )}
                <button onClick={runReadiness} disabled={checking} className={btnGhost}>
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-orange-400" />} Check readiness
                </button>
                <button onClick={() => { setConfirming('cancel'); setReadiness(null); }} className={btnGhost}>Cancel mock</button>
              </div>
              {scheduleBlock && <p className="text-xs text-rose-300">{scheduleBlock}</p>}
            </div>
          )}

          {readiness && (
            <Card title="Readiness check">
              <div className="space-y-2">
                {readiness.warnings.length === 0 && <p className="text-sm text-emerald-300 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Ready to schedule.</p>}
                {errors.map((w: Json, i: number) => (
                  <p key={i} className="text-sm text-rose-300 inline-flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {w.message}</p>
                ))}
                {warns.map((w: Json, i: number) => (
                  <p key={i} className="text-sm text-amber-300 inline-flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {w.message}</p>
                ))}
                <p className="text-xs text-slate-500">
                  {Object.entries(readiness.counts || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </p>
              </div>
            </Card>
          )}

          {isDraft && readiness && !ready && (
            <p className="text-xs text-slate-500">Fix the red items, then check readiness again before scheduling.</p>
          )}

          {isDraft && confirming === 'schedule' && (
            <TypedConfirm word="SCHEDULE" label="Schedule" busy={busy} onConfirm={schedule} onCancel={() => setConfirming('')} />
          )}

          {confirming === 'cancel' && (
            <TypedConfirm word="CANCEL" label="Cancel mock" busy={busy} onConfirm={cancel} onCancel={() => setConfirming('')} />
          )}

          {isScheduled && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowPaper(!showPaper)} className={btnGhost}><FileText className="w-4 h-4" /> {showPaper ? 'Hide paper' : 'Preview paper'}</button>
              <button onClick={() => { setConfirming('cancel'); setShowPaper(false); }} className={btnGhost}>Cancel mock</button>
              <button onClick={() => setShowCorrect(!showCorrect)} className={btnGhost}>Correct a question</button>
              {confirming !== 'void' && <button onClick={() => setConfirming('void')} className={btnGhost}>Void this mock</button>}
            </div>
          )}
          {isScheduled && showPaper && <Card title="Frozen paper"><PaperPreview mockId={mockId} /></Card>}
          {isScheduled && confirming === 'void' && (
            <TypedConfirm word="VOID" label="Void this mock" busy={busy} onConfirm={doVoid} onCancel={() => setConfirming('')} />
          )}

          {mock.status !== 'draft' && monitor && (
            <Card title="Monitor">
              <div className="space-y-2">
                <p className="text-sm text-slate-300">
                  {monitor.started} started · {monitor.openNow} in progress · {monitor.submitted} submitted
                </p>
                {mock.status === 'released' ? (
                  <p className="text-xs text-emerald-300">
                    Results released{monitor.releasedTotal != null ? ` · ${monitor.releasedTotal} marked attempts` : ''}.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Results release automatically at 6:00 a.m. Lagos the morning after the mock; this button is the fallback.
                  </p>
                )}
                {['scheduled', 'live', 'closed'].includes(mock.status) && mock.date < todayStr() && confirming !== 'release' && (
                  <div><button onClick={() => setConfirming('release')} className={btnPrimary}><Rocket className="w-4 h-4" /> Release results now</button></div>
                )}
                {confirming === 'release' && (
                  <TypedConfirm word="RELEASE" label="Release results" busy={busy} onConfirm={release} onCancel={() => setConfirming('')} />
                )}
              </div>
            </Card>
          )}

          {!isDraft && !isScheduled && (
            <div className="flex flex-wrap gap-2">
              {['live', 'closed', 'released', 'archived'].includes(mock.status) && (
                <button onClick={() => setShowPaper(!showPaper)} className={btnGhost}><FileText className="w-4 h-4" /> {showPaper ? 'Hide paper' : 'Preview paper'}</button>
              )}
              {mock.status === 'released' && (
                <button onClick={() => setShowBoard(!showBoard)} className={btnGhost}><Trophy className="w-4 h-4" /> {showBoard ? 'Hide leaderboard' : 'View leaderboard'}</button>
              )}
              {['scheduled', 'released'].includes(mock.status) && (
                <button onClick={() => setShowCorrect(!showCorrect)} className={btnGhost}>Correct a question</button>
              )}
              {['scheduled', 'released'].includes(mock.status) && confirming !== 'void' && (
                <button onClick={() => setConfirming('void')} className={btnGhost}>Void this mock</button>
              )}
              <p className="text-xs text-slate-500 self-center">A {STATUS_LABELS[mock.status] || mock.status} mock is read-only here.</p>
            </div>
          )}
          {!isDraft && !isScheduled && showPaper && <Card title="Frozen paper"><PaperPreview mockId={mockId} /></Card>}
          {mock.status === 'released' && showBoard && <Card title="Leaderboard"><BoardView mockId={mockId} /></Card>}
          {['scheduled', 'released'].includes(mock.status) && showCorrect && (
            <Card title="Correct a question"><CorrectPanel mockId={mockId} released={mock.status === 'released'} /></Card>
          )}
          {!isDraft && !isScheduled && ['scheduled', 'released'].includes(mock.status) && confirming === 'void' && (
            <TypedConfirm word="VOID" label="Void this mock" busy={busy} onConfirm={doVoid} onCancel={() => setConfirming('')} />
          )}

          {notice && <p className="text-sm text-orange-300">{notice}</p>}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Series builder: plan a WAEC/NECO series (one single-subject paper per date,
// twice a month, every compulsory subject covered), preview it, then create
// the drafts with a typed confirm. The compulsory subjects come from the
// server's settings; extra subjects are typed here.
// ---------------------------------------------------------------------------
const SeriesPanel: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [compulsory, setCompulsory] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [day1, setDay1] = useState('');
  const [day2, setDay2] = useState('');
  const [months, setMonths] = useState('');
  const [count, setCount] = useState('');
  const [titlePrefix, setTitlePrefix] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [preview, setPreview] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Json | null>(null);

  useEffect(() => {
    api('/api/tos/mocks/settings')
      .then((r) => setCompulsory(r.settings.compulsorySubjects || []))
      .catch(() => setCompulsory([]));
  }, []);

  // Extra subjects beyond the compulsory ones also pick from what the mock
  // bank has published, minus the subjects already in the rotation.
  const [publishedSubjects, setPublishedSubjects] = useState<Array<{ label: string; published: number }>>([]);
  useEffect(() => {
    let alive = true;
    api('/api/tos/questionbank/tree?kind=mock').then((r: any) => {
      if (!alive) return;
      const list = ((r.subjects || []) as any[])
        .filter((x) => Number(x?.byStatus?.published) > 0)
        .map((x) => ({ label: String(x.label || x.key), published: Number(x.byStatus.published) || 0 }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setPublishedSubjects(list);
    }).catch(() => { /* typed fallback stays */ });
    return () => { alive = false; };
  }, []);
  const extraOptions = (current: string) =>
    publishedSubjects
      .map((x) => x.label)
      .filter((l) => !compulsory.some((c) => sameSubject(c, l)))
      .concat(current && !publishedSubjects.some((x) => x.label === current) ? [current] : []);

  const body = () => ({
    start,
    cadenceDays: [Number(day1), Number(day2)],
    months: Number(months),
    count: Number(count),
    subjects: [...compulsory, ...extras],
    titlePrefix,
  });

  const formReady = () =>
    /^\d{4}-\d{2}-\d{2}$/.test(start) && Number(day1) >= 1 && Number(day1) <= 28
    && Number(day2) >= 1 && Number(day2) <= 28 && Number(day1) !== Number(day2)
    && Number(months) >= 1 && Number(months) <= 12
    && Number.isInteger(Number(count)) && Number(count) >= 1;

  const runPreview = async () => {
    setBusy(true); setError(''); setPreview(null); setResult(null);
    try { setPreview(await api('/api/tos/mocks/series/preview', { method: 'POST', body: body() })); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const runCreate = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/api/tos/mocks/series', { method: 'POST', body: { ...body(), confirm: 'CREATE SERIES' } });
      setResult(r); setPreview(null); onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!result && (
        <>
          <p className="text-xs text-slate-400">
            One paper per date, two dates a month, cycling through subjects. Compulsory subjects
            {' '}({compulsory.join(', ') || 'from settings'}) are included automatically; add any others below.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First paper date">
              <input type="date" className={inputCls} value={start} min={todayStr()} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Months">
              <input className={inputCls} value={months} inputMode="numeric" onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ''))} placeholder="1-12" />
            </Field>
            <Field label="Papers on day of month">
              <div className="flex gap-2">
                <input className={inputCls} value={day1} inputMode="numeric" onChange={(e) => setDay1(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 7" />
                <input className={inputCls} value={day2} inputMode="numeric" onChange={(e) => setDay2(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 21" />
              </div>
            </Field>
            <Field label="Questions per paper">
              <input className={inputCls} value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 40" />
            </Field>
          </div>
          <Field label="Title (optional prefix; the subject name is added)">
            <input className={inputCls} value={titlePrefix} onChange={(e) => setTitlePrefix(e.target.value)} placeholder="e.g. WAEC series" maxLength={80} />
          </Field>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Extra subjects beyond the compulsory ones</span>
              <button type="button" onClick={() => setExtras([...extras, ''])} className="text-xs font-bold text-orange-300 hover:text-orange-200 inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {extras.map((x, i) => (
                <div key={i} className="flex gap-2">
                  {publishedSubjects.length > 0 ? (
                    <select className={inputCls} value={x} onChange={(e) => setExtras(extras.map((v, j) => (j === i ? e.target.value : v)))}>
                      <option value="">Select subject</option>
                      {extraOptions(x).map((label) => {
                        const info = publishedSubjects.find((s2) => s2.label === label);
                        return <option key={label} value={label}>{label}{info ? ` (${info.published} published)` : ''}</option>;
                      })}
                    </select>
                  ) : (
                    <input className={inputCls} value={x} onChange={(e) => setExtras(extras.map((v, j) => (j === i ? e.target.value : v)))} placeholder="Subject name" maxLength={80} />
                  )}
                  <button type="button" onClick={() => setExtras(extras.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-500 hover:text-rose-300" aria-label="Remove subject"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {extras.length === 0 && <p className="text-xs text-slate-500">None added; the series cycles the compulsory subjects only.</p>}
            </div>
          </div>
          <button onClick={runPreview} disabled={busy || !formReady()} className={btnPrimary}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />} Preview the series
          </button>

          {error && <p className="text-rose-300 text-sm">{error}</p>}

          {preview && (
            <Card title={`Review · ${preview.total} papers · ${preview.firstDate} to ${preview.lastDate}`}>
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {preview.plan.map((p: Json) => (
                  <div key={p.date} className="flex items-center justify-between gap-2 bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-sm text-white">{p.date} · {p.subject}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${p.existing && p.existing !== 'cancelled' ? 'bg-amber-500/15 text-amber-300 border-amber-400/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'}`}>
                      {p.existing === 'cancelled' ? 'Reuse cancelled slot' : p.existing ? `Skip: ${p.existing} mock there` : 'Will create'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">Dates with a live mock are skipped and reported; a cancelled slot is reused. Nothing is written until you confirm.</p>
              <div className="mt-3">
                <TypedConfirm word="CREATE SERIES" label="Create drafts" busy={busy} onConfirm={runCreate} onCancel={() => setPreview(null)} />
              </div>
            </Card>
          )}
        </>
      )}
      {result && (
        <div className="space-y-3">
          <p className="text-sm text-emerald-300 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {result.created.length} of {result.total} drafts created.</p>
          {(result.skipped || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Skipped</p>
              {result.skipped.map((s: Json) => <p key={s.date} className="text-xs text-slate-400">{s.date}: {s.reason}</p>)}
            </div>
          )}
          {(result.failed || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-rose-300">Failed</p>
              {result.failed.map((f: Json) => <p key={f.date} className="text-xs text-slate-400">{f.date}: {f.error}</p>)}
            </div>
          )}
          <p className="text-xs text-slate-500">Run the builder again with the same dates to fill in any skipped or failed ones; nothing is written twice.</p>
          <button onClick={() => { setResult(null); }} className={btnGhost}>Build another series</button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// M5b: the leaderboard view. The server serves the released board (top 100,
// usernames only); this just shows it. A GET, so nothing is written.
// ---------------------------------------------------------------------------
const fmtMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const BoardView: React.FC<{ mockId: string }> = ({ mockId }) => {
  const [board, setBoard] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setBoard(await api(`/api/tos/mocks/${mockId}/board`)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [mockId]);
  useEffect(() => { setBoard(null); load(); }, [load]);

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading the board…</div>;
  if (error) return (
    <div className="space-y-2">
      <p className="text-rose-300 text-sm">{error}</p>
      <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Try again</button>
    </div>
  );
  const entries = board?.board?.entries || [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Top {entries.length} of {board?.board?.totalAttempts ?? '…'} marked attempts · released {fmtDateTime(board?.board?.releasedAt)}. One board across all centres; usernames only.
      </p>
      {entries.length === 0 && <p className="text-sm text-slate-400">No entries on this board.</p>}
      <div className="max-h-[380px] overflow-y-auto pr-1 space-y-1.5">
        {entries.map((e: Json, i: number) => (
          <div key={i} className="flex items-center gap-3 bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="text-sm font-black text-orange-300 w-12 shrink-0">#{e.rank}</span>
            <span className="text-sm text-white flex-1 truncate">{e.username}</span>
            <span className="text-sm text-slate-300 shrink-0">{e.score}</span>
            <span className="text-[11px] text-slate-500 shrink-0 w-16 text-right">{fmtMs(e.sortMs)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Score = questions correct. Ties share a rank; the faster finish sits higher.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// M5b: the username register tools. One username per student, kept in a
// server-side register; the boards keep the snapshot they were built with,
// so a reset never rewrites a past board.
// ---------------------------------------------------------------------------
const UsernamePanel: React.FC = () => {
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Json[] | null>(null);
  const [studentId, setStudentId] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [freeing, setFreeing] = useState('');

  const search = useCallback(async (query: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api(`/api/tos/mock-usernames${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setEntries(r.entries || []);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { search(''); }, [search]);

  const lookupStudent = async () => {
    if (!studentId.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api(`/api/tos/mock-usernames?studentId=${encodeURIComponent(studentId.trim())}`);
      setEntries(r.entries || []);
      if ((r.entries || []).length === 0) setNotice('That student has no username yet.');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const assign = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api('/api/tos/mock-usernames', { method: 'POST', body: { studentId: studentId.trim(), username: username.trim() } });
      setNotice(r.freed && r.freed.length
        ? `Saved. ${r.username} now belongs to that student; their old username ${r.freed.join(', ')} was freed.`
        : `Saved. ${r.username} now belongs to that student.`);
      setUsername('');
      await search(q.trim());
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const free = async (sid: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api(`/api/tos/mock-usernames/${encodeURIComponent(sid)}`, { method: 'DELETE' });
      setNotice(`Freed ${(r.freed || []).join(', ')}.`);
      setFreeing('');
      await search(q.trim());
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        The leaderboard shows usernames only, one name per student, unique across every centre. Assign it here; a past board keeps the name it was built with.
      </p>
      <div className="flex gap-2">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search usernames" maxLength={64} />
        <button onClick={() => search(q.trim())} disabled={busy} className={btnGhost}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Search</button>
      </div>
      <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign or change</p>
        <input className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student ID (copy it from the Students tab)" maxLength={128} />
        <div className="flex gap-2">
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="New username (3-24 letters, numbers, _)" maxLength={24} />
          <button onClick={assign} disabled={busy || !studentId.trim() || !username.trim()} className={btnPrimary}>Save</button>
        </div>
        <button onClick={lookupStudent} disabled={busy || !studentId.trim()} className={btnGhost}>Look up this student's username</button>
      </div>
      {entries && entries.length === 0 && <p className="text-sm text-slate-400">No usernames match yet. Assign the first one above.</p>}
      <div className="space-y-1.5">
        {(entries || []).map((e: Json, i: number) => (
          <div key={i} className="flex items-center gap-3 bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="text-sm font-black text-orange-300 flex-1 truncate">{e.username}</span>
            <span className="text-xs text-slate-400 flex-1 truncate">{e.studentName || e.studentId}</span>
            <span className="text-[11px] text-slate-500 shrink-0">{e.centreId || '—'}</span>
            {freeing === e.studentId ? (
              <button onClick={() => free(e.studentId)} disabled={busy} className="text-xs font-bold text-rose-300 hover:text-rose-200 px-2 min-h-[44px]">Tap again to free</button>
            ) : (
              <button onClick={() => setFreeing(e.studentId)} className="text-xs text-slate-400 hover:text-rose-300 px-2 min-h-[44px]">Free</button>
            )}
          </div>
        ))}
      </div>
      {notice && <p className="text-sm text-orange-300">{notice}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// M5b: the mock settings screen. Settings are defaults for future mocks; a
// mock that is already scheduled keeps the values it was frozen with.
// ---------------------------------------------------------------------------
const SettingsPanel: React.FC = () => {
  const [s, setS] = useState<Json | null>(null);
  const [stored, setStored] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Subject choices come from the mock bank itself, so settings name subjects
  // the same way the bank does. Typed inputs remain only as a fallback when
  // the bank has no published subjects yet.
  const [publishedSubjects, setPublishedSubjects] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api('/api/tos/questionbank/tree?kind=mock').then((r: any) => {
      if (!alive) return;
      const list = ((r.subjects || []) as any[])
        .filter((x) => Number(x?.byStatus?.published) > 0)
        .map((x) => String(x.label || x.key))
        .sort((a, b) => a.localeCompare(b));
      setPublishedSubjects(list);
    }).catch(() => { /* typed inputs remain */ });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const r = await api('/api/tos/mocks/settings');
      setS({ ...r.settings, compulsorySubjectsText: (r.settings?.compulsorySubjects || []).join(', ') });
      setStored(r.stored);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (path: string, value: any) => {
    setS((cur: Json) => {
      const next = { ...cur };
      const [a, b] = path.split('.');
      if (b) next[a] = { ...next[a], [b]: value };
      else next[a] = value;
      return next;
    });
  };

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const body = {
        jamb: {
          durationMinutes: Number(s.jamb.durationMinutes),
          scoreScale: Number(s.jamb.scoreScale),
          compulsorySubject: s.jamb.compulsorySubject,
          compulsoryCount: Number(s.jamb.compulsoryCount),
          otherCount: Number(s.jamb.otherCount),
          subjectCount: Number(s.jamb.subjectCount),
        },
        waecNeco: { durationMinutes: Number(s.waecNeco.durationMinutes), scoreScale: Number(s.waecNeco.scoreScale) },
        compulsorySubjects: String(s.compulsorySubjectsText || '').split(',').map((x: string) => x.trim()).filter(Boolean),
        releaseHourLagos: Number(s.releaseHourLagos),
        releaseMinuteLagos: Number(s.releaseMinuteLagos),
        tallyShards: Number(s.tallyShards),
      };
      const r = await api('/api/tos/mocks/settings', { method: 'POST', body });
      setS({ ...r.settings, compulsorySubjectsText: (r.settings?.compulsorySubjects || []).join(', ') });
      setStored(true);
      setNotice('Saved. New values apply to mocks scheduled from now on; a mock that is already scheduled keeps the values it was frozen with.');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading settings…</div>;
  if (error && !s) return (
    <div className="space-y-2">
      <p className="text-rose-300 text-sm">{error}</p>
      <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Try again</button>
    </div>
  );
  if (!s) return null;
  const num = (label: string, path: string, lo: number, hi: number) => (
    <label className="block space-y-1">
      <span className="text-xs text-slate-400">{label}</span>
      <input className={inputCls} type="number" min={lo} max={hi} value={path.split('.').reduce((o: Json, k: string) => o?.[k], s)} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} />
    </label>
  );
  return (
    <div className="space-y-4">
      {!stored && <p className="text-xs text-amber-300">Nothing stored yet: these are the platform defaults. Saving makes them yours.</p>}
      <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">JAMB mock</p>
        <div className="grid grid-cols-2 gap-3">
          {num('Duration (minutes)', 'jamb.durationMinutes', 15, 360)}
          {num('Score scale (total marks)', 'jamb.scoreScale', 20, 2000)}
          {num('Subjects per mock', 'jamb.subjectCount', 1, 12)}
          {num('Compulsory subject questions', 'jamb.compulsoryCount', 1, 500)}
          {num('Other subject questions', 'jamb.otherCount', 1, 500)}
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Compulsory subject name</span>
          {publishedSubjects.length > 0 ? (
            <select className={inputCls} value={s.jamb.compulsorySubject} onChange={(e) => set('jamb.compulsorySubject', e.target.value)}>
              {s.jamb.compulsorySubject && !publishedSubjects.some((x) => sameSubject(x, s.jamb.compulsorySubject)) && (
                <option value={s.jamb.compulsorySubject}>{s.jamb.compulsorySubject} (current setting)</option>
              )}
              {publishedSubjects.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : (
            <input className={inputCls} value={s.jamb.compulsorySubject} onChange={(e) => set('jamb.compulsorySubject', e.target.value)} maxLength={80} />
          )}
        </label>
      </div>
      <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">WAEC/NECO mock</p>
        {num('Duration (minutes)', 'waecNeco.durationMinutes', 15, 360)}
        {num('Score scale (%)', 'waecNeco.scoreScale', 10, 1000)}
      </div>
      <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Series and results</p>
        <div className="space-y-1">
          <span className="text-xs text-slate-400">Compulsory subjects for the series builder (comma-separated)</span>
          {(() => {
            const chosen = String(s.compulsorySubjectsText || '').split(',').map((x: string) => x.trim()).filter(Boolean);
            const names: string[] = [];
            for (const x of publishedSubjects) if (!names.some((n) => sameSubject(n, x))) names.push(x);
            for (const c of chosen) if (!names.some((n) => sameSubject(n, c))) names.push(c);
            if (names.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
                {names.map((n) => {
                  const on = chosen.some((c) => sameSubject(c, n));
                  return (
                    <button key={n} type="button" onClick={() => {
                      const next = on ? chosen.filter((c) => !sameSubject(c, n)) : [...chosen, n];
                      set('compulsorySubjectsText', next.join(', '));
                    }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-orange-500/15 text-orange-300 border-orange-500/40' : 'text-slate-300 border-white/10 hover:border-white/25 bg-slate-950/40'}`}>
                      {n}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <input className={inputCls} value={s.compulsorySubjectsText} onChange={(e) => set('compulsorySubjectsText', e.target.value)} />
          <p className="text-[11px] text-slate-500">Tap a subject above to add or remove it; the box lists the final set. Type here only for names the bank does not have yet.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {num('Results release hour (Lagos)', 'releaseHourLagos', 0, 23)}
          {num('Results release minute', 'releaseMinuteLagos', 0, 59)}
          {num('Tally shards', 'tallyShards', 1, 8)}
        </div>
        <p className="text-[11px] text-slate-500">Timezone stays Africa/Lagos. Every mock copies what it needs when it is scheduled, so changing these never alters a Scheduled mock.</p>
      </div>
      <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save settings</button>
      {notice && <p className="text-sm text-orange-300">{notice}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// M5c: correct one question on a frozen or released paper. The correct
// answer is never shown on any screen: the picker only sets which option
// SHOULD be correct, and only the server writes it. On a released mock the
// marks already counted stand; if the fix is material, void the mock.
// ---------------------------------------------------------------------------
const CorrectPanel: React.FC<{ mockId: string; released: boolean }> = ({ mockId, released }) => {
  const [paper, setPaper] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [find, setFind] = useState('');
  const [page, setPage] = useState(0);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPaper(await api(`/api/tos/mocks/${mockId}/paper`)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [mockId]);
  useEffect(() => { setPaper(null); setPickedIdx(null); setForm(null); load(); }, [load]);

  const questions: Json[] = paper?.paper?.questions || [];
  const filtered = useMemo(() => {
    const f = find.trim().toLowerCase();
    const all = questions.map((q: Json, i: number) => ({ q, i }));
    if (!f) return all;
    const num = /^\d+$/.test(f) ? Number(f) : null;
    return all.filter(({ q, i }) => (num !== null && i + 1 === num)
      || String(q.id).toLowerCase().includes(f)
      || String(q.text).toLowerCase().includes(f));
  }, [questions, find]);
  const pageSlice = filtered.slice(page * 25, page * 25 + 25);

  const pick = (i: number) => {
    const q = questions[i];
    setPickedIdx(i);
    setForm({ text: q.text, options: (q.options || []).slice(), correctIndex: null, explanation: '' });
    setNotice('');
  };

  const setOpt = (j: number, v: string) => setForm((f: Json) => ({ ...f, options: f.options.map((o: string, k: number) => (k === j ? v : o)) }));

  const save = async () => {
    if (pickedIdx === null || !form) return;
    const patch: Json = {};
    if (form.text !== questions[pickedIdx].text) patch.question = form.text;
    if (JSON.stringify(form.options) !== JSON.stringify(questions[pickedIdx].options)) patch.options = form.options;
    if (form.correctIndex !== null) patch.correctIndex = form.correctIndex;
    if (form.explanation.trim()) patch.explanation = form.explanation.trim();
    if (patch.question === undefined && patch.options === undefined && patch.correctIndex === undefined && patch.explanation === undefined) {
      setNotice('Change something first: edit the text, an option, the answer or the explanation.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/tos/mocks/${mockId}/correct-question`, { method: 'POST', body: { questionId: questions[pickedIdx].id, patch } });
      setNotice(`Saved to the paper and the marking key.${released ? ' Scores already released stand.' : ''}`);
      setPickedIdx(null); setForm(null);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading the paper…</div>;
  if (error) return (
    <div className="space-y-2">
      <p className="text-rose-300 text-sm">{error}</p>
      <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Try again</button>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Correct a question on the frozen paper. The current answer is never shown here; pick the option that should be correct.{released ? ' Scores already released stand; if the fix should change results, void the mock.' : ''}
      </p>
      {pickedIdx === null ? (
        <>
          <input className={inputCls} value={find} onChange={(e) => { setFind(e.target.value); setPage(0); }} placeholder="Find: question number, id or words from the text" />
          <div className="max-h-[340px] overflow-y-auto pr-1 space-y-1.5">
            {pageSlice.map(({ q, i }: Json) => (
              <button key={q.id} onClick={() => pick(i)} className="w-full text-left bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2 hover:border-orange-500/40">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{i + 1} · {q.subject}{q.topic ? ` · ${q.topic}` : ''}</p>
                <p className="text-sm text-white truncate">{q.text}</p>
              </button>
            ))}
            {pageSlice.length === 0 && <p className="text-sm text-slate-400">Nothing matches that search.</p>}
          </div>
          {filtered.length > 25 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className={btnGhost}>Back</button>
              <span className="text-xs text-slate-500">Page {page + 1} of {Math.ceil(filtered.length / 25)}</span>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * 25 >= filtered.length} className={btnGhost}>Next</button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <button onClick={() => { setPickedIdx(null); setForm(null); }} className={btnGhost}>Back to the list</button>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Question text</span>
            <textarea className={inputCls} rows={4} value={form.text} onChange={(e) => setForm((f: Json) => ({ ...f, text: e.target.value }))} />
          </label>
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400">Options (text only; the count stays the same)</p>
            {form.options.map((o: string, j: number) => (
              <div key={j} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 w-4">{String.fromCharCode(65 + j)}</span>
                <input className={inputCls} value={o} onChange={(e) => setOpt(j, e.target.value)} maxLength={300} />
              </div>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">The correct answer (pick the option that should be correct)</span>
            <select className={inputCls} value={form.correctIndex ?? ''} onChange={(e) => setForm((f: Json) => ({ ...f, correctIndex: e.target.value === '' ? null : Number(e.target.value) }))}>
              <option value="">No change</option>
              {form.options.map((_: string, j: number) => <option key={j} value={j}>{String.fromCharCode(65 + j)}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Explanation (leave empty to keep the current one)</span>
            <textarea className={inputCls} rows={3} value={form.explanation} onChange={(e) => setForm((f: Json) => ({ ...f, explanation: e.target.value }))} />
          </label>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save correction</button>
        </div>
      )}
      {notice && <p className="text-sm text-orange-300">{notice}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The tab: month calendar with a side panel for create and detail.
// ---------------------------------------------------------------------------
// MB2: the next 14 days at a glance, beside the calendar on desktop and
// under it on phones. A calendar alone hides drafts that are not on the
// screen's month. Every empty day is one tap away from its own draft.
const UpcomingMocks: React.FC<{
  byDate: Record<string, Json>;
  onPick: (date: string, mock: Json | null) => void;
}> = ({ byDate, onPick }) => {
  const start = todayStr();
  const days: string[] = useMemo(() => {
    const [sy, sm, sd] = start.split('-').map(Number);
    const base = new Date(Date.UTC(sy, sm - 1, sd));
    const out: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + i);
      out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    }
    return out;
  }, [start]);
  return (
    <Card title="Upcoming mocks">
      <p className="text-xs text-slate-500 mb-3">The next 14 days. Tap a mock to open it, or a free day to create its mock.</p>
      <div className="space-y-1.5">
        {days.map((date) => {
          const mk = byDate[date] || null;
          const label = date === start
            ? 'Today'
            : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
          return (
            <button key={date} onClick={() => onPick(date, mk)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${mk ? `${STATUS_STYLES[mk.status]} hover:brightness-125` : 'border-white/5 bg-white/[0.02] hover:border-orange-500/40'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-black shrink-0 ${mk ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                {mk ? (
                  <>
                    <span className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[mk.status] || ''}`}>
                      {STATUS_LABELS[mk.status] || mk.status}
                    </span>
                    <span className="text-xs text-slate-200 flex-1 min-w-[120px] truncate">
                      {EXAM_LABELS[mk.examType] || mk.examType} &middot; {(mk.subjects || []).map((x: Json) => x.subject).join(', ') || 'No subjects'}
                    </span>
                    <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg shrink-0 ${mk.status === 'draft' ? 'bg-orange-500 text-white' : 'bg-white/10 text-slate-200'}`}>
                      {mk.status === 'draft' ? 'Schedule' : 'View'}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-600 flex-1">Free &middot; tap to create</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
};

// MB2: the Mocks screen guide, same style as the Question Bank guide.
const MocksGuidePanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 lg:bg-slate-950/80 lg:flex lg:justify-end" onClick={onClose}>
      <div className="w-full lg:max-w-[480px] h-full bg-slate-950 border-l border-slate-800 overflow-y-auto p-5 lg:p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white">How this works</p>
          <button onClick={onClose} aria-label="Close the guide" className="p-2 rounded-lg text-slate-400 hover:text-white min-h-[44px] min-w-[44px]"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-orange-300">One mock a day</p>
          <p className="text-sm text-slate-300">Students get one mock per day, built from the Mock Bank. Scheduling freezes the questions and builds the private paper; results come out at 6:00 am the next morning.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-orange-300">Order of work</p>
          <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
            <li>Create a draft: the New mock button, or tap a free day on the calendar.</li>
            <li>Publish the Mock Bank so its questions go live (Question Bank, Mock Bank, Publish tab). No public file is written; papers stay private.</li>
            <li>Open the draft and press Schedule this mock. It checks readiness first, then asks you to type SCHEDULE to freeze the paper.</li>
          </ol>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-orange-300">What the states mean</p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li><span className="font-bold text-white">Draft:</span> editable, not visible to students.</li>
            <li><span className="font-bold text-white">Scheduled:</span> frozen, appears for students on its date.</li>
            <li><span className="font-bold text-white">Live:</span> the mock day is open.</li>
            <li><span className="font-bold text-white">Results out:</span> released after 6:00 am the morning after the mock.</li>
          </ul>
        </div>
        <button onClick={() => { try { localStorage.setItem('TOS_mocks_guide_seen', '1'); } catch { /* storage unavailable */ } onClose(); }} className={btnPrimary}>Got it, don&apos;t show this again</button>
        <p className="text-[11px] text-slate-500">The (?) button at the top of the Mocks screen brings this back at any time.</p>
      </div>
    </div>
  );
};

// MB2: the last create-open signal this device has handled (survives remounts).
let mocksCreateHandled = -1;

export const MocksTab: React.FC<{ refreshKey: number; openCreateSignal?: number }> = ({ refreshKey, openCreateSignal }) => {
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [byDate, setByDate] = useState<Record<string, Json>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Json>(null); // {mode:'create', date} | {mode:'detail', id}
  // N2: the Mocks screen carries three tabs; the last one is remembered on
  // this device. A refresh still never closes an open panel.
  const [subTab, setSubTabState] = useState<string>(() => {
    try { const v = localStorage.getItem('TOS_mocks_subtab'); return v === 'series' || v === 'settings' || v === 'usernames' ? v : 'calendar'; } catch { return 'calendar'; }
  });
  const setSubTab = (s: string) => {
    setSubTabState(s);
    try { localStorage.setItem('TOS_mocks_subtab', s); } catch { /* storage unavailable */ }
  };
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);

  // UI piece 1, revised Oct 28 (user's call): the panel is now a slide-in
  // drawer instead of a card below the calendar, so a tap always brings the
  // form to the front. The date field takes focus when the create drawer
  // opens, Escape closes it, and the picked calendar day keeps its orange
  // ring while the form is open.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creating) setPanel(null); };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const input = drawerRef.current?.querySelector<HTMLInputElement>('input[type="date"]');
      if (input) input.focus({ preventScroll: true });
    }, 350);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [panel, creating]);

  useEffect(() => {
    try { if (!localStorage.getItem('TOS_mocks_guide_seen')) setGuideOpen(true); } catch { /* storage unavailable */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // The shown month plus the next one, so the upcoming-14-days list
      // never misses a mock across a month boundary.
      const [a, b] = await Promise.all([
        api(`/api/tos/mocks?month=${month}`),
        api(`/api/tos/mocks?month=${shiftMonth(month, 1)}`),
      ]);
      const map: Record<string, Json> = {};
      for (const m of [...(a.mocks || []), ...(b.mocks || [])]) map[m.date] = m;
      setByDate(map);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load, refreshKey]); // a refresh must not close an open panel

  const { y, m, days, firstWeekday } = useMemo(() => monthRange(month), [month]);
  const monthLabel = useMemo(() => {
    const [yy, mm] = month.split('-').map(Number);
    return new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [month]);
  const cells: Array<{ date: string | null }> = useMemo(() => {
    const arr: Array<{ date: string | null }> = Array.from({ length: firstWeekday }, () => ({ date: null }));
    for (let d = 1; d <= days; d += 1) arr.push({ date: `${month}-${pad(d)}` });
    return arr;
  }, [month, days, firstWeekday]);
  const today = todayStr();

  const createOn = async (date: string) => {
    setPanel({ mode: 'create', date });
    setCreateError('');
  };

  useEffect(() => {
    if (openCreateSignal && openCreateSignal !== mocksCreateHandled) {
      mocksCreateHandled = openCreateSignal;
      setSubTab('calendar');
      createOn(todayStr());
    }
  }, [openCreateSignal]);

  // MB2: the Overview and Mock papers screens can send the admin here with
  // the create form already open. The signal is compared against a
  // module-level marker, because the component mounts fresh when the tab
  // switches, after the signal has already been bumped.

  const MOCK_SUBS = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'series', label: 'Series builder' },
    { id: 'usernames', label: 'Usernames' },
    { id: 'settings', label: 'Settings' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => createOn(todayStr())} className={btnPrimary}>
          <Plus className="w-4 h-4" /> New mock
        </button>
        <button onClick={() => setGuideOpen(true)} aria-label="How this works" title="How this works"
          className="p-2.5 rounded-xl border border-slate-700/60 text-slate-300 hover:text-white min-h-[44px] min-w-[44px]">
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
      {!byDate[today] && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <p className="text-xs text-amber-100 flex-1 min-w-[200px]">No mock scheduled for today. Students will see &quot;no mock today&quot;.</p>
          <button onClick={() => createOn(today)}
            className="text-xs font-black px-3 py-2 rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 min-h-[36px]">
            Create it
          </button>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {MOCK_SUBS.map((s) => (
          <button key={s.id} onClick={() => setSubTab(s.id)} className={`min-h-[44px] px-5 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap ${subTab === s.id ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'text-slate-400 border-white/10 hover:text-white'}`}>{s.label}</button>
        ))}
      </div>
      {subTab === 'calendar' && (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
            <p className="text-sm font-black text-white ml-2">{monthLabel}</p>
          </div>
          <button onClick={load} disabled={loading} className={btnGhost}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh</button>
        </div>
        {error && <p className="text-rose-300 text-sm mb-3">{error}</p>}
        <div className="grid grid-cols-7 gap-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <p key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center py-1">{d}</p>
          ))}
          {cells.map((c, i) => (
            <div key={i} className="min-h-[64px]">
              {c.date && (() => {
                const mk = byDate[c.date];
                const day = Number(c.date.slice(8));
                return (
                  <button
                    onClick={() => (mk ? setPanel({ mode: 'detail', id: mk.id }) : createOn(c.date as string))}
                    className={`w-full h-full min-h-[64px] rounded-xl border p-1.5 text-left transition-colors ${mk ? `${STATUS_STYLES[mk.status]} hover:brightness-125` : 'border-white/5 hover:border-orange-500/40 bg-white/[0.02]'} ${panel?.mode === 'create' && panel.date === c.date ? 'ring-2 ring-orange-400' : c.date === today ? 'ring-1 ring-orange-500/50' : ''}`}
                  >
                    <span className={`text-[11px] font-bold ${mk ? 'text-white' : 'text-slate-500'}`}>{day}</span>
                    {mk && <span className="block text-[9px] font-bold uppercase tracking-wider mt-0.5 truncate">{STATUS_LABELS[mk.status] || mk.status}</span>}
                  </button>
                );
              })()}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">Tap a free day to create a mock for that date, or a filled day to open it. One mock per day.</p>
      </Card>

      <UpcomingMocks byDate={byDate} onPick={(date, mk) => (mk ? setPanel({ mode: 'detail', id: mk.id }) : createOn(date))} />
    </div>
      )}
      {panel && (
        <div className="fixed inset-0 z-50 bg-slate-950 lg:bg-slate-950/80 lg:flex lg:justify-end" onClick={() => { if (!creating) setPanel(null); }}>
          <div ref={drawerRef} className="w-full lg:max-w-[480px] h-full bg-slate-950 border-l border-slate-800 overflow-y-auto p-5 lg:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-lg font-black text-white">{panel.mode === 'create' ? `New mock · ${panel.date}` : 'Mock'}</p>
              <button onClick={() => setPanel(null)} aria-label="Close panel" className="p-2 rounded-lg text-slate-400 hover:text-white min-h-[44px] min-w-[44px]"><X className="w-5 h-5" /></button>
            </div>
            {panel.mode === 'create' && (
              <>
                <MockForm
                  showDate
                  initial={{ ...emptyForm('jamb'), date: panel.date }}
                  busy={creating}
                  onSubmit={async (payload) => {
                    setCreating(true); setCreateError('');
                    try {
                      const r = await api('/api/tos/mocks', { method: 'POST', body: { ...payload, date: payload.date || panel.date } });
                      setPanel({ mode: 'detail', id: r.id });
                      await load();
                    } catch (e: any) { setCreateError(e.message); }
                    finally { setCreating(false); }
                  }}
                />
                {createError && <p className="text-rose-300 text-sm mt-3">{createError}</p>}
              </>
            )}
            {panel.mode === 'detail' && (
              <MockDetail mockId={panel.id} onChanged={load} onClose={() => setPanel(null)} />
            )}
          </div>
        </div>
      )}
      {subTab === 'series' && (
        <Card title="WAEC/NECO series builder">
          <p className="text-xs text-slate-400 mb-3">Creates a draft WAEC/NECO paper on a repeating pair of days each month. Preview the plan first; nothing is written until you confirm.</p>
          <SeriesPanel onCreated={load} />
        </Card>
      )}
      {subTab === 'usernames' && (
        <Card title="Leaderboard usernames">
          <UsernamePanel />
        </Card>
      )}
      {subTab === 'settings' && (
        <Card title="Mock settings">
          <SettingsPanel />
        </Card>
      )}
      <MocksGuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
};
