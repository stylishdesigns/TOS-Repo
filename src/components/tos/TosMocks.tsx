import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Trash2,
  AlertTriangle, CheckCircle2, FileText, RefreshCw, X,
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

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  scheduled: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30',
  live: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  closed: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  released: 'bg-orange-500/15 text-orange-300 border-orange-400/30',
  archived: 'bg-slate-500/15 text-slate-400 border-slate-400/20',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', scheduled: 'Scheduled', live: 'Live', closed: 'Closed',
  released: 'Results out', archived: 'Archived', cancelled: 'Cancelled',
};

const EXAM_LABELS: Record<string, string> = { jamb: 'JAMB', waec_neco: 'WAEC/NECO' };

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

interface SubjectRow { subject: string; count: string; ids: string; }

const emptyForm = (examType: string): { title: string; examType: string; rows: SubjectRow[]; source: 'random' | 'picked' } => ({
  title: '', examType, rows: [{ subject: '', count: '', ids: '' }], source: 'random',
});

// ---------------------------------------------------------------------------
// Editor: the create and edit form. Subjects start empty; every subject and
// count is typed by the user. Hand-picked mocks take question ids per subject
// (copy them from the Library tab).
// ---------------------------------------------------------------------------
const MockForm: React.FC<{
  initial: { title: string; examType: string; rows: SubjectRow[]; source: 'random' | 'picked' };
  busy: boolean;
  onSubmit: (payload: Json) => void;
}> = ({ initial, busy, onSubmit }) => {
  const [title, setTitle] = useState(initial.title);
  const [examType, setExamType] = useState(initial.examType);
  const [rows, setRows] = useState<SubjectRow[]>(initial.rows);
  const [source, setSource] = useState<'random' | 'picked'>(initial.source);
  const [localError, setLocalError] = useState('');

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
    });
  };

  return (
    <div className="space-y-4">
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
              <div key={i} className="flex gap-2">
                <input className={inputCls} value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} placeholder="Subject name" maxLength={80} />
                <input className={`${inputCls} w-24 shrink-0`} value={r.count} inputMode="numeric"
                  onChange={(e) => setRow(i, { count: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Count" />
                {isJamb && rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-500 hover:text-rose-300" aria-label="Remove subject">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {!isJamb && <p className="text-xs text-slate-500">A WAEC/NECO mock is one paper: one subject for that day.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input className={inputCls} value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} placeholder="Subject name" maxLength={80} />
                  <input className={`${inputCls} w-24 shrink-0`} value={r.count} inputMode="numeric"
                    onChange={(e) => setRow(i, { count: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Count" />
                  {isJamb && rows.length > 1 && (
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-500 hover:text-rose-300" aria-label="Remove subject">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <textarea className={`${inputCls} h-20`} value={r.ids} onChange={(e) => setRow(i, { ids: e.target.value })}
                  placeholder="Paste the question ids from the Library tab, separated by spaces or commas" />
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

const MockDetail: React.FC<{ mockId: string; onChanged: () => void; onClose: () => void }> = ({ mockId, onChanged, onClose }) => {
  const [mock, setMock] = useState<Json | null>(null);
  const [loadError, setLoadError] = useState('');
  const [readiness, setReadiness] = useState<Json | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState<'' | 'schedule' | 'cancel'>('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPaper, setShowPaper] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(''); setReadiness(null); setEditing(false);
    try { setMock((await api(`/api/tos/mocks/${mockId}`)).mock); }
    catch (e: any) { setLoadError(e.message); }
  }, [mockId]);
  useEffect(() => { setMock(null); setShowPaper(false); load(); }, [load]);

  const runReadiness = async () => {
    setChecking(true); setNotice('');
    try { setReadiness(await api(`/api/tos/mocks/${mockId}/readiness`)); }
    catch (e: any) { setNotice(e.message); }
    finally { setChecking(false); }
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
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setEditing(true)} className={btnGhost}>Edit draft</button>
              <button onClick={runReadiness} disabled={checking} className={btnGhost}>
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-orange-400" />} Check readiness
              </button>
              <button onClick={() => { setConfirming('cancel'); setReadiness(null); }} className={btnGhost}>Cancel mock</button>
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

          {isDraft && readiness && ready && confirming !== 'schedule' && (
            <button onClick={() => setConfirming('schedule')} className={btnPrimary}><CalendarDays className="w-4 h-4" /> Schedule this mock</button>
          )}
          {isDraft && readiness && ready && confirming === 'schedule' && (
            <TypedConfirm word="SCHEDULE" label="Schedule" busy={busy} onConfirm={schedule} onCancel={() => setConfirming('')} />
          )}
          {isDraft && !readiness && confirming === 'schedule' && null}

          {confirming === 'cancel' && (
            <TypedConfirm word="CANCEL" label="Cancel mock" busy={busy} onConfirm={cancel} onCancel={() => setConfirming('')} />
          )}

          {isScheduled && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowPaper(!showPaper)} className={btnGhost}><FileText className="w-4 h-4" /> {showPaper ? 'Hide paper' : 'Preview paper'}</button>
              <button onClick={() => { setConfirming('cancel'); setShowPaper(false); }} className={btnGhost}>Cancel mock</button>
            </div>
          )}
          {isScheduled && showPaper && <Card title="Frozen paper"><PaperPreview mockId={mockId} /></Card>}

          {!isDraft && !isScheduled && (
            <div className="flex flex-wrap gap-2">
              {['live', 'closed', 'released', 'archived'].includes(mock.status) && (
                <button onClick={() => setShowPaper(!showPaper)} className={btnGhost}><FileText className="w-4 h-4" /> {showPaper ? 'Hide paper' : 'Preview paper'}</button>
              )}
              <p className="text-xs text-slate-500 self-center">A {STATUS_LABELS[mock.status] || mock.status} mock is read-only here.</p>
            </div>
          )}
          {!isDraft && !isScheduled && showPaper && <Card title="Frozen paper"><PaperPreview mockId={mockId} /></Card>}

          {notice && <p className="text-sm text-orange-300">{notice}</p>}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The tab: month calendar with a side panel for create and detail.
// ---------------------------------------------------------------------------
export const MocksTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [byDate, setByDate] = useState<Record<string, Json>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Json>(null); // {mode:'create', date} | {mode:'detail', id}
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api(`/api/tos/mocks?month=${month}`);
      const map: Record<string, Json> = {};
      for (const m of r.mocks || []) map[m.date] = m;
      setByDate(map);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { setPanel(null); load(); }, [load, refreshKey]);

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

  return (
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
                    className={`w-full h-full min-h-[64px] rounded-xl border p-1.5 text-left transition-colors ${mk ? `${STATUS_STYLES[mk.status]} hover:brightness-125` : 'border-white/5 hover:border-orange-500/40 bg-white/[0.02]'} ${c.date === today ? 'ring-1 ring-orange-500/50' : ''}`}
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

      <Card title={panel?.mode === 'create' ? `New mock · ${panel.date}` : panel?.mode === 'detail' ? 'Mock' : 'Mocks'}>
        {!panel && (
          <p className="text-sm text-slate-400">Pick a day on the calendar to create a mock, or open an existing one. Scheduling freezes the paper: questions are drawn from the mock bank and the marking key stays on the server.</p>
        )}
        {panel?.mode === 'create' && (
          <>
            <MockForm
              initial={emptyForm('jamb')}
              busy={creating}
              onSubmit={async (payload) => {
                setCreating(true); setCreateError('');
                try {
                  const r = await api('/api/tos/mocks', { method: 'POST', body: { ...payload, date: panel.date } });
                  setPanel({ mode: 'detail', id: r.id });
                  await load();
                } catch (e: any) { setCreateError(e.message); }
                finally { setCreating(false); }
              }}
            />
            {createError && <p className="text-rose-300 text-sm mt-3">{createError}</p>}
          </>
        )}
        {panel?.mode === 'detail' && (
          <MockDetail mockId={panel.id} onChanged={load} onClose={() => setPanel(null)} />
        )}
      </Card>
    </div>
  );
};
