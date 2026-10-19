import React, { useState, useRef, useEffect } from 'react';
import { Building2, LogOut, ArrowRight, Loader2, AlertCircle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface JoinCentreScreenProps {
  onSuccess: (centreId: string) => void;
  onSignOut: () => void;
  onSwitchToEnterCode?: () => void;
  userName?: string | null;
}

export const JoinCentreScreen: React.FC<JoinCentreScreenProps> = ({
  onSuccess,
  onSignOut,
  onSwitchToEnterCode,
  userName,
}) => {
  const { joinCentreByCode } = useApp();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for special outcomes
  const [centreFullInfo, setCentreFullInfo] = useState<{ centreName: string } | null>(null);
  const [pendingApprovalInfo, setPendingApprovalInfo] = useState<{ centreName: string } | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '');

    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    if (cleanVal.length > 1) {
      const pasted = cleanVal.slice(0, 6).split('');
      const newDigits = [...digits];
      pasted.forEach((char, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = char;
        }
      });
      setDigits(newDigits);
      const nextIdx = Math.min(index + pasted.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = cleanVal;
    setDigits(newDigits);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    setDigits(newDigits);
    const nextIdx = Math.min(pastedData.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  const code = digits.join('');
  const isComplete = code.length === 6;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || isLoading) return;

    setIsLoading(true);
    setError(null);
    setCentreFullInfo(null);
    setPendingApprovalInfo(null);

    try {
      const res = await joinCentreByCode(code);
      if (res.status === 'active') {
        onSuccess(res.centreId);
      } else if (res.status === 'pending') {
        setPendingApprovalInfo({ centreName: res.centreName });
      }
    } catch (err: any) {
      if (err.code === 'CENTRE_FULL' || err.message?.includes('student limit')) {
        setCentreFullInfo({ centreName: err.centreName || 'this centre' });
      } else {
        setError(err.message || 'That code did not match. Check it and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 1. CENTRE FULL OUTCOME (Part B, point 3)
  if (centreFullInfo) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto mb-5 shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold uppercase tracking-wider">
            Student Limit Reached
          </span>

          <h2 className="text-xl font-bold text-white mt-4 mb-3">
            {centreFullInfo.centreName}
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 mb-6">
            This centre has reached its student limit. Please contact{' '}
            <strong className="text-white font-semibold">{centreFullInfo.centreName}</strong>.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                setCentreFullInfo(null);
                setDigits(['', '', '', '', '', '']);
              }}
              className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Try another access code
            </button>
            <button
              onClick={onSignOut}
              className="w-full py-3 text-slate-500 hover:text-slate-400 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. PENDING APPROVAL OUTCOME (Part B, point 4)
  if (pendingApprovalInfo) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-5 shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold uppercase tracking-wider">
            Application Submitted
          </span>

          <h2 className="text-xl font-bold text-white mt-4 mb-2">
            {pendingApprovalInfo.centreName}
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 mb-6">
            Your request to join <strong className="text-white">{pendingApprovalInfo.centreName}</strong> has been submitted. The administration will review and approve your seat shortly.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Check Status / Refresh
            </button>
            <button
              onClick={onSignOut}
              className="w-full py-3 text-slate-500 hover:text-slate-400 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STANDARD CODE ENTRY FORM
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner mb-4">
            <Building2 className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white mb-2">
            Join a centre
          </h1>
          <p className="text-sm text-slate-400 font-medium max-w-xs">
            Enter the 6-digit access code for the centre or tutor you wish to enroll with.
          </p>

          {userName && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <span>Account: <strong className="text-white">{userName}</strong></span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="leading-relaxed font-medium">{error}</div>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 sm:gap-3 py-2">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                autoComplete="one-time-code"
                className={`w-12 h-14 sm:w-13 sm:h-16 text-center text-2xl font-black rounded-2xl border transition-all duration-200 outline-none
                  ${
                    digit
                      ? 'border-blue-500 bg-blue-500/10 text-white shadow-lg shadow-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 focus:border-blue-500/80 focus:bg-slate-800'
                  }`}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={!isComplete || isLoading}
            className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg
              ${
                isComplete && !isLoading
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 cursor-pointer active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Checking Seat Availability...</span>
              </>
            ) : (
              <>
                <span>Join Centre</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-3">
          {onSwitchToEnterCode && (
            <button
              type="button"
              onClick={onSwitchToEnterCode}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors cursor-pointer"
            >
              Already a member? Enter code to sign in
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="text-xs text-slate-500 hover:text-slate-400 font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
