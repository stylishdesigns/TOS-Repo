import React, { useEffect, useReducer } from 'react';
import { BarChart3, CalendarDays, Home, MonitorSmartphone, Sparkles } from 'lucide-react';
import { COACH_PROMPTS, COACH_REPLIES } from './landingContent';
import {
  APPLICANTS, CLASSMATES, DRAFT_QUESTIONS, PAYMENTS, QUIZ, heroReducer, initialHeroState, presentCount,
  quizFeedback, quizScoreText, type HeroAction, type HeroState, type Role,
} from './heroState';

const ROLES: { key: Role; label: string }[] = [
  { key: 'student', label: 'Student' },
  { key: 'tutor', label: 'Tutor' },
  { key: 'admin', label: 'Admin' },
];

type Dispatch = (a: HeroAction) => void;
type Tone = 'plain' | 'primary' | 'ok';
const TONES: Record<Tone, string> = {
  plain: 'bg-white border-slate-300 text-slate-900 hover:border-orange-500',
  primary: 'bg-orange-700 border-orange-700 text-white hover:bg-orange-600',
  ok: 'bg-green-100 border-green-300 text-green-800',
};
const Btn: React.FC<{ tone?: Tone; onClick: () => void; children: React.ReactNode; className?: string; pressed?: boolean }> = ({
  tone = 'plain', onClick, children, className = '', pressed,
}) => (
  <button type="button" onClick={onClick} aria-pressed={pressed} className={`min-h-[40px] px-3 rounded-lg border text-xs font-extrabold transition-colors ${TONES[tone]} ${className}`}>
    {children}
  </button>
);

const Card: React.FC<{ children: React.ReactNode; tint?: boolean }> = ({ children, tint }) => (
  <div className={`mt-2 rounded-xl border p-2.5 ${tint ? 'bg-orange-50 border-orange-300' : 'bg-white border-slate-200'}`}>{children}</div>
);
const Line: React.FC<{ a: string; b?: string; right?: React.ReactNode }> = ({ a, b, right }) => (
  <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
    <span className="flex-1 min-w-0"><b className="block text-[13px] font-bold">{a}</b>{b && <span className="text-xs text-slate-500">{b}</span>}</span>
    {right}
  </div>
);
const Title: React.FC<{ kick: string; title: string }> = ({ kick, title }) => (
  <><p className="text-xs font-semibold text-slate-500">{kick}</p><p className="text-lg font-black leading-tight">{title}</p></>
);
const Bars: React.FC = () => (
  <>
    {[['Maths', 78, 'bg-green-700'], ['Chemistry', 46, 'bg-orange-700'], ['English', 84, 'bg-green-700']].map(([s, w, c]) => (
      <div key={String(s)} className="mt-2 flex items-center gap-2">
        <span className="w-16 text-xs font-semibold">{s}</span>
        <span className="h-2 flex-1 rounded bg-slate-200"><span className={`block h-full rounded ${c}`} style={{ width: `${w}%` }} /></span>
      </div>
    ))}
  </>
);

const NavBtn: React.FC<{ label: string; icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ label, icon, active, onClick }) => (
  <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
    className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'}`}>
    {icon}{label}
  </button>
);
const Shell: React.FC<{ body: React.ReactNode; nav: React.ReactNode }> = ({ body, nav }) => (
  <div className="mx-auto w-[268px] overflow-hidden rounded-[38px] border-[8px] border-slate-700 bg-slate-50 text-left text-slate-900 shadow-2xl shadow-black/40">
    <div className="h-[430px] overflow-y-auto p-4">{body}</div>
    <div className="flex h-16 items-center justify-around bg-slate-950">{nav}</div>
  </div>
);

