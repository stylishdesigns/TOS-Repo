import React, { useEffect, useState } from 'react';
import {
  User, GraduationCap, KeyRound, ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck,
  Eye, EyeOff, Check, X,
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { COURSES, UNIVERSITIES, SUBJECTS } from '../../data/academicLists';
import { ModernSelect } from '../ui/ModernSelect';
import { BrandDatePicker } from '../ui/BrandDatePicker';

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

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT - Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

const EXAM_LABELS: Record<string, string> = {
  JAMB: 'JAMB (UTME)',
  WAEC: 'WAEC (WASSCE)',
  NECO: 'NECO (SSCE)',
  'A-Levels': 'A-LEVELS (JUPEB/IJMB)',
  'A-LEVELS': 'A-LEVELS (JUPEB/IJMB)',
  'POST-UTME': 'POST-UTME',
  'SAT / International': 'SAT / International',
};

const FALLBACK_EXAMS = ['JAMB', 'WAEC', 'NECO', 'POST-UTME', 'A-LEVELS'];

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * What is wrong with a username, spelled out plainly. When a character is not
 * accepted, the message names that exact character.
 */
const usernameProblem = (v: string): string => {
  if (!v) return '';
  const bad = v.split('').find((c) => !/[a-z0-9_]/.test(c));
  if (bad) return `The character "${bad}" is not accepted. Usernames use only letters, numbers and underscores.`;
  if (!/^[a-z]/.test(v)) return 'Usernames must start with a letter.';
  if (v.length < 3) return 'Usernames are too short: at least 3 characters.';
  if (v.length > 20) return 'Usernames are too long: at most 20 characters.';
  return '';
};

/**
 * The student registration flow for the facility app: THREE STEP PAGES with a
 * stepper (personal, academic, account), then an email OTP step, then a
 * congratulations page. Google sign-ups skip the OTP entirely. Exam type and
 * subjects come from the facility's own registered programmes when it has
 * them; password rules show live as the student types.
 */
export const StudentSignupFlow: React.FC<StudentSignupFlowProps> = ({
  centreName, centreId, accent, logoUrl, previewOnly, onGoToDashboard, onBack, onSwitchToLogin,
}) => {
  const brand = accent || '#EA580C';
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', dob: '', gender: '', state: '',
    phone: '', address: '',
    parentName: '', parentWhatsApp: '',
    examToRegister: '', selectedSubjects: [] as string[],
    courseOfStudy: '', universityChoice: '',
    email: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resending, setResending] = useState(false);
  const [canResendAt, setCanResendAt] = useState(0);
  const [, setTick] = useState(0);
  // The facility's registered programmes, fetched so the exam and subject
  // lists reflect what this facility actually offers.
  const [centreExams, setCentreExams] = useState<{ name: string; category: string; subjects: string[] }[]>([]);

  // Countdown tick so the resend button wakes up on its own.
  useEffect(() => {
    if (step !== 'otp') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  // Load the facility's programmes once.
  useEffect(() => {
    if (previewOnly || !centreId) return;
    let alive = true;
    fetch(`/api/public/programmes?centreId=${encodeURIComponent(centreId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
      .then((d: any) => {
        if (alive && Array.isArray(d.programmes)) setCentreExams(d.programmes);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [centreId, previewOnly]);

  // Live username availability check (server-side), debounced while typing.
  const usernameValue = form.username.trim().toLowerCase();
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  useEffect(() => {
    if (!usernameValue) { setUsernameStatus('idle'); return; }
    if (!USERNAME_RE.test(usernameValue)) { setUsernameStatus('invalid'); return; }
    if (previewOnly) { setUsernameStatus('available'); return; }
    setUsernameStatus('checking');
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/username-check?u=${encodeURIComponent(usernameValue)}`);
        const d = await r.json().catch(() => ({}));
        setUsernameStatus(d && d.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [usernameValue, previewOnly]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k: keyof typeof form) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Phone fields accept digits only, never more than 11.
  const setPhone = (k: 'phone' | 'parentWhatsApp') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, 11) }));

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm";
  const labelCls = "block text-xs font-bold text-slate-500 mb-1.5 ml-1";

  const dobMax = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 14);
    return d.toISOString().slice(0, 10);
  })();
  const ageAtLeast14 = (() => {
    if (!form.dob) return false;
    const dob = new Date(form.dob);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 14);
    return dob <= cutoff;
  })();

  const usernameReady = usernameStatus === 'available';
  const personalOk =
    form.firstName.trim() && form.lastName.trim() &&
    usernameReady &&
    form.dob && ageAtLeast14 &&
    form.gender && form.state &&
    form.phone.length === 11 &&
    form.parentName.trim() && form.parentWhatsApp.length === 11;

  const examOptions = (() => {
    const cats: string[] = centreExams.length
      ? (Array.from(new Set(centreExams.map((p) => p.category).filter(Boolean))) as string[])
      : FALLBACK_EXAMS;
    return cats.map((c) => ({ value: c, label: EXAM_LABELS[c] || c }));
  })();

  const subjectsForExam = (cat: string) => {
    const list = centreExams.filter((p) => p.category === cat).flatMap((p) => p.subjects || []);
    const unique = Array.from(new Set(list)) as string[];
    return unique.length ? unique.sort() : SUBJECTS;
  };

  const academicOk =
    form.examToRegister && form.selectedSubjects.length > 0 && form.courseOfStudy;

  const pwRules = [
    { label: 'At least 8 characters', ok: form.password.length >= 8 },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(form.password) },
    { label: 'One lowercase letter', ok: /[a-z]/.test(form.password) },
    { label: 'One number', ok: /\d/.test(form.password) },
  ];
  const pwOk = pwRules.every((r) => r.ok);

  const toggleSubject = (s: string) =>
    setForm((f) => ({
      ...f,
      selectedSubjects: f.selectedSubjects.includes(s)
        ? f.selectedSubjects.filter((x) => x !== s)
        : [...f.selectedSubjects, s],
    }));

  const goNext = () => {
    setError('');
    // Preview link: click straight through without filling anything.
    if (previewOnly) {
      if (formStep === 1) setFormStep(2);
      else if (formStep === 2) setFormStep(3);
      return;
    }
    if (formStep === 1) {
      if (!form.firstName.trim() || !form.lastName.trim()) { setError('Enter your first name and last name.'); return; }
      if (!usernameValue) { setError('Choose a username.'); return; }
      if (usernameStatus === 'invalid') { setError(usernameProblem(usernameValue) || 'That username is not valid.'); return; }
      if (usernameStatus === 'checking') { setError('Still checking that username. Try again in a second.'); return; }
      if (usernameStatus === 'taken') { setError('That username is not available. Choose another one.'); return; }
      if (usernameStatus === 'idle') { setError('Still checking that username. Try again in a second.'); return; }
      if (!form.dob) { setError('Enter your date of birth.'); return; }
      if (!ageAtLeast14) { setError('You must be at least 14 years old to register.'); return; }
      if (!form.gender) { setError('Select your gender.'); return; }
      if (!form.state) { setError('Select your state.'); return; }
      if (form.phone.length !== 11) { setError('Your phone number must be exactly 11 digits.'); return; }
      if (!form.parentName.trim()) { setError('Enter your parent or guardian name.'); return; }
      if (form.parentWhatsApp.length !== 11) { setError("Your parent's WhatsApp number must be exactly 11 digits."); return; }
      setFormStep(2);
    } else if (formStep === 2) {
      if (!form.examToRegister) { setError('Choose the exam you are registering for.'); return; }
      if (form.selectedSubjects.length === 0) { setError('Pick at least one subject to register.'); return; }
      if (!form.courseOfStudy) { setError('Choose your intended course.'); return; }
      setFormStep(3);
    }
  };

  const saveRecord = async (uid: string, email: string) => {
    const ref = doc(db, 'students', uid);
    const existing = await getDoc(ref);
    const base: any = {
      uid,
      name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      email,
      username: usernameValue,
      dob: form.dob,
      gender: form.gender,
      state: form.state,
      phone: form.phone,
      address: form.address,
      courseOfStudy: form.courseOfStudy,
      universityChoice: form.universityChoice,
      examToRegister: form.examToRegister,
      parentName: form.parentName,
      parentWhatsApp: form.parentWhatsApp,
      parentEmail: email,
      status: 'Active',
      registrationDate: new Date().toISOString(),
      programmeName: form.examToRegister || 'General Programme',
      subjects: form.selectedSubjects,
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

  const reserveUsername = async (uid: string) => {
    if (!usernameValue || previewOnly) return;
    try {
      await fetch('/api/public/reserve-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameValue, uid, centreId }),
      });
    } catch {
      // Best effort: the username is also saved on the student record.
    }
  };

  const handleCreateAccount = async () => {
    setError(''); setNotice('');
    // Preview link: jump straight to the congratulations page.
    if (previewOnly) { setStep('done'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid email address.'); return; }
    if (!pwOk) { setError('Your password does not meet all the requirements yet.'); return; }
    if (form.password !== form.confirmPassword) { setError('The two passwords do not match.'); return; }
    if (previewOnly) { setNotice('Preview only. Nothing is signed in or created on this link.'); return; }
    if (usernameStatus === 'taken') { setError('That username is not available. Go back and choose another one.'); setFormStep(1); return; }
    if (usernameStatus !== 'available') { setError('Still checking that username. Try again in a second.'); return; }
    setBusy(true);
    try {
      const cred: any = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await saveRecord(cred.user.uid, form.email.trim());
      reserveUsername(cred.user.uid);
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
    if (previewOnly) { setNotice('Preview only. Nothing is signed in or created on this link.'); return; }
    if (usernameStatus === 'taken') { setError('That username is not available. Go back and choose another one.'); setFormStep(1); return; }
    if (usernameStatus !== 'available') { setError('Still checking that username. Try again in a second.'); return; }
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
      reserveUsername(uid);
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

  const StepBadge = ({ n, icon, active, done }: { n: number; icon: React.ReactNode; active: boolean; done: boolean }) => (
    <div className="flex items-center">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all shrink-0"
        style={done || active
          ? { backgroundColor: brand, color: '#fff', boxShadow: active ? `0 6px 18px -4px ${brand}80` : 'none' }
          : { backgroundColor: '#E2E8F0', color: '#94A3B8' }}
      >
        {done ? <Check className="w-4 h-4" /> : active ? icon : n}
      </div>
    </div>
  );

  const Stepper = () => (
    <div className="mb-7">
      <div className="flex items-center">
        <StepBadge n={1} icon={<User className="w-4 h-4" />} active={formStep === 1} done={formStep > 1} />
        <div className="flex-1 h-[3px] mx-2 rounded-full" style={{ backgroundColor: formStep > 1 ? brand : '#E2E8F0' }} />
        <StepBadge n={2} icon={<GraduationCap className="w-4 h-4" />} active={formStep === 2} done={formStep > 2} />
        <div className="flex-1 h-[3px] mx-2 rounded-full" style={{ backgroundColor: formStep > 2 ? brand : '#E2E8F0' }} />
        <StepBadge n={3} icon={<KeyRound className="w-4 h-4" />} active={formStep === 3} done={false} />
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: formStep === 1 ? brand : '#94A3B8' }}>Personal</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: formStep === 2 ? brand : '#94A3B8' }}>Academic</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: formStep === 3 ? brand : '#94A3B8' }}>Account</span>
      </div>
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

  // ---- The three step pages ----
  return (
    <div className="min-h-screen bg-slate-50 p-4 overflow-y-auto">
      <div className="max-w-md mx-auto pt-6 pb-12">
        <button onClick={formStep === 1 ? onBack : () => { setError(''); setFormStep((s) => (s - 1) as 1 | 2); }} className="text-xs font-bold text-slate-500 mb-5 flex items-center space-x-1.5">
          <ArrowLeft className="w-4 h-4" />
          <span>{formStep === 1 ? 'Back to home' : 'Previous step'}</span>
        </button>
        <Stepper />
        {error ? (
          <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl px-4 py-3">{error}</div>
        ) : null}
        {notice ? (
          <div className="mb-4 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold rounded-xl px-4 py-3">{notice}</div>
        ) : null}

        {formStep === 1 && (
          <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6">
            <h2 className="font-black text-slate-900 mb-1">Personal details</h2>
            <p className="text-xs text-slate-500 font-medium mb-5">Tell us a bit about yourself.</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>First name</label>
                <input required value={form.firstName} onChange={set('firstName')} className={inputCls} placeholder="Ada" />
              </div>
              <div>
                <label className={labelCls}>Last name</label>
                <input required value={form.lastName} onChange={set('lastName')} className={inputCls} placeholder="Okafor" />
              </div>
            </div>
            <div className="mb-3">
              <label className={labelCls}>Username</label>
              <div className="relative">
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.replace(/\s/g, '').toLowerCase() }))}
                  className={`${inputCls} pr-24`}
                  placeholder="adaokafor"
                  autoComplete="off"
                />
                {usernameStatus === 'checking' && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Checking...</span>}
                {usernameStatus === 'available' && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center text-[10px] font-bold text-emerald-600"><Check className="w-3 h-3 mr-0.5" />Available</span>
                )}
                {usernameStatus === 'taken' && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center text-[10px] font-bold text-rose-600"><X className="w-3 h-3 mr-0.5" />Not available</span>
                )}
              </div>
              {usernameStatus === 'taken' && <p className="text-[11px] font-semibold text-rose-600 mt-1 ml-1">That username is not available. Choose another one.</p>}
              {usernameStatus === 'available' && <p className="text-[11px] font-semibold text-emerald-600 mt-1 ml-1">Great, that username is available.</p>}
              {usernameStatus === 'invalid' && usernameValue && <p className="text-[11px] font-semibold text-amber-600 mt-1 ml-1">{usernameProblem(usernameValue)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Date of birth</label>
                <BrandDatePicker
                  value={form.dob}
                  onChange={(v: string) => setForm((f) => ({ ...f, dob: v }))}
                  accent={brand}
                  maxDate={dobMax}
                  placeholder="Pick your date of birth"
                  ariaLabel="Date of birth"
                />
                {form.dob && !ageAtLeast14 && <p className="text-[11px] font-semibold text-rose-600 mt-1 ml-1">You must be at least 14 to register.</p>}
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <ModernSelect
                  value={form.gender}
                  onChange={(v: any) => setVal('gender')(v)}
                  options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]}
                  placeholder="Select"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className={labelCls}>State</label>
              <ModernSelect
                value={form.state}
                onChange={(v: any) => setVal('state')(v)}
                options={NIGERIAN_STATES.map((s) => ({ value: s, label: s }))}
                placeholder="Select your state"
              />
            </div>
            <div className="mb-3">
              <label className={labelCls}>Phone number</label>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.phone}
                onChange={setPhone('phone')}
                className={inputCls}
                placeholder="08012345678"
              />
              {form.phone.length > 0 && form.phone.length < 11 && <p className="text-[11px] font-semibold text-slate-400 mt-1 ml-1">{form.phone.length}/11 digits</p>}
            </div>
            <div className="mb-3">
              <label className={labelCls}>Residential address</label>
              <input required value={form.address} onChange={set('address')} className={inputCls} placeholder="12 Adeola Street, Ikeja" />
            </div>
            <div className="mb-3">
              <label className={labelCls}>Parent / guardian name</label>
              <input required value={form.parentName} onChange={set('parentName')} className={inputCls} placeholder="Mrs Ngozi Okafor" />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Parent / guardian WhatsApp number</label>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.parentWhatsApp}
                onChange={setPhone('parentWhatsApp')}
                className={inputCls}
                placeholder="08012345678"
              />
              {form.parentWhatsApp.length > 0 && form.parentWhatsApp.length < 11 && <p className="text-[11px] font-semibold text-slate-400 mt-1 ml-1">{form.parentWhatsApp.length}/11 digits</p>}
            </div>
            <button
              onClick={goNext}
              className="w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90"
              style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {formStep === 2 && (
          <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6">
            <h2 className="font-black text-slate-900 mb-1">Academic details</h2>
            <p className="text-xs text-slate-500 font-medium mb-5">Your exam, subjects and course.</p>
            <div className="mb-4">
              <label className={labelCls}>Exam type</label>
              <ModernSelect
                value={form.examToRegister}
                onChange={(v: any) => { setVal('examToRegister')(v); setForm((f) => ({ ...f, selectedSubjects: [] })); }}
                options={examOptions}
                placeholder="Select exam"
              />
            </div>
            {form.examToRegister && (
              <div className="mb-4">
                <label className={labelCls}>Subjects to register <span className="text-slate-400 font-medium normal-case">(from {centreName}'s registered subjects)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {subjectsForExam(form.examToRegister).map((s) => {
                    const picked = form.selectedSubjects.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSubject(s)}
                        className={`flex items-center space-x-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all ${picked ? '' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                        style={picked ? { borderColor: brand, backgroundColor: `${brand}14`, color: brand } : undefined}
                      >
                        <span
                          className="w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0"
                          style={picked ? { borderColor: brand, backgroundColor: brand } : { borderColor: '#CBD5E1' }}
                        >
                          {picked && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="leading-tight">{s}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-4">
              <label className={labelCls}>Intended course</label>
              <ModernSelect
                value={form.courseOfStudy}
                onChange={(v: any) => setVal('courseOfStudy')(v)}
                options={COURSES.map((c) => ({ value: c, label: c }))}
                placeholder="Select course"
                className="max-h-64"
              />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Target university <span className="text-slate-400 font-medium normal-case">(optional)</span></label>
              <ModernSelect
                value={form.universityChoice}
                onChange={(v: any) => setVal('universityChoice')(v)}
                options={UNIVERSITIES.map((u) => ({ value: u, label: u }))}
                placeholder="Select university"
              />
            </div>
            <button
              onClick={goNext}
              className="w-full text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90"
              style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {formStep === 3 && (
          <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6">
            <h2 className="font-black text-slate-900 mb-1">Create your account</h2>
            <p className="text-xs text-slate-500 font-medium mb-5">Set up how you will sign in.</p>
            <button
              onClick={handleGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center space-x-3 bg-slate-50 border border-slate-200 rounded-xl py-3.5 font-bold text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              <GoogleIcon />
              <span className="text-sm">Sign in with Google</span>
            </button>
            <div className="flex items-center my-4">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">or with email</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <div className="mb-3">
              <label className={labelCls}>Email address</label>
              <input required type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="you@example.com" />
            </div>
            <div className="mb-2">
              <label className={labelCls}>Password</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  className={`${inputCls} pr-12`}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {pwRules.map((r) => (
                  <div key={r.label} className="flex items-center space-x-1.5 text-[11px] font-semibold">
                    {r.ok
                      ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                      : <X className="w-3.5 h-3.5 text-slate-300" />}
                    <span className={r.ok ? 'text-emerald-600' : 'text-slate-400'}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className={labelCls}>Confirm password</label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                className={inputCls}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <p className="text-[11px] font-semibold text-rose-600 mt-1 ml-1">The two passwords do not match.</p>
              )}
            </div>
            <button
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
            <button onClick={onSwitchToLogin} className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-slate-700">
              Already registered? Log in instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
