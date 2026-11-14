import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth } from '../../firebase';
import { Mail, Lock, LogIn, UserPlus, Globe, Eye, EyeOff } from 'lucide-react';

interface StudentLoginProps {
  onSuccess: () => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({ onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Google login failed');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-6 bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {isSignUp ? 'Create Student Account' : 'Student Portal Login'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {isSignUp ? 'Start your academic journey today' : 'Welcome back, please sign in'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 ml-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                placeholder="student@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 ml-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-12 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold p-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span>{isSignUp ? 'Sign Up' : 'Sign In'}</span>
              </>
            )}
          </button>
        </form>

        <div className="relative my-8 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <span className="relative bg-white px-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            OR CONTINUE WITH
          </span>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl border border-slate-200 shadow-sm transition-all flex items-center justify-center space-x-2"
        >
          <Globe className="w-4 h-4 text-orange-600" />
          <span>Google Account</span>
        </button>

        <p className="text-center mt-8 text-sm text-slate-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-orange-600 font-bold hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Register Now'}
          </button>
        </p>
      </div>
    </div>
  );
};