const StudentView: React.FC<{ s: HeroState; d: Dispatch; onReserve: () => void }> = ({ s, d, onReserve }) => {
  const q = QUIZ[Math.min(s.quiz.index, QUIZ.length - 1)];
  const answered = s.quiz.picked !== null;
  const screens: Record<string, React.ReactNode> = {
    home: (
      <>
        <Title kick="Good morning" title="Welcome back" />
        <Line a="Chemistry, 10:00 AM" b="Next class, Room 2" />
        <Card><b className="text-[13px]">Your results</b><Bars /></Card>
      </>
    ),
    classes: (
      <>
        <Title kick="Timetable" title="This week" />
        {[['Mathematics', 'Monday, 9:00 AM'], ['Chemistry', 'Tuesday, 10:00 AM'], ['English', 'Wednesday, 11:00 AM'], ['Physics', 'Thursday, 2:00 PM']].map(([a, b]) => <Line key={a} a={a} b={b} />)}
      </>
    ),
    results: (
      <>
        <Title kick="Results" title="How you are doing" />
        <Card><Bars /></Card>
        <Card tint><b className="text-[13px]">Weakest topic</b><p className="text-xs text-slate-600">Mole calculations in Chemistry. Tap the glowing button to ask the study coach.</p></Card>
      </>
    ),
    ai: (
      <>
        <Title kick="AI study coach" title="Ask me anything" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COACH_PROMPTS.map((p) => <Btn key={p.key} tone={s.coach === p.key ? 'primary' : 'plain'} pressed={s.coach === p.key} onClick={() => d({ type: 'coach', key: p.key })}>{p.label}</Btn>)}
        </div>
        <Card><p className="text-xs text-slate-500">{COACH_PROMPTS.find((p) => p.key === s.coach)!.label}</p></Card>
        <Card tint><b className="text-[13px]">Coach</b><p className="text-xs leading-relaxed">{COACH_REPLIES[s.coach]}</p></Card>
      </>
    ),
    cbt: (
      <>
        <Title kick="Quick practice" title="Try a CBT question" />
        {!s.quiz.finished ? (
          <>
            <Card><span className="text-xs text-slate-500">Question {s.quiz.index + 1} of {QUIZ.length}</span><b className="mt-1 block text-[13px]">{q.q}</b></Card>
            {q.options.map((o, i) => {
              const tone = answered ? (i === q.answer ? 'border-green-700 bg-green-100' : i === s.quiz.picked ? 'border-red-700 bg-red-100' : 'border-slate-300 bg-white') : 'border-slate-300 bg-white hover:border-orange-500';
              return <button key={o} type="button" onClick={() => d({ type: 'pick', option: i })} className={`mt-2 min-h-[44px] w-full rounded-xl border px-3 text-left text-[13px] font-bold ${tone}`}>{o}</button>;
            })}
            {answered && (
              <>
                <p role="status" className="mt-2.5 text-[13px] font-bold">{quizFeedback(s)}</p>
                <Btn tone="primary" className="mt-2" onClick={() => d({ type: 'next' })}>{s.quiz.index >= QUIZ.length - 1 ? 'See my score' : 'Next question'}</Btn>
              </>
            )}
          </>
        ) : (
          <Card>
            <p className="text-lg font-black">{quizScoreText(s)}</p>
            <p className="mb-3 mt-1 text-xs text-slate-500">Your centre can set exams like this for every class.</p>
            <Btn tone="primary" onClick={onReserve}>Reserve a seat for your centre</Btn>
            <Btn className="ml-2" onClick={() => d({ type: 'retry' })}>Try again</Btn>
          </Card>
        )}
      </>
    ),
  };
  const nav = (
    <>
      <NavBtn label="Home" icon={<Home className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.student === 'home'} onClick={() => d({ type: 'student', screen: 'home' })} />
      <NavBtn label="Classes" icon={<CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.student === 'classes'} onClick={() => d({ type: 'student', screen: 'classes' })} />
      <button type="button" aria-label="Ask the AI study coach" onClick={() => d({ type: 'student', screen: 'ai' })}
        className={`-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-slate-950 bg-gradient-to-br from-orange-600 to-orange-900 text-white ${s.student === 'ai' ? 'ring-2 ring-orange-400' : ''}`}>
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>
      <NavBtn label="CBT" icon={<MonitorSmartphone className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.student === 'cbt'} onClick={() => d({ type: 'student', screen: 'cbt' })} />
      <NavBtn label="Results" icon={<BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.student === 'results'} onClick={() => d({ type: 'student', screen: 'results' })} />
    </>
  );
  return <Shell body={screens[s.student]} nav={nav} />;
};

const TutorView: React.FC<{ s: HeroState; d: Dispatch }> = ({ s, d }) => {
  const screens: Record<string, React.ReactNode> = {
    classes: (
      <>
        <Title kick="Chemistry, SS3" title="Take attendance" />
        {CLASSMATES.map((n, i) => (
          <Line key={n} a={n} right={<Btn tone={s.present[i] ? 'ok' : 'plain'} pressed={s.present[i]} onClick={() => d({ type: 'present', index: i })}>{s.present[i] ? 'Present' : 'Absent'}</Btn>} />
        ))}
        <p role="status" className="mt-2.5 text-xs text-slate-600">{presentCount(s)} of {CLASSMATES.length} present</p>
      </>
    ),
    assess: (
      <>
        <Title kick="New assessment" title="Create with AI" />
        <Card><span className="text-xs text-slate-500">Topic</span><b className="block text-[13px]">Quadratic equations, SS2</b></Card>
        {s.draft === 'idle' && <Btn tone="primary" className="mt-2.5" onClick={() => d({ type: 'draftStart' })}>Draft 3 questions</Btn>}
        {s.draft === 'busy' && <p role="status" className="mt-2.5 text-xs text-slate-500">Drafting questions...</p>}
        {s.draft === 'done' && (
          <>
            <p role="status" className="mt-2.5 text-[13px] font-bold">3 questions drafted. Review and edit before use.</p>
            {DRAFT_QUESTIONS.map((x) => <Card key={x}><span className="text-xs">{x}</span></Card>)}
            <Btn className="mt-2" onClick={() => d({ type: 'draftReset' })}>Start over</Btn>
          </>
        )}
      </>
    ),
    progress: (
      <>
        <Title kick="SS2 Mathematics" title="Class progress" />
        <Card tint><b className="text-[13px]">Needs help</b><p className="text-xs text-slate-600">6 students are struggling with quadratic equations.</p></Card>
        <Card><Bars /></Card>
      </>
    ),
  };
  const nav = (
    <>
      <NavBtn label="Classes" icon={<CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.tutor === 'classes'} onClick={() => d({ type: 'tutor', screen: 'classes' })} />
      <NavBtn label="Assess" icon={<MonitorSmartphone className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.tutor === 'assess'} onClick={() => d({ type: 'tutor', screen: 'assess' })} />
      <NavBtn label="Progress" icon={<BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />} active={s.tutor === 'progress'} onClick={() => d({ type: 'tutor', screen: 'progress' })} />
    </>
  );
  return <Shell body={screens[s.tutor]} nav={nav} />;
};

