import React from 'react';
import {
  GraduationCap,
  ArrowRight,
  ClipboardList,
  CalendarCheck,
  MonitorSmartphone,
  BarChart3,
  Wallet,
  Building2,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';

/**
 * Tutorial OS product landing page: the first screen a visitor sees. It sells
 * the platform (not any one centre) and routes people to the right door:
 * centre admins sign in, students with an access code go to the student
 * portal, and the existing role picker stays one click away.
 */
export const TutorialOsLanding: React.FC<{
  onAdminSignIn: () => void;
  onStudentAccess: () => void;
  onExplorePortals: () => void;
}> = ({ onAdminSignIn, onStudentAccess, onExplorePortals }) => {
  const features = [
    {
      icon: ClipboardList,
      title: 'Admissions',
      text: 'Applications come in online. Approve, onboard and issue student accounts from one screen.',
    },
    {
      icon: CalendarCheck,
      title: 'Attendance',
      text: 'Register taken per class in seconds, with a clean record for every student.',
    },
    {
      icon: MonitorSmartphone,
      title: 'CBT assessments',
      text: 'Timed objective tests with automatic marking, so scores are ready the moment a paper ends.',
    },
    {
      icon: BarChart3,
      title: 'Results & reports',
      text: 'Broad sheets, report cards and performance trends without touching a spreadsheet.',
    },
    {
      icon: Wallet,
      title: 'Fees & payments',
      text: 'See who has paid and who is owing, per student and per branch.',
    },
    {
      icon: Building2,
      title: 'Multi-branch',
      text: 'Every branch, tutor and class in one dashboard, with the right people seeing the right things.',
    },
  ];

  const steps = [
    { title: 'Set up your centre', text: 'Add your centre, branches, programmes and staff.' },
    { title: 'Enrol your students', text: 'Import students, assign them to classes and tutors.' },
    { title: 'Share access codes', text: 'Students and tutors sign in with the code you give them.' },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white selection:bg-orange-500 selection:text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-orange-500/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[55%] h-[55%] bg-blue-500/10 rounded-full blur-[160px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 max-w-6xl mx-auto flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/30">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-black tracking-tight text-lg">Tutorial OS</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">School management</p>
          </div>
        </div>
        <button
          onClick={onAdminSignIn}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-5 pb-16">
        <section className="text-center pt-10 md:pt-16 pb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-7">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-orange-400">
              Built for Nigerian tutorial centres
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
            Run your tutorial centre
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
              without the paperwork.
            </span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base font-medium leading-relaxed mb-8">
            Admissions, attendance, CBT assessments, results and fees, all in one
            place and on every phone. Set your centre up in minutes and let the
            records keep themselves.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onAdminSignIn}
              className="group w-full sm:w-auto px-7 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-sm shadow-lg shadow-orange-600/30 transition-colors flex items-center justify-center gap-2"
            >
              Admin sign in
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={onStudentAccess}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4 text-orange-400" />
              I have an access code
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-4">
            Preparing for JAMB, WAEC, NECO or A-Levels? Your centre runs it all here.
          </p>
        </section>

        {/* Features */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-5 rounded-2xl bg-slate-800/60 border border-white/5 hover:border-orange-500/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{f.text}</p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-center mb-8">
            Up and running in <span className="text-orange-400">three steps</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((s, i) => (
              <div key={s.title} className="p-5 rounded-2xl bg-slate-800/40 border border-white/5">
                <p className="text-orange-500 font-black text-2xl mb-2">{i + 1}</p>
                <h3 className="font-bold text-sm mb-1.5">{s.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="text-center p-8 md:p-10 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-800/40 border border-white/5">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-3">
            Your centre, organised at last.
          </h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            Sign in to your dashboard, or explore the student and tutor portals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onAdminSignIn}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-sm shadow-lg shadow-orange-600/30 transition-colors"
            >
              Sign in as admin
            </button>
            <button
              onClick={onExplorePortals}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-sm transition-colors"
            >
              Student & tutor portals
            </button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-6 text-center">
        <p className="text-slate-500 text-xs">Tutorial OS. Everything a tutorial centre needs, in one system.</p>
      </footer>
    </div>
  );
};
