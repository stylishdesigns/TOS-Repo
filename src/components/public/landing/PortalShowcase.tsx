import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ADMIN_POINTS, STUDENT_POINTS, TUTOR_POINTS } from './landingContent';
import { PointList } from './PointList';

type PortalKey = 'admin' | 'tutor' | 'student';

const TABS: { key: PortalKey; label: string; kick: string; title: string }[] = [
  { key: 'admin', label: 'Centre admins', kick: 'Centre admins', title: 'Run the business' },
  { key: 'tutor', label: 'Tutors', kick: 'Tutors', title: 'Teach and assess' },
  { key: 'student', label: 'Students', kick: 'Students', title: 'Learn and compete' },
];
const POINTS = { admin: ADMIN_POINTS, tutor: TUTOR_POINTS, student: STUDENT_POINTS };

const AiChip: React.FC<{ label?: string }> = ({ label = 'AI' }) => (
  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-slate-900 text-orange-300 rounded-full px-2 py-0.5">
    <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
    {label}
  </span>
);

const SAMPLE = <p className="text-center text-[11px] text-slate-400 mt-3">Sample data</p>;

const AdminMock: React.FC = () => (
  <div>
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white shadow-2xl shadow-black/40 text-slate-900">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200">
        <i className="w-2.5 h-2.5 rounded-full bg-slate-300" /><i className="w-2.5 h-2.5 rounded-full bg-slate-300" /><i className="w-2.5 h-2.5 rounded-full bg-slate-300" />
        <span className="ml-2 flex-1 bg-white rounded-md px-2.5 py-1 text-[11px] text-slate-500">Centre admin</span>
      </div>
      <div className="flex">
        <div className="w-36 shrink-0 bg-[#070F1E] p-2.5 space-y-0.5 text-[11px] font-semibold text-slate-400">
          {['Dashboard', 'Students', 'Tutors', 'Timetable', 'Attendance', 'Performance', 'Fees & Payments', 'Chat'].map((t, i) => (
            <span key={t} className={`block px-2.5 py-2 rounded-lg ${i === 0 ? 'bg-orange-500/15 text-orange-300' : ''}`}>{t}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0 p-4 bg-slate-50">
          <p className="font-black text-base">Dashboard</p>
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            {[['248', 'Students'], ['91%', 'Attendance'], ['12', 'Applications']].map(([v, l]) => (
              <div key={l} className="bg-white border border-slate-200 rounded-xl px-2.5 py-2">
                <b className="block text-lg font-black">{v}</b>
                <span className="text-[10px] font-semibold text-slate-500">{l}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-xl border border-orange-300 bg-orange-50 p-3">
            <div className="flex items-center gap-2"><AiChip /><b className="text-xs">Top performers this month</b></div>
            {[['AO', 'SS3 Chemistry', 92], ['TB', 'SS2 Maths', 88], ['CE', 'SS3 English', 81]].map(([i, s, w]) => (
              <div key={String(i)} className="flex items-center gap-2 mt-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-800 text-[9px] font-black flex items-center justify-center">{i}</span>
                <span className="text-[11px] font-semibold w-24">{s}</span>
                <span className="flex-1 h-1.5 rounded bg-orange-200"><span className="block h-full rounded bg-orange-700" style={{ width: `${w}%` }} /></span>
              </div>
            ))}
            <button type="button" className="mt-2.5 h-8 px-3 rounded-lg bg-orange-700 text-white text-[11px] font-extrabold">Generate report sheet</button>
          </div>
        </div>
      </div>
    </div>
    {SAMPLE}
  </div>
);

const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-[268px] mx-auto rounded-[38px] bg-slate-50 border-[8px] border-slate-700 overflow-hidden text-slate-900 shadow-2xl shadow-black/40">
    <div className="px-4 pt-[18px] pb-3.5">{children}</div>
    <div className="h-[60px] bg-slate-950 flex items-center justify-around px-3.5">
      <span className="w-[18px] h-[3px] rounded bg-slate-600" /><span className="w-[18px] h-[3px] rounded bg-orange-400" />
      <span className="w-11 h-11 rounded-full bg-orange-700 -mt-5 border-4 border-slate-950" />
      <span className="w-[18px] h-[3px] rounded bg-slate-600" /><span className="w-[18px] h-[3px] rounded bg-slate-600" />
    </div>
  </div>
);
const Row: React.FC<{ a: string; b: string; tone: string }> = ({ a, b, tone }) => (
  <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl p-2.5 mt-2">
    <span className={`w-8 h-8 rounded-lg shrink-0 ${tone}`} />
    <span><b className="block text-[13px] font-bold">{a}</b><span className="text-xs text-slate-500">{b}</span></span>
  </div>
);

const TutorMock: React.FC = () => (
  <div>
    <Phone>
      <p className="text-xs font-semibold text-slate-500">Tutor</p>
      <p className="text-[19px] font-black">Today&apos;s classes</p>
      <Row a="Chemistry, SS3" b="10:00 AM" tone="bg-blue-100" />
      <Row a="Physics, SS2" b="2:00 PM" tone="bg-orange-100" />
      <div className="mt-2.5 rounded-xl border border-orange-300 bg-orange-50 p-3">
        <AiChip />
        <p className="text-[13px] font-semibold leading-snug mt-1.5">6 students are struggling with quadratic equations.</p>
        <button type="button" className="mt-2 h-8 px-3 rounded-lg bg-orange-700 text-white text-[11px] font-extrabold">Create practice questions</button>
      </div>
    </Phone>
    {SAMPLE}
  </div>
);

const StudentMock: React.FC = () => (
  <div>
    <Phone>
      <p className="text-xs font-semibold text-slate-500">Your results</p>
      <p className="text-[19px] font-black">How you are doing</p>
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 mt-2">
        {[['Maths', 78, 'bg-green-700'], ['Chemistry', 46, 'bg-orange-700'], ['English', 84, 'bg-green-700']].map(([s, w, c]) => (
          <div key={String(s)} className="flex items-center gap-2 mt-1.5 first:mt-0">
            <span className="text-xs font-semibold w-[70px]">{s}</span>
            <span className="flex-1 h-2 rounded bg-slate-200"><span className={`block h-full rounded ${c}`} style={{ width: `${w}%` }} /></span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 rounded-xl border border-orange-300 bg-orange-50 p-3">
        <AiChip label="AI" /><span className="ml-1.5 text-[11px] font-extrabold text-orange-800">Study coach</span>
        <p className="text-[13px] font-semibold leading-snug mt-1.5">Weak topic: mole calculations. Ready for a short practice set?</p>
        <button type="button" className="mt-2 h-8 px-3 rounded-lg bg-orange-700 text-white text-[11px] font-extrabold">Start practice</button>
      </div>
    </Phone>
    {SAMPLE}
  </div>
);

export const PortalShowcase: React.FC = () => {
  const [tab, setTab] = useState<PortalKey>('admin');
  const t = TABS.find((x) => x.key === tab)!;
  return (
    <section className="mb-16" aria-labelledby="portals-title">
      <h2 id="portals-title" className="text-2xl md:text-3xl font-black tracking-tight text-center mb-2">
        One system, <span className="text-orange-400">three portals</span>
      </h2>
      <p className="text-center text-slate-400 text-sm mb-6">Each person sees what they need and nothing more. Take a look inside.</p>
      <div role="tablist" aria-label="Portals" className="flex flex-wrap justify-center gap-2 mb-8">
        {TABS.map((x) => (
          <button
            key={x.key}
            role="tab"
            id={`portal-tab-${x.key}`}
            aria-selected={tab === x.key}
            aria-controls="portal-panel"
            type="button"
            onClick={() => setTab(x.key)}
            className={`min-h-[44px] px-5 rounded-full border text-sm font-extrabold transition-colors ${
              tab === x.key ? 'bg-orange-600 border-orange-600 text-white' : 'bg-slate-800/60 border-white/10 text-slate-200 hover:border-orange-500/50'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div id="portal-panel" role="tabpanel" aria-labelledby={`portal-tab-${tab}`} className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-orange-400">{t.kick}</p>
          <h3 className="text-2xl font-black mt-1 mb-4 tracking-tight">{t.title}</h3>
          <PointList points={POINTS[tab]} />
        </div>
        <div>{tab === 'admin' ? <AdminMock /> : tab === 'tutor' ? <TutorMock /> : <StudentMock />}</div>
      </div>
    </section>
  );
};
