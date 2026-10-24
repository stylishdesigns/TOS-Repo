import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { Student } from '../../../types';

interface BankQuestion {
  id: string;
  examType: string;
  subject: string;
  klass: string;
  topic: string;
  year: number | null;
  difficulty: string;
  text: string;
  options: Record<string, string>;
  correct: string;
  explanation: string;
  imageLink: string;
}

interface BankPayload {
  format: string;
  kind: string;
  version: number;
  publishedAt: string;
  count: number;
  subjects: Record<string, number>;
  questions: BankQuestion[];
}

interface Pointer {
  version: number;
  fileUrl?: string;
  publishedAt?: string;
  liveCount?: number;
  subjects?: Record<string, number>;
}

type Screen = 'loading' | 'noBank' | 'error' | 'home' | 'session' | 'done';

const CACHE_KEY = 'TOS_practice_bank_cache';
/** Centre-named key from the first build; cleaned up on the next load. */
const LEGACY_CACHE_KEY = 'EXCELLENCE_practice_bank_cache';

/** Display name for the two exam pipelines; anything unknown falls back to caps. */
function pipelineLabel(examType: string): string {
  if (examType === 'jamb') return 'JAMB';
  if (examType === 'waec_neco') return 'WAEC / NECO';
  return examType.toUpperCase();
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function readCache(version: number): BankPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === version && parsed?.bank?.format === 'tos-questionbank' && Array.isArray(parsed.bank.questions)) {
      return parsed.bank as BankPayload;
    }
  } catch {
    /* ignore broken cache, re-download */
  }
  return null;
}