const AdminView: React.FC<{ s: HeroState; d: Dispatch }> = ({ s, d }) => {
  const side: { key: HeroState['admin']; label: string }[] = [{ key: 'dashboard', label: 'Dashboard' }, { key: 'admissions', label: 'Admissions' }, { key: 'fees', label: 'Fees' }];
  return (
    <div className="mx-auto w-full max-w-[470px] overflow-hidden rounded-2xl border border-white/10 bg-white text-left text-slate-900 shadow-2xl shadow-black/40">
      <div className="flex min-h-[360px]">
        <div className="w-28 shrink-0 space-y-0.5 bg-[#070F1E] p-2" role="tablist" aria-label="Admin sections">
          {side.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={s.admin === x.key} onClick={() => d({ type: 'admin', screen: x.key })}
              className={`block min-h-[40px] w-full rounded-lg px-2.5 text-left text-xs font-semibold ${s.admin === x.key ? 'bg-orange-500/15 text-orange-300' : 'text-slate-400 hover:text-slate-200'}`}>{x.label}</button>
          ))}
        </div>
        <div className="min-w-0 flex-1 bg-slate-50 p-3.5">
          {s.admin === 'dashboard' && (
            <>
              <p className="text-lg font-black">Dashboard</p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {[['248', 'Students'], ['91%', 'Attendance'], ['12', 'Applications']].map(([v, l]) => (
                  <div key={l} className="rounded-xl border border-slate-200 bg-white p-2"><b className="block text-lg font-black">{v}</b><span className="text-[10px] font-semibold text-slate-500">{l}</span></div>
                ))}
              </div>
              <Card tint><b className="text-[13px]">Top performers this month</b><Bars /><Btn tone="primary" className="mt-2.5" onClick={() => d({ type: 'report' })}>Generate report sheet</Btn></Card>
            </>
          )}
          {s.admin === 'admissions' && (
            <>
              <p className="text-lg font-black">Admissions</p>
              {APPLICANTS.map((a, i) => <Line key={a.name} a={a.name} b={a.programme} right={<Btn tone={s.approved[i] ? 'ok' : 'primary'} onClick={() => d({ type: 'approve', index: i })}>{s.approved[i] ? 'Approved' : 'Approve'}</Btn>} />)}
            </>
          )}
          {s.admin === 'fees' && (
            <>
              <p className="text-lg font-black">Fees and payments</p>
              {PAYMENTS.map((p, i) => <Line key={p.name} a={p.name} b={s.confirmed[i] ? 'Confirmed. Receipt issued.' : p.note} right={<Btn tone={s.confirmed[i] ? 'ok' : 'primary'} onClick={() => d({ type: 'confirm', index: i })}>{s.confirmed[i] ? 'Confirmed' : 'Confirm'}</Btn>} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const HeroPreview: React.FC<{ onReserve: () => void; initial?: HeroState }> = ({ onReserve, initial = initialHeroState }) => {
  const [s, d] = useReducer(heroReducer, initial);
  // The AI drafting step shows a short "drafting" state, then finishes.
  useEffect(() => {
    if (s.draft !== 'busy') return undefined;
    const t = setTimeout(() => d({ type: 'draftFinish' }), 900);
    return () => clearTimeout(t);
  }, [s.draft]);
  return (
    <div className="mx-auto mt-12 max-w-xl" aria-label="Try the app">
      <div role="tablist" aria-label="Try it live as" className="mb-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-bold text-slate-400">Try it live as</span>
        {ROLES.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={s.role === r.key} onClick={() => d({ type: 'role', role: r.key })}
            className={`min-h-[44px] rounded-full border px-4 text-sm font-extrabold transition-colors ${s.role === r.key ? 'border-orange-600 bg-orange-600 text-white' : 'border-white/10 bg-slate-800/60 text-slate-200 hover:border-orange-500/50'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        {s.role === 'student' && <StudentView s={s} d={d} onReserve={onReserve} />}
        {s.role === 'tutor' && <TutorView s={s} d={d} />}
        {s.role === 'admin' && <AdminView s={s} d={d} />}
      </div>
      {s.toast && <p role="status" className="mx-auto mt-3 w-fit rounded-full border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100">{s.toast}</p>}
      <p className="mt-3 text-center text-xs text-slate-500">Sample data. Click around: this is how it works.</p>
    </div>
  );
};
