import React, { useEffect, useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { KeyRound, Loader2, AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';

/**
 * Forced first-password change for provisioned centre owners (Prompt C Part C).
 * Their temporary password was created server-side and is never stored; the
 * account carries a mustChangePassword claim that blocks the app until a real
 * password is set. After the change the claim is cleared through the server
 * and the page reloads so the fresh claims and session sync apply.
 */

export const FirstLoginPasswordChange: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [expired, setExpired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const user = auth.currentUser;
        if (!user) { onDone(); return; }
        const result = await user.getIdTokenResult();
        const claims = (result.claims || {}) as any;
        if (!claims.mustChangePassword) { onDone(); return; }
        const expiresAt = claims.tempPasswordExpiresAt ? new Date(claims.tempPasswordExpiresAt).getTime() : 0;
        if (expiresAt && Date.now() > expiresAt) {
          if (live) setExpired(true);
        }
      } catch {
        if (live) onDone();
      } finally {
        if (live) setChecking(false);
      }
    };
    check();
    return () => { live = false; };
  }, [onDone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const user = auth.currentUser!;
      await updatePassword(user, password);
      const res = await fetch('/api/auth/complete-first-login', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not finish setting up your account.');
      }
      await user.getIdToken(true);
      setDone(true);
      setTimeout(() => { window.location.reload(); }, 900);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/requires-recent-login') {
        setError('For security, sign in again and set your password right away.');
      } else if (code === 'auth/weak-password') {
        setError('That password is too weak. Use at least 8 characters.');
      } else {
        setError(err?.message || 'Could not set your password. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await auth.signOut().catch(() => {});
    onDone();
  };

  if (checking) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-orange-600/10 rounded-full blur-[150px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-amber-600/10 rounded-full blur-[150px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-orange-500/20 rounded-2xl rotate-6" />
            <div className="absolute inset-0 bg-slate-900 rounded-2xl flex items-center justify-center border border-orange-500/30">
              <ShieldCheck className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-orange-400 mb-2">Tutorial OS</p>
          {expired ? (
            <>
              <h1 className="text-2xl font-black text-white tracking-tight">Temporary password expired</h1>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                The temporary password only works for 7 days. Contact the Tutorial OS team and we will send you fresh login details.
              </p>
              <button onClick={signOut} className="mt-6 text-orange-300 hover:text-orange-200 text-sm font-bold">
                Sign out
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black text-white tracking-tight">Set your password</h1>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                Choose your own password to finish setting up your centre. The temporary one stops working once you do.
              </p>
            </>
          )}
        </div>

        {!expired && !done && (
          <div className="bg-slate-900/80 backdrop-blur border border-white/10 rounded-3xl p-8 shadow-2xl">
            <form onSubmit={submit} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full bg-slate-950/60 border border-white/10 focus:border-orange-500/60 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full bg-slate-950/60 border border-white/10 focus:border-orange-500/60 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-rose-300 text-xs font-medium leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center px-4 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-sm transition-all"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><KeyRound className="w-4 h-4 mr-2" /> Set my password</>}
              </button>
            </form>
          </div>
        )}

        {done && (
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-bold">Password set. Taking you into your centre…</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstLoginPasswordChange;
