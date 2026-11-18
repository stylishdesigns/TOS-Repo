import React, { useEffect, useState } from 'react';
import { User, GraduationCap, KeyRound, ArrowRight, CheckCircle2, ShieldCheck, Mail } from 'lucide-react';
import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { COURSES, UNIVERSITIES, SUBJECTS } from '../../data/academicLists';
import { ModernSelect } from '../ui/ModernSelect';

interface StudentSignupFlowProps {
  centreName: string;
  centreId: string;
  accent?: string;
  logoUrl?: string;
  previewOnly?: boolean;
  /** Congratulations -> the app takes over and opens the dashboard. */
  onGoToDashboard: () => void;
  /** Back to the welcome screen. */
  onBack: () => void;
  /** The email is already registered: hand over to the login page. */
  onSwitchToLogin: () => void;
}

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

/**
 * The student registration flow for the facility app: ONE form in three
 * sections (personal, academic, account), then an email OTP step, then a
 * congratulations page. Google sign-ups skip the OTP entirely.
 */
export const StudentSignupFlow: React.FC<StudentSignupFlowProps> = ({
  centreName, centreId, accent, logoUrl, previewOnly, onGoToDashboard, onBack, onSwitchToLogin,
}) => {
  const brand = accent || '#EA580C';
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [form, setForm] = useState({
    firstName: '', lastName: '', dob: '',
    courseOfStudy: '', universityChoice: '', examToRegister: '', bestSubjects: '',
    parentName: '', parentWhatsApp: '',
    email: '', password: '', confirmPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resending, setResending] = useState(false);
  const [canResendAt, setCanResendAt] = useState(0);
  const [, setTick] = useState(0);

  // Countdown tick so the resend button wakes up on its own.
  useEffect(() => {
    if (step !== 'otp') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm";
  const labelCls = "block text-xs font-bold text-slate-500 mb-1.5 ml-1";

  const personalComplete = form.firstName.trim() && form.lastName.trim() && form.dob;
  const academicComplete = form.courseOfStudy && form.examToRegister;

  const saveRecord = async (uid: string, email: string) => {
    const ref = doc(db, 'students', uid);
    const existing = await getDoc(ref);
    const base: any = {
      uid,
      name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      email,
      dob: form.dob,
      courseOfStudy: form.courseOfStudy,
      universityChoice: form.universityChoice,
      examToRegister: form.examToRegister,
      bestSubjects: form.bestSubjects,
      parentName: form.parentName,
      parentWhatsApp: form.parentWhatsApp,
      parentEmail: email,
      status: 'Active',
      registrationDate: new Date().toISOString(),
      programmeName: form.examToRegister || 'General Programme',
      subjects: form.bestSubjects ? [form.bestSubjects] : [],
      attendancePercent: 0,
      totalFee: 0,
      paidAmount: 0,
      outstandingBalance: 0,
      skeleton: false,
      ...(centreId ? { centreId } : {}),
    };
    if (!existing.exists()) {
      base.studentId = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
      base.branchName = 'Main Campus';
    }
    await setDoc(ref, base, { merge: true });
  };

  const handleCreateAccount = async () => {
    setError(''); setNotice('');
    if (!personalComplete) { setError('Please fill in your personal details first.'); return; }
    if (!academicComplete) { setError('Please choose your intended course and exam type.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid email address.'); return; }
    if (form.password.length < 8) { setError('Your password must be at least 8 characters.'); return; }
    if (form.password !== form.confirmPassword) { setError('The two passwords do not match.'); return; }
    if (previewOnly) { setNotice('Preview only. Nothing is signed in or created on this link.'); return; }
    setBusy(true);
    try {
      const cred: any = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await saveRecord(cred.user.uid, form.email.trim());
      const res = await fetch('/api/public/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), centreName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the verification code.');
      setOtpEmail(form.email.trim());
      setCanResendAt(Date.now() + 45000);
      setStep('otp');
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setError('An account already exists with this email. Use "Log in instead" below to sign in with it.');
      } else if (err?.code === 'auth/weak-password') {
        setError('That password is too weak. Use at least 8 characters.');
      } else {
        setError(err?.message || 'Could not create the account. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(''); setNotice('');
    if (!personalComplete || !academicComplete) {
      setError('Fill in your personal and academic details first, then continue with Google.');
      return;
    }
    if (previewOnly) { setNotice('Preview only. Nothing is signed in or created on this link.'); return; }
    setBusy(true);
    try {
      const cred: any = await signInWithPopup(auth, new GoogleAuthProvider());
      const uid = cred.user.uid as string;
      const email = (cred.user.email as string) || '';
      const snap = await getDoc(doc(db, 'students', uid));
      // An already-registered student lands straight in their dashboard.
      if (snap.exists() && (snap.data() as any)?.skeleton !== true) {
        onGoToDashboard();
        return;
      }
      await saveRecord(uid, email);
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setOtpError('');
    if (otp.trim().length !== 6) { setOtpError('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/public/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail, code: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That code is not correct.');
      setStep('done');
    } catch (err: any) {
      setOtpError(err?.message || 'That code is not correct.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resending || Date.now() < canResendAt) return;
    setResending(true); setOtpError('');
    try {
      const res = await fetch('/api/public/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail, centreName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resend the code.');
      setCanResendAt(Date.now() + 45000);
    } catch (err: any) {
      setOtpError(err?.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const SectionHeader = ({ n, icon, title }: { n: number; icon: React.ReactNode; title: string }) => (
    <div className="flex items-center space-x-2.5 mb-4">
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ backgroundColor: brand }}>{n}</span>
      <span className="text-slate-700">{icon}</span>
      <h2 className="font-black uppercase tracking-wider text-sm text-slate-800">{title}</h2>
    </div>
  );

  // ---- Congratulations ----
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: `${brand}1A` }}>
            <CheckCircle2 className="w-11 h-11" style={{ color: brand }} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">Congratulations!</h1>
          <p className="text-slate-600 font-medium leading-relaxed mb-2">
            You have successfully registered with {centreName}.
          </p>
          <p className="text-xs text-slate-400 font-medium mb-8">Your student dashboard is ready.</p>
          <button
            onClick={onGoToDashboard}
            className="w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90"
            style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
          >
            <span>Go to my dashboard</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ---- OTP verification ----
  if (step === 'otp') {
    const resendWait = Math.max(0, Math.ceil((canResendAt - Date.now()) / 1000));
    return (
      <div className="min-h-screen bg-slate-50 p-4 overflow-y-auto">
        <div className="max-w-md mx-auto pt-8 pb-12">
          <button onClick={onBack} className="text-xs font-bold text-slate-500 mb-6 flex items-center space-x-1">
            <span>&larr;</span><span>Edit my details</span>
          </button>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${brand}14` }}>
              <ShieldCheck className="w-8 h-8" style={{ color: brand }} />
            </div>
            <h1 className="text-xl font-black text-slate-900 mb-1.5">Confirm your email</h1>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              We sent a 6-digit code to <span className="font-bold text-slate-700">{otpEmail}</span>.
              Enter it below to finish registering with {centreName}.
            </p>
          </div>
          <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6">
            <label className={labelCls}>Verification code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-center text-2xl font-black tracking-[0.5em] text-slate-900"
              placeholder="------"
            />
            {otpError ? <p className="text-xs font-bold text-rose-600 mt-3">{otpError}</p> : null}
            <button
              onClick={handleVerify}
              disabled={busy}
              className="w-full mt-5 text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
            >
              {busy ? <span className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : (
                <>
                  <span>Confirm code</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <button
              onClick={handleResend}
              disabled={resending || resendWait > 0}
              className="w-full mt-3 text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              {resendWait > 0 ? `Resend code available in ${resendWait}s` : 'Did not get it? Resend code'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- The registration form ----
  return (
    <div className="min-h-screen bg-slate-50 p-4 overflow-y-auto">
      <div className="max-w-md mx-auto pt-6 pb-12">
        <button onClick={onBack} className="text-xs font-bold text-slate-500 mb-4 flex items-center space-x-1">
          <span>&larr;</span><span>Back to home</span>
        </button>

        {logoUrl ? (
          <img src={logoUrl} alt={`${centreName} logo`} className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 mx-auto mb-4 shadow" />
        ) : null}
        <div className="text-center mb-6">
          <h1 className="text-xl font-black text-slate-900">Create your student account</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Registering with {centreName}</p>
        </div>

        <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6 space-y-8">
          {/* 1. Personal details */}
          <section>
            <SectionHeader n={1} icon={<User className="w-4 h-4" />} title="Personal details" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input required value={form.firstName} onChange={set('firstName')} className={inputCls} placeholder="Ada" />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input required value={form.lastName} onChange={set('lastName')} className={inputCls} placeholder="Okafor" />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Date of Birth</label>
              <input required type="date" value={form.dob} onChange={set('dob')} className={inputCls} />
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Parent / guardian contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Parent Name</label>
                  <input value={form.parentName} onChange={set('parentName')} className={inputCls} placeholder="Full name" />
                </div>
                <div>
                  <label className={labelCls}>Parent WhatsApp</label>
                  <input value={form.parentWhatsApp} onChange={set('parentWhatsApp')} className={inputCls} placeholder="+234" />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Academic details */}
          <section>
            <SectionHeader n={2} icon={<GraduationCap className="w-4 h-4" />} title="Academic details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModernSelect
                label="Intended Course"
                value={form.courseOfStudy}
                onChange={(val) => setForm((f) => ({ ...f, courseOfStudy: val }))}
                options={COURSES.map((c) => ({ value: c, label: c }))}
                placeholder="Select Course"
              />
              <ModernSelect
                label="Target University"
                value={form.universityChoice}
                onChange={(val) => setForm((f) => ({ ...f, universityChoice: val }))}
                options={UNIVERSITIES.map((u) => ({ value: u, label: u }))}
                placeholder="Select University"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <ModernSelect
                label="Best Subject"
                value={form.bestSubjects}
                onChange={(val) => setForm((f) => ({ ...f, bestSubjects: val }))}
                options={SUBJECTS.map((s) => ({ value: s, label: s }))}
                placeholder="Select Best Subject"
              />
              <ModernSelect
                label="Exam Type"
                value={form.examToRegister}
                onChange={(val) => setForm((f) => ({ ...f, examToRegister: val }))}
                options={[
                  { value: '', label: 'Select Exam' },
                  { value: 'JAMB', label: 'JAMB (UTME)' },
                  { value: 'WAEC', label: 'WAEC (WASSCE)' },
                  { value: 'NECO', label: 'NECO (SSCE)' },
                  { value: 'POST-UTME', label: 'POST-UTME' },
                  { value: 'A-LEVELS', label: 'A-LEVELS (JUPEB/IJMB)' },
                ]}
              />
            </div>
          </section>

          {/* 3. Create your account */}
          <section>
            <SectionHeader n={3} icon={<KeyRound className="w-4 h-4" />} title="Create your account" />
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center space-x-3 bg-white border border-slate-200 text-slate-800 font-bold py-3.5 rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Sign in with Google</span>
            </button>
            <div className="flex items-center space-x-3 my-5">
              <div className="h-px bg-slate-100 flex-1" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">or use email</span>
              <div className="h-px bg-slate-100 flex-1" />
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Email Address</label>
                <input required type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="you@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Create Password</label>
                  <input required type="password" value={form.password} onChange={set('password')} className={inputCls} placeholder="Min. 8 characters" />
                </div>
                <div>
                  <label className={labelCls}>Confirm Password</label>
                  <input required type="password" value={form.confirmPassword} onChange={set('confirmPassword')} className={inputCls} placeholder="Repeat password" />
                </div>
              </div>
            </div>
          </section>

          {error ? <p className="text-xs font-bold text-rose-600 -mt-2">{error}</p> : null}
          {notice ? <p className="text-xs font-bold text-slate-500 -mt-2">{notice}</p> : null}

          <button
            type="button"
            onClick={handleCreateAccount}
            disabled={busy}
            className="w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
          >
            {busy ? <span className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : (
              <>
                <span>Create account</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
          <p className="text-xs text-slate-400 font-medium flex items-center justify-center space-x-1.5 -mt-2">
            <Mail className="w-3.5 h-3.5" />
            <span>A 6-digit code will be sent to your email to confirm it.</span>
          </p>
          <button onClick={onSwitchToLogin} className="w-full text-xs font-bold text-slate-500 hover:text-slate-700">
            Already registered? Log in instead
          </button>
        </div>
      </div>
    </div>
  );
};
