import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
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

// Last setup (Prompt P4a): the student's choices from their last visit on
// this device, so the next visit is one tap. Wrapped in try/catch because
// storage can be unavailable in private modes.
const LAST_SETUP_KEY = 'TOS_practice_last_setup';
interface LastSetup {
  examType: string;
  subject: string;
  topic: string;
  year: string;
  difficulty: string;
  length: string;
  mode: 'instant' | 'end';
  lastSubject?: string;
  lastTopic?: string;
  practisedAt?: number;
}

function readLastSetup(): LastSetup | null {
  try {
    const raw = localStorage.getItem(LAST_SETUP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    return v as LastSetup;
  } catch { return null; }
}

function writeLastSetup(v: LastSetup) {
  try { localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// Written by the in-progress session saver (Prompt P4c). A record here means
// the student left a session unfinished on this device.
const RESUME_KEY = 'TOS_practice_resume';

interface StudentPracticeProps {
  student: Student;
}

export const StudentPractice: React.FC<StudentPracticeProps> = ({ student }) => {
  const { activeCentre } = useApp();
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

  // Guided setup state (Prompt P4a): which step of the flow is on screen.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [topicSearch, setTopicSearch] = useState('');
  const [showMore, setShowMore] = useState(false);

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

  // Guided flow (P4a): subjects the bank carries, most recently practised first.
  const subjectChoices = useMemo(() => {
    const lastSub = readLastSetup()?.lastSubject || '';
    return [...matchedSubjects].sort((a, b) =>
      a === lastSub ? -1 : b === lastSub ? 1 : a.localeCompare(b));
  }, [matchedSubjects]);

  // Exam types the centre enables (audience types) that also exist in the
  // bank. A centre with none recorded, older setups included, gets whatever
  // the bank carries rather than an empty step.
  const centreExamTypes = useMemo(() => {
    const list = ((activeCentre?.audienceTypes || []) as string[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    return list.length > 0 ? list : null;
  }, [activeCentre]);
  const examChoices = useMemo(() => {
    const inBank = Array.from(new Set<string>(questions.map((q) => String(q.examType || 'jamb')))).sort((a, b) => a.localeCompare(b));
    const matched = centreExamTypes ? inBank.filter((et) => centreExamTypes.includes(et)) : inBank;
    return matched.length > 0 ? matched : inBank;
  }, [questions, centreExamTypes]);

  // Registered subjects the bank does not have yet (spelling differences, new subjects).
  const unmatchedRegistered = useMemo(() => {
    const bankLower = new Set(bankSubjects.map((sub) => sub.trim().toLowerCase()));
    return (student?.subjects || [])
      .map((sub) => String(sub).trim())
      .filter((sub) => Boolean(sub) && !bankLower.has(sub.toLowerCase()));
  }, [bankSubjects, student]);

  // Opens the profile tab with the subjects editor ready.
  const openProfileSubjects = () => {
    try { sessionStorage.setItem('EXCELLENCE_open_subject_editor', '1'); } catch {}
    try { window.location.hash = 'student/more'; } catch {}
  };

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q) => { if (q.year) set.add(q.year); });
    return [{ value: 'all', label: 'All years' }, ...Array.from(set).sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }))];
  }, [questions]);

  const topicChoices = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (!q.topic) return;
      if (q.subject !== subject) return;
      if (pipeline !== 'all' && q.examType !== pipeline) return;
      set.add(q.topic);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [questions, subject, pipeline]);

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

  // Session length chips (P4a): 10, 20, 40 or all. No counts shown to
  // students; a chip the current choices cannot fill is simply disabled.
  useEffect(() => {
    if (length !== 'all' && filtered.length < Number(length)) setLength('10');
  }, [length, filtered.length]);

  // Quiet refresh (P4a): while the student sits on the setup screen, re-check
  // the published pointer every few minutes and on returning to the tab. The
  // cache logic is unchanged and nothing appears on screen; an active session
  // is never disturbed.
  useEffect(() => {
    if (screen !== 'home') return;
    let alive = true;
    const check = async () => {
      try {
        const resp = await fetch('/api/public/questionbank/current?kind=practice');
        if (!resp.ok) return;
        const pointer = (await resp.json()) as Pointer;
        if (!pointer.version || !pointer.fileUrl || pointer.version === bank?.version) return;
        const bankResp = await fetch(pointer.fileUrl);
        if (!bankResp.ok) return;
        const payload = await bankResp.json();
        if (payload?.format !== 'tos-questionbank' || payload?.kind !== 'practice' || !Array.isArray(payload?.questions)) return;
        const clean = payload as BankPayload;
        writeCache(clean);
        if (!alive) return;
        setBank(clean);
        setPointerInfo(pointer);
      } catch { /* silent: never disturb the student */ }
    };
    const t = window.setInterval(check, 4 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [screen, bank?.version]);

  // Pre-fill from the student's last choices (P4a): runs once per entry to
  // the setup screen. With a single exam available the exam step is skipped.
  const prefillDone = useRef(false);
  useEffect(() => {
    if (screen !== 'home' || prefillDone.current) return;
    prefillDone.current = true;
    const last = readLastSetup();
    const exams = examChoices;
    if (last) {
      if (last.examType && exams.includes(last.examType)) setPipeline(last.examType);
      else if (exams.length === 1) setPipeline(exams[0]);
      if (last.subject && matchedSubjects.includes(last.subject)) setSubject(last.subject);
      if (last.topic) setTopic(last.topic);
      if (last.year) setYear(last.year);
      if (last.difficulty) setDifficulty(last.difficulty);
      if (last.length) setLength(last.length);
      if (last.mode === 'instant' || last.mode === 'end') setFeedbackMode(last.mode);
      setStep(exams.length === 1 ? 2 : 1);
    } else if (exams.length === 1) {
      setPipeline(exams[0]);
      setStep(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const startSession = () => {
    if (filtered.length === 0) return;
    const shuffled = shuffle(filtered);
    const picked = length === 'all' ? shuffled : shuffled.slice(0, Math.min(Number(length), shuffled.length));
    setSession(picked);
    setQIndex(0);
    setPicked(null);
    setAnswers({});
    setWrongOnly(false);
    // Remember the choices on this device (P4a) so the next visit is one tap.
    writeLastSetup({
      examType: pipeline, subject, topic, year, difficulty, length, mode: feedbackMode,
      lastSubject: subject, lastTopic: topic, practisedAt: Date.now(),
    });
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
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
          {registeredSubjects.length > 0
            ? `These are the ${registeredSubjects.length} subjects you registered for. Missing one?`
            : 'You have not registered any subjects yet.'}{' '}
          Update your subjects in Profile.
        </p>
        <button
          type="button"
          onClick={openProfileSubjects}
          className="w-full max-w-xs mx-auto h-11 rounded-2xl bg-[#EA580C] text-white text-xs font-extrabold hover:bg-[#C2410C] transition-colors cursor-pointer"
        >
          Update your subjects in Profile
        </button>
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
  // Guided setup (Prompt P4a): one choice per step, back arrow, thin progress
  // bar. Student language only, main text 14px+, helpers 12px, no bank jargon.
  const examSkipped = examChoices.length <= 1;
  const stepTotal = examSkipped ? 3 : 4;
  const stepPos = examSkipped ? step - 1 : step;
  const progressPct = Math.max(8, Math.min(100, Math.round((stepPos / stepTotal) * 100)));
  const lastSetup = readLastSetup();
  const quickCard = lastSetup?.lastSubject
    ? {
        subject: lastSetup.lastSubject,
        topic: lastSetup.lastTopic && lastSetup.lastTopic !== 'all' ? lastSetup.lastTopic : 'All topics',
      }
    : null;
  const quickStart = () => {
    if (!lastSetup) return;
    if (lastSetup.examType && examChoices.includes(lastSetup.examType)) setPipeline(lastSetup.examType);
    if (lastSetup.subject && matchedSubjects.includes(lastSetup.subject)) setSubject(lastSetup.subject);
    setTopic(lastSetup.topic || 'all');
    setYear(lastSetup.year || 'all');
    setDifficulty(lastSetup.difficulty || 'all');
    setLength(lastSetup.length || '10');
    if (lastSetup.mode === 'instant' || lastSetup.mode === 'end') setFeedbackMode(lastSetup.mode);
    setStep(4);
  };

  const stepHeader = (title: string, sub: string, onBack: (() => void) | null) => (
    <div className="flex items-start gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back a step"
          className="shrink-0 w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      ) : null}
      <div className="min-w-0 pt-0.5">
        <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
        <p className="text-sm text-slate-500 font-medium mt-0.5">{sub}</p>
      </div>
    </div>
  );

  const progressBar = (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full bg-[#EA580C] transition-all duration-300" style={{ width: `${progressPct}%` }} />
    </div>
  );

  // Empty bank: a friendly state, no bank jargon.
  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight">CBT Practice</h3>
        <p className="text-sm text-slate-500 leading-relaxed font-medium max-w-xs mx-auto">
          No practice questions are available yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {/* Step 1: choose your exam */}
      {step === 1 ? (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
          {stepHeader('Practice', 'Choose your exam to start.', null)}
          {progressBar}
          {quickCard ? (
            <button
              type="button"
              onClick={quickStart}
              className="w-full min-h-[56px] rounded-2xl border-2 border-[#EA580C]/40 bg-orange-50/60 px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:border-[#EA580C] transition-all cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-base font-extrabold text-[#0F172A]">Practise again</span>
                <span className="block text-xs text-slate-500 font-semibold mt-0.5 truncate">{quickCard.subject} · {quickCard.topic}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-[#EA580C] shrink-0" />
            </button>
          ) : null}
          <div className="space-y-2.5">
            {examChoices.map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => { setPipeline(et); setTopic('all'); setStep(2); }}
                className="w-full min-h-[60px] rounded-2xl border-2 border-[#E2E8F0] bg-white px-4 py-4 flex items-center justify-between text-left hover:border-[#EA580C] transition-all cursor-pointer"
              >
                <span className="text-base font-extrabold text-[#0F172A]">{pipelineLabel(et)}</span>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            ))}
            {examChoices.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium">No practice questions are available for your centre's exams yet. Check back soon.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Step 2: choose a subject */}
      {step === 2 ? (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
          {stepHeader('Choose a subject', 'Pick what you want to practise today.', examChoices.length > 1 ? () => setStep(1) : null)}
          {progressBar}
          {examSkipped && pipeline !== 'all' ? (
            <p className="text-xs font-bold text-slate-400">{pipelineLabel(pipeline)}</p>
          ) : null}
          <div className="space-y-2.5">
            {subjectChoices.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => { setSubject(sub); setTopic('all'); setStep(3); }}
                className="w-full min-h-[60px] rounded-2xl border-2 border-[#E2E8F0] bg-white px-4 py-4 flex items-center justify-between text-left hover:border-[#EA580C] transition-all cursor-pointer"
              >
                <span className="text-base font-extrabold text-[#0F172A]">{sub}</span>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            ))}
            {unmatchedRegistered.map((sub) => (
              <div key={sub} className="w-full min-h-[56px] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 flex items-center justify-between">
                <span className="text-base font-bold text-slate-400">{sub}</span>
                <span className="text-xs font-bold text-slate-400">Coming soon</span>
              </div>
            ))}
            {subjectChoices.length === 0 && unmatchedRegistered.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium">No subjects to practise yet.</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openProfileSubjects}
            className="w-full text-left px-1 h-11 flex items-center text-sm font-bold text-[#C2410C] underline underline-offset-2 cursor-pointer"
          >
            Missing a subject? Update it in Profile
          </button>
        </div>
      ) : null}

      {/* Step 3: choose a topic */}
      {step === 3 ? (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
          {stepHeader('Choose a topic', subject === 'all' ? 'What do you want to practise?' : subject, () => setStep(2))}
          {progressBar}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              placeholder="Search topics"
              className="w-full h-12 rounded-2xl border border-[#E2E8F0] bg-white pl-10 pr-3 text-[15px] font-semibold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C]"
            />
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => { setTopic('all'); setStep(4); }}
              className="w-full min-h-[56px] rounded-2xl border-2 border-[#EA580C] bg-orange-50/60 px-4 py-4 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="text-base font-extrabold text-[#0F172A]">All topics (mixed)</span>
              <ChevronRight className="w-5 h-5 text-[#EA580C] shrink-0" />
            </button>
            {topicChoices
              .filter((t) => t.toLowerCase().includes(topicSearch.trim().toLowerCase()))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTopic(t); setStep(4); }}
                  className="w-full min-h-[56px] rounded-2xl border-2 border-[#E2E8F0] bg-white px-4 py-4 flex items-center justify-between text-left hover:border-[#EA580C] transition-all cursor-pointer"
                >
                  <span className="text-base font-extrabold text-[#0F172A]">{t}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              ))}
            {topicChoices.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium">No topics here yet. Try another subject.</p>
            ) : topicSearch.trim() && topicChoices.every((t) => !t.toLowerCase().includes(topicSearch.trim().toLowerCase())) ? (
              <p className="text-sm text-slate-500 font-medium">No topic matches that search. Try All topics instead.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Step 4: ready */}
      {step === 4 ? (
        <>
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
            {stepHeader('Ready to practise', 'Two quick choices and you are off.', () => setStep(3))}
            {progressBar}
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-base font-extrabold text-[#0F172A]">
                {subject === 'all' ? 'All my subjects' : subject} · {topic === 'all' ? 'All topics' : topic} · {pipelineLabel(pipeline)}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-extrabold text-[#0F172A]">How many questions?</p>
              <div className="flex flex-wrap gap-2">
                {['10', '20', '40', 'all'].map((v) => {
                  const disabled = v === 'all' ? filtered.length === 0 : filtered.length < Number(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={disabled}
                      onClick={() => setLength(v)}
                      className={`h-11 px-4 rounded-full text-sm font-extrabold border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        length === v ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#CBD5E1]'
                      }`}
                    >
                      {v === 'all' ? 'All questions' : v}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-extrabold text-[#0F172A]">How do you want to practise?</p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setFeedbackMode('instant')}
                  className={`w-full min-h-[64px] rounded-2xl border-2 p-3.5 text-left transition-all cursor-pointer ${
                    feedbackMode === 'instant' ? 'bg-orange-50/60 border-[#EA580C]' : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <span className="block text-base font-extrabold text-[#0F172A]">Learn</span>
                  <span className="block text-xs text-slate-500 font-semibold mt-0.5">See the answer after each question</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackMode('end')}
                  className={`w-full min-h-[64px] rounded-2xl border-2 p-3.5 text-left transition-all cursor-pointer ${
                    feedbackMode === 'end' ? 'bg-orange-50/60 border-[#EA580C]' : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <span className="block text-base font-extrabold text-[#0F172A]">Test</span>
                  <span className="block text-xs text-slate-500 font-semibold mt-0.5">See all answers at the end</span>
                </button>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="text-sm font-bold text-[#C2410C] underline underline-offset-2 cursor-pointer"
              >
                {showMore ? 'Hide more options' : 'More options'}
              </button>
              {showMore ? (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-500 mb-1.5">Year</span>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C]"
                    >
                      {yearOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-bold text-slate-500 mb-1.5">Difficulty</span>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C]"
                    >
                      {difficultyOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-3 z-10">
            <div className="bg-white/95 backdrop-blur rounded-2xl border border-slate-200/90 shadow-lg p-3">
              {filtered.length === 0 ? (
                <div className="text-center space-y-2.5 py-1">
                  <p className="text-sm text-slate-500 font-medium px-2">No questions match these choices yet. Try All topics or any year.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTopic('all')}
                      className="flex-1 h-11 rounded-xl bg-slate-100 text-sm font-extrabold text-[#0F172A] cursor-pointer"
                    >
                      Use All topics
                    </button>
                    <button
                      type="button"
                      onClick={() => setYear('all')}
                      className="flex-1 h-11 rounded-xl bg-slate-100 text-sm font-extrabold text-[#0F172A] cursor-pointer"
                    >
                      Use any year
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startSession}
                  className="w-full h-14 rounded-2xl bg-[#EA580C] text-white text-base font-extrabold shadow-sm hover:bg-[#C2410C] cursor-pointer"
                >
                  Start practice
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
