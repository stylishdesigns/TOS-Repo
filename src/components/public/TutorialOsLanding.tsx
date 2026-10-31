import React, { useEffect, useState } from 'react';
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
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

/**
 * Tutorial OS product landing page: the first screen a visitor sees. It sells
 * the platform (not any one centre), captures owner sign-ups through the
 * public lead form (server-validated and verified by email), and routes
 * people to the right door: centre admins sign in, students with an access
 * code go to the student portal.
 */

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

const EXAM_TYPES = ['JAMB', 'WAEC', 'NECO', 'A-Levels'];

const LEAD_BANNERS: Record<string, { tone: 'good' | 'warn'; title: string; text: string }> = {
  'lead-welcome': {
    tone: 'good',
    title: 'You are all set!',
    text: 'Your centre is being set up. Your login details and access code are on their way to your email right now.',
  },
  'lead-pending': {
    tone: 'good',
    title: 'Email confirmed',
    text: 'Your request is confirmed. Our team will reach out shortly with your login details.',
  },
  'lead-duplicate': {
    tone: 'warn',
    title: 'You already have a centre with us',
    text: 'These details match an existing centre. Sign in instead, or contact us if you need help getting back in.',
  },
  'lead-expired': {
    tone: 'warn',
    title: 'That confirmation link expired',
    text: 'Confirmation links last 48 hours. Submit the form again below and we will send a fresh link.',
  },
  'lead-invalid': {
    tone: 'warn',
    title: 'That confirmation link is not valid',
    text: 'Submit the form again below and we will send a fresh confirmation link.',
  },
};

const inputCls =
  'w-full bg-slate-800/70 border border-white/10 focus:border-orange-500/60 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors';

export const TutorialOsLanding: React.FC<{
  onAdminSignIn: () => void;
  onStudentAccess: () => void;
  onExplorePortals: () => void;
}> = ({ onAdminSignIn, onStudentAccess, onExplorePortals }) => {
  const [banner, setBanner] = useState<string>('');

  // Lead form state
  const [form, setForm] = useState({
    fullName: '', businessName: '', email: '', phone: '',
    studentCount: '', state: '', city: '',
    examTypes: [] as string[], skipTrial: false, consent: false, website: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.startsWith('#lead-')) {
      const key = hash.slice(1);
      if (LEAD_BANNERS[key]) setBanner(key);
      window.history.replaceState('', '', window.location.pathname + window.location.search);
    }
  }, []);

  const toggleExamType = (t: string) =>
    setForm((f) => ({
      ...f,
      examTypes: f.examTypes.includes(t) ? f.examTypes.filter((x) => x !== t) : [...f.examTypes, t],
    }));

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.consent) {
      setFormError('Please tick the consent box so we can contact you.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          businessName: form.businessName,
          email: form.email,
          phone: form.phone,
          studentCount: Number(form.studentCount),
          state: form.state,
          city: form.city,
          examTypes: form.examTypes,
          skipTrial: form.skipTrial,
          consent: true,
          website: form.website, // honeypot: real visitors leave it empty
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit your request. Please try again.');
      setSubmitted(true);
    } catch (err: any) {
      setFormError(err?.message || 'Could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToReserve = () =>
    document.getElementById('reserve')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    { title: 'Reserve your seat', text: 'Fill the form below and confirm your email.' },
    { title: 'Get your login details', text: 'We set your centre up and email you a secure start.' },
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

      {/* Post-verification banners */}
      {banner && LEAD_BANNERS[banner] && (
        <div className="relative z-10 max-w-2xl mx-auto px-5 mb-2">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              LEAD_BANNERS[banner].tone === 'good'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {LEAD_BANNERS[banner].tone === 'good' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-bold text-sm">{LEAD_BANNERS[banner].title}</p>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{LEAD_BANNERS[banner].text}</p>
            </div>
            <button onClick={() => setBanner('')} className="ml-auto text-slate-400 hover:text-white font-bold px-1" aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

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
          <div className="mt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={scrollToReserve}
              className="px-7 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 font-semibold text-sm text-orange-300 transition-colors flex items-center justify-center gap-2"
            >
              Reserve a seat for your centre
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => { window.location.hash = '#tos-admin'; }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 font-semibold text-xs text-white shadow-md shadow-indigo-600/20 transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-200" />
              TOS platform admin
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

        {/* Reserve a seat: the public lead form (server-validated) */}
        <section id="reserve" className="mb-16 scroll-mt-6">
          <div className="max-w-2xl mx-auto rounded-3xl bg-slate-800/60 border border-white/10 p-6 md:p-8">
            <h2 className="text-2xl font-black tracking-tight mb-2 text-center">
              Reserve a seat for your centre
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6 max-w-md mx-auto">
              Tell us about your centre and we will set everything up and email your login details.
            </p>

            {submitted ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="font-bold text-lg mb-2">Check your email</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                  We sent a confirmation link to <span className="text-white font-semibold">{form.email}</span>.
                  Confirm it and your login details and access code follow right after.
                </p>
              </div>
            ) : (
              <form onSubmit={submitLead} className="space-y-4">
                {/* Honeypot: bots fill this; the server rejects them */}
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Your full name *</label>
                    <input required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputCls} placeholder="Amina Bello" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Centre name *</label>
                    <input required value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} className={inputCls} placeholder="e.g. Excel Tutors, Ikeja" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Email *</label>
                    <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="you@example.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Phone (WhatsApp) *</label>
                    <input required type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="0803 000 0000" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Students right now *</label>
                    <input required type="number" min="1" max="10000" value={form.studentCount} onChange={(e) => setForm((f) => ({ ...f, studentCount: e.target.value }))} className={inputCls} placeholder="e.g. 45" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">City *</label>
                    <input required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} placeholder="e.g. Ikeja" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">State *</label>
                  <select required value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className={inputCls}>
                    <option value="">Choose a state</option>
                    {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Exams you prepare students for *</label>
                  <div className="flex flex-wrap gap-2">
                    {EXAM_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => toggleExamType(t)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          form.examTypes.includes(t)
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-200'
                            : 'bg-slate-800/70 border-white/10 text-slate-400 hover:border-white/25'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.skipTrial} onChange={(e) => setForm((f) => ({ ...f, skipTrial: e.target.checked }))} className="mt-0.5 accent-orange-500 w-4 h-4" />
                  <span>Skip the free trial, I want to start on a paid plan right away.</span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" required checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} className="mt-0.5 accent-orange-500 w-4 h-4" />
                  <span>It is fine to contact me by email or WhatsApp about setting up my centre. *</span>
                </label>

                {formError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    <p className="text-rose-300 text-xs font-medium leading-relaxed">{formError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 font-bold text-sm shadow-lg shadow-orange-600/30 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Reserve my seat
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  Already with us? Use <button type="button" onClick={onAdminSignIn} className="text-orange-400 font-semibold hover:text-orange-300">Admin sign in</button> at the top.
                </p>
              </form>
            )}
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
              Student &amp; tutor portals
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
