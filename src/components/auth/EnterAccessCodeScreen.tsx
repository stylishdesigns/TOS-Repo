import React, { useState, useRef, useEffect } from 'react';
import { Lock, LogOut, ArrowRight, Loader2, AlertCircle, Building2, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface EnterAccessCodeScreenProps {
  onSuccess: (centreId: string) => void;
  onSignOut: () => void;
  onSwitchToJoin?: () => void;
  userEmail?: string | null;
  userName?: string | null;
}

export const EnterAccessCodeScreen: React.FC<EnterAccessCodeScreenProps> = ({
  onSuccess,
  onSignOut,
  onSwitchToJoin,
  userEmail,
  userName,
}) => {
  const { enterCentreByCode } = useApp();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric
    const cleanVal = value.replace(/\D/g, '');

    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Handle paste or multi-digit input
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

    // Auto-advance
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

    try {
      const res = await enterCentreByCode(code);
      if (res.success && res.centreId) {
        onSuccess(res.centreId);
      } else {
        setError(res.error || 'That code did not match. Check it and try again.');
      }
    } catch (err: any) {
      setError(err.message || 'That code did not match. Check it and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden select-none">
      {/* Dynamic ambient backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-orange-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
        {/* Header Icon */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner shadow-orange-500/20 mb-4">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white mb-2">
            Enter your centre code
          </h1>
          <p className="text-sm text-slate-400 font-medium max-w-xs">
            Enter the 6-digit access code provided by your tutorial centre or tutor.
          </p>

          {userName && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <UserCheck className="w-3.5 h-3.5 text-orange-400" />
              <span>Signed in as <strong className="text-white">{userName}</strong></span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="leading-relaxed font-medium">{error}</div>
            </div>
          )}

          {/* 6 Digit Numeric Boxes */}
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
                      ? 'border-orange-500 bg-orange-500/10 text-white shadow-lg shadow-orange-500/10'
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 focus:border-orange-500/80 focus:bg-slate-800'
                  }`}
              />
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isComplete || isLoading}
            className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg
              ${
                isComplete && !isLoading
                  ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30 cursor-pointer active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Verifying Code...</span>
              </>
            ) : (
              <>
                <span>Enter Centre</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-3">
          {onSwitchToJoin && (
            <button
              type="button"
              onClick={onSwitchToJoin}
              className="text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Joining a new centre or tutor? Enter code here</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="text-xs text-slate-500 hover:text-slate-400 font-medium transition-colors flex items-center gap-1.5 cursor-pointer mt-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
