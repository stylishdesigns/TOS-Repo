import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Email verification gate: stands between a student account that has not
 * confirmed its emailed code and every portal screen. A fresh login of an
 * unconfirmed account lands here instead of the dashboard, and so does a
 * restored session for one. Confirming the code lets the app through.
 */
export const EmailVerificationGate: React.FC<{
  uid: string;
  email: string;
  centreName?: string;
  accent?: string;
  onVerified: () => void;
  onSignOut: () => void;
}> = ({ uid, email, centreName, accent, onVerified, onSignOut }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResendAt, setCanResendAt] = useState(() => Date.now() + 45000);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  // The facility's own brand colour carries this page; TOS orange is the
  // fallback when no facility colour is known.
  const brand = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#EA580C';
  const resendWait = Math.max(0, Math.ceil((canResendAt - Date.now()) / 1000));

  const handleVerify = async () => {
    setError('');
    if (code.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/public/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim(), uid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That code is not correct.');
      setDone(true);
      window.setTimeout(onVerified, 700);
    } catch (err: any) {
      setError(err?.message || 'That code is not correct.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resending || Date.now() < canResendAt) return;
    setResending(true); setError('');
    try {
      const res = await fetch('/api/public/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, centreName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resend the code.');
      setCanResendAt(Date.now() + 45000);
    } catch (err: any) {
      setError(err?.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full pt-8 pb-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${brand}14` }}>
            {done ? <CheckCircle2 className="w-8 h-8" style={{ color: brand }} /> : <ShieldCheck className="w-8 h-8" style={{ color: brand }} />}
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-1.5">{done ? 'Email confirmed' : 'Confirm your email'}</h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
            {done
              ? 'All set. Opening your portal...'
              : (
                <>
                  This account is not confirmed yet. Enter the 6-digit code we emailed to{' '}
                  <span className="font-bold text-slate-700">{email}</span>
                  {centreName ? <> to finish setting it up with {centreName}</> : ' to finish setting it up'}.
                  {' '}Check your spam folder if you cannot find it.
                </>
              )}
          </p>
        </div>
        {!done && (
          <div className="bg-white rounded-[28px] shadow-xl border border-slate-100 p-6">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              placeholder="000000"
              className="w-full text-center text-2xl font-black tracking-[0.4em] text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 outline-none focus:border-slate-400 transition-colors"
            />
            {error && <p className="mt-2 text-xs font-semibold text-rose-600 text-center">{error}</p>}
            <button
              onClick={handleVerify}
              disabled={busy || done}
              className="w-full mt-5 text-white font-black text-base py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center space-x-2 hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: brand, boxShadow: `0 10px 25px -5px ${brand}59` }}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{done ? 'Confirmed' : 'Confirm email'}{!busy && !done && <ArrowRight className="w-5 h-5" />}</>}
            </button>
            <div className="mt-4 text-center">
              {resendWait > 0 ? (
                <p className="text-xs text-slate-400 font-medium">You can ask for a new code in {resendWait}s</p>
              ) : (
                <button onClick={handleResend} disabled={resending} className="text-xs font-bold underline underline-offset-2 disabled:opacity-60" style={{ color: brand }}>
                  Resend the code
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mt-6 text-center">
          <button onClick={onSignOut} className="text-sm font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2">
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
};
