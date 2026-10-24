import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ImageIcon,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';

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

const CACHE_KEY = 'EXCELLENCE_practice_bank_cache';

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

export const StudentPractice: React.FC = () => {
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

  // Session state
  const [session, setSession] = useState<BankQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setScreen('loading');
    setErrorMsg('');
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

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => { if (q.subject) set.add(q.subject); });
    return [{ value: 'all', label: 'All subjects' }, ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((s) => ({ value: s, label: s }))];
  }, [questions]);

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
    const picked = length === 'all' ? filtered : filtered.slice(0, Math.min(Number(length), filtered.length));
    setSession(shuffle(picked));
    setQIndex(0);
    setPicked(null);
    setAnswers({});
    setScreen('session');
  };

  const q = session[qIndex];

  const choose = (key: string) => {
    if (picked || !q) return;
    setPicked(key);
    setAnswers((prev) => ({ ...prev, [q.id]: key }));
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
            The practice bank has not been published yet. Once your centre's questions go live, practice appears here.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ session
  if (screen === 'session' && q) {
    const isCorrect = picked !== null && picked === q.correct;
    const optionKeys = Object.keys(q.options).sort();
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
              style={{ width: `${((qIndex + (picked ? 1 : 0)) / session.length) * 100}%` }}
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
            const chosen = picked === key;
            const isAnswer = key === q.correct;
            const showState = picked !== null;
            let cls = 'bg-white border-[#E2E8F0] text-[#0F172A]';
            if (showState && isAnswer) cls = 'bg-emerald-50 border-emerald-300 text-emerald-900';
            else if (showState && chosen && !isAnswer) cls = 'bg-red-50 border-red-300 text-red-900';
            else if (showState) cls = 'bg-white border-[#E2E8F0] text-slate-400';
            return (
              <button
                key={key}
                type="button"
                disabled={picked !== null}
                onClick={() => choose(key)}
                className={`w-full min-h-[44px] rounded-2xl border p-3.5 text-left flex items-start gap-3 transition-all cursor-pointer disabled:cursor-default ${cls}`}
              >
                <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                  showState && isAnswer ? 'bg-emerald-500 text-white' : showState && chosen ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {key}
                </span>
                <span className="text-sm font-semibold leading-snug pt-0.5">{q.options[key]}</span>
                {showState && isAnswer ? <CheckCircle2 className="w-5 h-5 ml-auto shrink-0 text-emerald-500" /> : null}
                {showState && chosen && !isAnswer ? <XCircle className="w-5 h-5 ml-auto shrink-0 text-red-500" /> : null}
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {picked !== null ? (
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

        {/* Next */}
        <button
          type="button"
          disabled={picked === null}
          onClick={next}
          className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-extrabold transition-all ${
            picked === null
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-[#EA580C] text-white shadow-sm hover:bg-[#C2410C] cursor-pointer'
          }`}
        >
          {qIndex + 1 >= session.length ? 'See results' : 'Next question'}
          <ChevronRight className="w-4 h-4" />
        </button>

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
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-5">
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
        <div className="flex flex-col gap-2.5 max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => { setScreen('home'); }}
            className="h-12 rounded-2xl bg-white border border-[#E2E8F0] text-[#0F172A] text-sm font-extrabold hover:border-[#CBD5E1] cursor-pointer"
          >
            Practice again
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