function writeCache(bank: BankPayload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: bank.version, savedAt: Date.now(), bank }));
  } catch {
    /* storage full or unavailable: practice still works for this visit */
  }
}

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-9 px-3.5 rounded-full text-xs font-extrabold transition-all cursor-pointer border ${
      active
        ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-xs'
        : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]'
    }`}
  >
    {children}
  </button>
);

const Select: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, options, onChange, disabled }) => (
  <label className="block">
    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] disabled:opacity-50 disabled:bg-slate-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </label>
);

interface StudentPracticeProps {
  student: Student;
}

export const StudentPractice: React.FC<StudentPracticeProps> = ({ student }) => {
  const [screen, setScreen] = useState<Screen>('loading');
  const [bank, setBank] = useState<BankPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pointerInfo, setPointerInfo] = useState<Pointer | null>(null);

  // Filters
  const [pipeline, setPipeline] = useState<string>('all');
  const [subject, setSubject] = useState<string>('all');
  const [year, setYear] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [length, setLength] = useState<string>('10');
  const [feedbackMode, setFeedbackMode] = useState<'instant' | 'end'>('instant');
  const [wrongOnly, setWrongOnly] = useState(false);

  // Session state
  const [session, setSession] = useState<BankQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setScreen('loading');
    setErrorMsg('');
    try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch { /* ignore */ }
    try {
      const resp = await fetch('/api/public/questionbank/current?kind=practice');
      if (!resp.ok) throw new Error(`pointer ${resp.status}`);
      const pointer = (await resp.json()) as Pointer;
      setPointerInfo(pointer);
      if (!pointer.version || !pointer.fileUrl) {
        setBank(null);
        setScreen('noBank');
        return;
      }
      const cached = readCache(pointer.version);
      if (cached) {
        setBank(cached);
        setScreen('home');
        return;
      }
      const bankResp = await fetch(pointer.fileUrl);
      if (!bankResp.ok) throw new Error(`bank ${bankResp.status}`);
      const payload = await bankResp.json();
      if (payload?.format !== 'tos-questionbank' || payload?.kind !== 'practice' || !Array.isArray(payload?.questions)) {
        throw new Error('unexpected bank payload');
      }
      const clean = payload as BankPayload;
      writeCache(clean);
      setBank(clean);
      setScreen('home');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Something went wrong.');
      setScreen('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const questions = bank?.questions ?? [];

  // Registered subjects, normalised so matching ignores case and extra spaces.
  const registeredSubjects = useMemo(
    () => (student?.subjects || []).map((sub) => String(sub).trim().toLowerCase()).filter(Boolean),
    [student]
  );
  const bankSubjects = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => { if (q.subject) set.add(q.subject); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [questions]);
  const matchedSubjects = useMemo(
    () => bankSubjects.filter((sub) => registeredSubjects.includes(sub.trim().toLowerCase())),
    [bankSubjects, registeredSubjects]
  );
  const subjectsBlocked = registeredSubjects.length === 0 || matchedSubjects.length === 0;

  const subjectOptions = useMemo(
    () => [{ value: 'all', label: 'All my subjects' }, ...matchedSubjects.map((sub) => ({ value: sub, label: sub }))],
    [matchedSubjects]
  );

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q) => { if (q.year) set.add(q.year); });
    return [{ value: 'all', label: 'All years' }, ...Array.from(set).sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }))];
  }, [questions]);

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (!q.topic) return;
      if (subject !== 'all' && q.subject !== subject) return;
      set.add(q.topic);
    });
    return [{ value: 'all', label: 'All topics' }, ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }))];
  }, [questions, subject]);

  const difficultyOptions = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => { if (q.difficulty) set.add(q.difficulty); });
    return [{ value: 'all', label: 'Any difficulty' }, ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))];
  }, [questions]);

  const filtered = useMemo(() => questions.filter((q) => {
    if (registeredSubjects.length > 0 && !registeredSubjects.includes(String(q.subject).trim().toLowerCase())) return false;
    if (pipeline !== 'all' && q.examType !== pipeline) return false;
    if (subject !== 'all' && q.subject !== subject) return false;
    if (year !== 'all' && String(q.year) !== year) return false;
    if (topic !== 'all' && q.topic !== topic) return false;
    if (difficulty !== 'all' && q.difficulty !== difficulty) return false;
    return true;
  }), [questions, pipeline, subject, year, topic, difficulty]);

  const lengthOptions = useMemo(() => {
    const opts: { value: string; label: string; disabled: boolean }[] = [];
    [10, 25, 50].forEach((n) => opts.push({ value: String(n), label: `${n} questions`, disabled: filtered.length < n }));
    opts.push({ value: 'all', label: `All ${filtered.length}`, disabled: filtered.length === 0 });
    return opts;
  }, [filtered.length]);

  useEffect(() => {
    const current = lengthOptions.find((o) => o.value === length);
    if (current?.disabled) setLength('10');
  }, [lengthOptions, length]);

  const startSession = () => {
    if (filtered.length === 0) return;
    const shuffled = shuffle(filtered);
    const picked = length === 'all' ? shuffled : shuffled.slice(0, Math.min(Number(length), shuffled.length));
    setSession(picked);
    setQIndex(0);
    setPicked(null);
    setAnswers({});
    setWrongOnly(false);
    setScreen('session');
  };

  const q = session[qIndex];

  const choose = (key: string) => {
    if (!q) return;
    if (feedbackMode === 'instant') {
      if (picked) return;
      setPicked(key);
    }
    setAnswers((prev) => ({ ...prev, [q.id]: key }));
  };

  const back = () => {
    if (qIndex === 0) return;
    setQIndex((i) => i - 1);
    setPicked(null);
  };

  const next = () => {
    if (qIndex + 1 >= session.length) {
      setScreen('done');
    } else {
      setQIndex((i) => i + 1);
      setPicked(null);
    }
  };

  const score = useMemo(() => {
    let correct = 0;
    session.forEach((sq) => {
      if (answers[sq.id] && answers[sq.id] === sq.correct) correct += 1;
    });
    return { correct, total: session.length };
  }, [session, answers]);

  const resetFilters = () => {
    setPipeline('all'); setSubject('all'); setYear('all'); setTopic('all'); setDifficulty('all'); setLength('10');
  };

  // ------------------------------------------------------------------ loading
  if (screen === 'loading') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
        <p className="text-xs text-slate-500 font-medium">Loading your practice bank...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------- error
  if (screen === 'error') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-xs mx-auto">
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Practice could not load</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            The question bank could not be reached. Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#0F172A] text-white text-xs font-extrabold cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------- noBank
  if (screen === 'noBank') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-xs mx-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
            <Sparkles className="w-3 h-3" />
            <span>Question Bank</span>
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">CBT Practice</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Practice questions are not available yet. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------- no matching subjects
  if (screen === 'home' && subjectsBlocked) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-xs mx-auto">
          <h3 className="text-lg font-black text-slate-900 tracking-tight">CBT Practice</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Ask your centre to register your subjects.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ session
  if (screen === 'session' && q) {
    const endMode = feedbackMode === 'end';
    const selected = endMode ? (answers[q.id] || null) : picked;
    const isCorrect = !endMode && picked !== null && picked === q.correct;
    const optionKeys = Object.keys(q.options).sort();
    const isLast = qIndex + 1 >= session.length;
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-slate-900">Question {qIndex + 1} of {session.length}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {pipelineLabel(q.examType)} · {q.subject}{q.year ? ` · ${q.year}` : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#EA580C] transition-all duration-300"
              style={{ width: `${((qIndex + (selected ? 1 : 0)) / session.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
          <p className="text-sm font-bold text-slate-900 leading-relaxed whitespace-pre-wrap">{q.text}</p>
          {q.imageLink ? (
            <img
              src={q.imageLink}
              alt="Question illustration"
              loading="lazy"
              className="w-full max-h-64 object-contain rounded-xl border border-slate-100 bg-slate-50"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : null}
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {optionKeys.map((key) => {
            const chosen = selected === key;
            const isAnswer = key === q.correct;
            let cls = 'bg-white border-[#E2E8F0] text-[#0F172A]';
            if (endMode) {
              if (chosen) cls = 'bg-orange-50/70 border-[#EA580C] text-[#0F172A]';
            } else {
              const showState = picked !== null;
              if (showState && isAnswer) cls = 'bg-emerald-50 border-emerald-300 text-emerald-900';
              else if (showState && chosen && !isAnswer) cls = 'bg-red-50 border-red-300 text-red-900';
              else if (showState) cls = 'bg-white border-[#E2E8F0] text-slate-400';
            }
            const keyCls = endMode
              ? (chosen ? 'bg-[#EA580C] text-white' : 'bg-slate-100 text-slate-600')
              : ((picked !== null && isAnswer) ? 'bg-emerald-500 text-white' : (picked !== null && chosen) ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600');
            return (
              <button
                key={key}
                type="button"
                disabled={!endMode && picked !== null}
                onClick={() => choose(key)}
                className={`w-full min-h-[44px] rounded-2xl border p-3.5 text-left flex items-start gap-3 transition-all cursor-pointer disabled:cursor-default ${cls}`}
              >
                <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${keyCls}`}>
                  {key}
                </span>
                <span className="text-sm font-semibold leading-snug pt-0.5">{q.options[key]}</span>
                {!endMode && picked !== null && isAnswer ? <CheckCircle2 className="w-5 h-5 ml-auto shrink-0 text-emerald-500" /> : null}
                {!endMode && picked !== null && chosen && !isAnswer ? <XCircle className="w-5 h-5 ml-auto shrink-0 text-red-500" /> : null}
              </button>
            );
          })}
        </div>

        {/* Feedback (instant mode only) */}
        {!endMode && picked !== null ? (
          <div className={`rounded-2xl border p-4 space-y-2 ${isCorrect ? 'bg-emerald-50/70 border-emerald-200' : 'bg-red-50/70 border-red-200'}`}>
            <div className={`flex items-center gap-2 text-xs font-extrabold ${isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
              {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {isCorrect ? 'Correct!' : `Not quite. The answer is ${q.correct}.`}
            </div>
            {q.explanation ? (
              <p className="text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{q.explanation}</p>
            ) : null}
          </div>
        ) : null}

        {/* Navigation */}
        <div className={`flex gap-2.5 ${endMode ? '' : 'flex-col'}`}>
          {endMode ? (
            <button
              type="button"
              disabled={qIndex === 0}
              onClick={back}
              className={`flex-1 h-12 rounded-2xl flex items-center justify-center text-sm font-extrabold transition-all ${
                qIndex === 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border border-[#E2E8F0] text-[#0F172A] hover:border-[#CBD5E1] cursor-pointer'
              }`}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            disabled={endMode ? selected === null : picked === null}
            onClick={next}
            className={`flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-extrabold transition-all ${
              (endMode ? selected === null : picked === null)
                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-[#EA580C] text-white shadow-sm hover:bg-[#C2410C] cursor-pointer'
            }`}
          >
            {isLast ? 'Finish' : 'Next question'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setScreen('home')}
          className="w-full h-11 rounded-2xl text-xs font-extrabold text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          Leave practice
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------- done
  if (screen === 'done') {
    const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
    const reviewRows = session
      .map((sq, i) => ({
        q: sq,
        i,
        given: answers[sq.id] || '',
        ok: Boolean(answers[sq.id]) && answers[sq.id] === sq.correct,
      }))
      .sort((a, b) => Number(a.ok) - Number(b.ok) || a.i - b.i);
    const visibleRows = wrongOnly ? reviewRows.filter((r) => !r.ok) : reviewRows;
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-3">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-sm ${
            pct >= 70 ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : pct >= 50 ? 'bg-orange-50 border border-orange-100 text-[#EA580C]' : 'bg-red-50 border border-red-100 text-red-600'
          }`}>
            <span className="text-2xl font-black">{pct}%</span>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Practice complete</h3>
            <p className="text-xs text-slate-500 font-medium">
              You answered {score.correct} of {score.total} questions correctly.
            </p>
          </div>
        </div>

        {/* Review header + filter */}
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Review your answers</h4>
          <button
            type="button"
            onClick={() => setWrongOnly((v) => !v)}
            className={`h-9 px-3.5 rounded-full text-xs font-extrabold border transition-all cursor-pointer ${
              wrongOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            Wrong only
          </button>
        </div>

        {/* Review rows: wrong first */}
        <div className="space-y-2.5">
          {visibleRows.map(({ q: sq, i, given, ok }) => (
            <div key={sq.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  #{i + 1} · {pipelineLabel(sq.examType)} · {sq.subject}{sq.year ? ` · ${sq.year}` : ''}
                </span>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {ok ? 'Correct' : given ? 'Wrong' : 'Not answered'}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900 leading-snug whitespace-pre-wrap">{sq.text}</p>
              {sq.imageLink ? (
                <img
                  src={sq.imageLink}
                  alt="Question illustration"
                  loading="lazy"
                  className="w-full max-h-48 object-contain rounded-xl border border-slate-100 bg-slate-50"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : null}
              <div className="space-y-1 text-xs font-semibold">
                <p className={ok ? 'text-slate-600' : 'text-red-700'}>
                  Your answer: {given ? `${given}. ${sq.options[given] || ''}` : 'Not answered'}
                </p>
                {!ok ? (
                  <p className="text-emerald-700">Correct answer: {sq.correct}. {sq.options[sq.correct] || ''}</p>
                ) : null}
              </div>
              {sq.explanation ? (
                <p className="text-xs text-slate-500 leading-relaxed font-medium whitespace-pre-wrap">{sq.explanation}</p>
              ) : null}
            </div>
          ))}
          {visibleRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 text-center">
              <p className="text-xs font-bold text-emerald-700">Nothing wrong in this session. Well done!</p>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={startSession}
            className="w-full h-12 rounded-2xl bg-[#EA580C] text-white text-sm font-extrabold shadow-sm hover:bg-[#C2410C] cursor-pointer"
          >
            Practise again
          </button>
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="w-full h-12 rounded-2xl bg-white border border-[#E2E8F0] text-[#0F172A] text-sm font-extrabold hover:border-[#CBD5E1] cursor-pointer"
          >
            Back to setup
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------- home
  const bankPill = pointerInfo?.publishedAt
    ? `Updated ${new Date(pointerInfo.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null;
  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              <span>Question Bank</span>
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">CBT Practice</h3>
            <p className="text-xs text-slate-500 font-medium">
              Untimed practice from the live question bank. Answers are marked as you go.
            </p>
          </div>
          <div className="text-right shrink-0 space-y-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Bank v{pointerInfo?.version ?? bank?.version}</div>
            {bankPill ? <div className="text-[10px] font-bold text-slate-400">{bankPill}</div> : null}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
        <div className="space-y-2">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Exam pipeline</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={pipeline === 'all'} onClick={() => setPipeline('all')}>All</Chip>
            {Array.from(new Set<string>(questions.map((q2) => q2.examType))).sort().map((et) => (
              <Chip key={et} active={pipeline === et} onClick={() => setPipeline(et)}>{pipelineLabel(et)}</Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Subject" value={subject} options={subjectOptions} onChange={(v) => { setSubject(v); setTopic('all'); }} />
          <Select label="Year" value={year} options={yearOptions} onChange={setYear} />
          <Select label="Topic" value={topic} options={topicOptions} onChange={setTopic} />
          <Select label="Difficulty" value={difficulty} options={difficultyOptions} onChange={setDifficulty} />
        </div>

        <div className="space-y-2">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Answer feedback</span>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setFeedbackMode('instant')}
              className={`min-h-[52px] rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                feedbackMode === 'instant' ? 'bg-slate-50 border-[#0F172A]' : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
              }`}
            >
              <span className="block text-xs font-extrabold text-[#0F172A]">Show answers after each question</span>
              <span className="block text-[10px] text-slate-500 font-medium">The correct answer and explanation appear right away.</span>
            </button>
            <button
              type="button"
              onClick={() => setFeedbackMode('end')}
              className={`min-h-[52px] rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                feedbackMode === 'end' ? 'bg-slate-50 border-[#0F172A]' : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
              }`}
            >
              <span className="block text-xs font-extrabold text-[#0F172A]">Show answers at the end</span>
              <span className="block text-[10px] text-slate-500 font-medium">Answer everything, change your mind any time, results after Finish.</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Session length</span>
          <div className="flex flex-wrap gap-2">
            {lengthOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => setLength(o.value)}
                className={`h-9 px-3.5 rounded-full text-xs font-extrabold border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  length === o.value
                    ? 'bg-[#0F172A] text-white border-[#0F172A]'
                    : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Start */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-black text-slate-900">
            {filtered.length === 0 ? 'No questions match' : `${filtered.length} question${filtered.length === 1 ? '' : 's'} ready`}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            {filtered.length === 0 ? 'Loosen a filter or two to get some practice questions.' : 'Untimed. Feedback and explanations after each answer.'}
          </p>
        </div>
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={startSession}
          className={`shrink-0 h-11 px-5 rounded-full text-xs font-extrabold ${
            filtered.length === 0
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-[#EA580C] text-white shadow-sm hover:bg-[#C2410C] cursor-pointer'
          }`}
        >
          Start
        </button>
      </div>

      <button
        type="button"
        onClick={load}
        className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Check for a newer bank
      </button>
    </div>
  );
};
