import React, { useState, useRef, useEffect } from 'react';
import { Building2, ArrowRight, Loader2, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';

/**
 * Centre code gate: the FIRST screen before any sign-in. The access code is a
 * centre selector, not a secret: entering it looks the centre up and shows its
 * name so users know which centre they are entering, then the selected
 * centre's login page follows. The code never reveals any centre data.
 */
interface CentreCodeGateProps {
  onProceed: (code: string, centreName: string, centreId?: string) => void;
  onPlatformSignIn: () => void;
}

export const CentreCodeGate: React.FC<CentreCodeGateProps> = ({ onProceed, onPlatformSignIn }) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [centre, setCentre] = useState<{ centreId?: string; centreName: string; suspended?: boolean } | null>(null);
  const [pendingCode, setPendingCode] = useState('');
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
        if (index + idx < 6) newDigits[index + idx] = char;
      });
      setDigits(newDigits);
      inputRefs.current[Math.min(index + pasted.length, 5)]?.focus();
      return;
    }
    const newDigits = [...digits];
    newDigits[index] = cleanVal;
    setDigits(newDigits);
    if (index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setDigits(pasted.split('').concat(['', '', '', '', '', '']).slice(0, 6));
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const code = digits.join('');
  const isComplete = code.length === 6;

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || checking) return;
    setChecking(true);
    setError(null);
    setCentre(null);
    try {
      const res = await fetch(`/api/public/centre-by-code?code=${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'That code did not match any centre. Check it and try again.');
        return;
      }
      setCentre(data);
      setPendingCode(code);
    } catch {
      setError('Could not look up that code. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setCentre(null);
    setPendingCode('');
    setDigits(['', '', '', '', '', '']);
    setError(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-orange-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner shadow-orange-500/20 mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-2">Which centre?</h1>
          <p className="text-sm text-slate-400 font-medium max-w-xs">
            Enter the 6-digit access code provided by your tutorial centre.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-xs animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {!centre ? (
          <form onSubmit={handleLookup} className="space-y-6">
            <div className="flex justify-between items-center gap-2 sm:gap-3 py-2">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
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

            <button
              type="submit"
              disabled={!isComplete || checking}
              className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg
                ${
                  isComplete && !checking
                    ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30 cursor-pointer active:scale-[0.98]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                }`}
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Looking up centre...</span>
                </>
              ) : (
                <>
                  <span>Find my centre</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-3">
                <Building2 className="w-6 h-6" />
              </div>
              <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1">You are entering</p>
              <p className="text-xl font-black text-white">{centre.centreName}</p>
              {centre.suspended && (
                <p className="text-xs text-amber-400 font-medium mt-2">
                  This centre is currently inactive. Contact the centre administration.
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!!centre.suspended}
              onClick={() => onProceed(pendingCode, centre.centreName, centre.centreId)}
              className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 shadow-lg
                ${
                  centre.suspended
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30 cursor-pointer active:scale-[0.98]'
                }`}
            >
              <span>Continue to sign in</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={reset}
              className="w-full text-xs text-slate-400 hover:text-slate-300 font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Wrong centre? Change the code</span>
            </button>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onPlatformSignIn}
            className="text-[11px] text-slate-600 hover:text-slate-400 font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Platform staff sign in</span>
          </button>
        </div>
      </div>
    </div>
  );
};
