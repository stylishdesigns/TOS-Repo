import React, { useState } from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

interface TosAdminLoginProps {
  onBack?: () => void;
}

// Platform (TOS) staff sign-in. Visually distinct from any centre's admin
// login: indigo/slate platform branding instead of a centre's colours.
// Security itself lives server-side (the `tos` custom claim), this screen is
// the front door for the people who run the platform.
export const TosAdminLogin: React.FC<TosAdminLoginProps> = ({ onBack }) => {
  const { loginWithEmail, loginWithGoogle, resetPassword } = useFirebase();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const friendlyError = (code: string): string => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'That email and password did not match. Check them and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a moment and try again.';
      case 'auth/invalid-email':
        return 'That email address does not look right.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in was closed before it finished.';
      default:
        return 'Sign-in failed. Check your details and try again.';
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
      // onAuthStateChanged in AppContext takes over from here.
    } catch (err: any) {
      setError(friendlyError(err?.code || ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(friendlyError(err?.code || ''));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap reset.');
      return;
    }
    setError(null);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err: any) {
      setError(friendlyError(err?.code || ''));
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Platform backdrop: indigo/violet, deliberately not any centre's orange */}
      <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-indigo-600/15 rounded-full blur-[150px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-violet-600/10 rounded-full blur-[150px]" />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #a5b4fc 1px, transparent 0)', backgroundSize: '28px 28px' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Platform lockup */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-2xl rotate-6" />
            <div className="absolute inset-0 bg-slate-900 rounded-2xl flex items-center justify-center border border-indigo-500/30">
              <ShieldCheck className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 mb-2">Tutorial OS</p>
          <h1 className="text-3xl font-black text-white tracking-tight">Platform Admin</h1>
          <p className="text-slate-400 text-sm font-medium mt-3">
            Staff access to centres, plans and platform settings.
          </p>
        </div>

        {/* Sign-in card */}
        <div className="bg-slate-900/80 backdrop-blur border border-white/10 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {resetSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Mail className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Check your email</h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                A password reset link is on its way to <span className="text-indigo-300 font-semibold">{email}</span>. Set a new password from there, then come back and sign in.
              </p>
              <button onClick={() => setResetSent(false)} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold uppercase tracking-widest">
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading || isGoogleLoading}
                className="w-full flex items-center justify-center px-4 py-3.5 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 font-semibold text-sm transition-all duration-300"
              >
                {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
              </button>

              <div className="flex items-center my-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="px-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">or email</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Staff email"
                    autoComplete="email"
                    className="w-full bg-slate-950/60 border border-white/10 focus:border-indigo-500/60 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full bg-slate-950/60 border border-white/10 focus:border-indigo-500/60 rounded-xl pl-11 pr-12 py-3.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    <p className="text-rose-300 text-xs font-medium leading-relaxed">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  className="w-full flex items-center justify-center px-4 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition-all duration-300 group"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign in to Platform <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" /></>}
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between">
                <button onClick={handleReset} className="text-slate-500 hover:text-indigo-300 text-xs font-medium">
                  Forgot password?
                </button>
                <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Staff only</span>
              </div>
            </>
          )}
        </div>

        {onBack && (
          <div className="text-center mt-8 animate-in fade-in duration-700">
            <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors">
              Back to the public site
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
