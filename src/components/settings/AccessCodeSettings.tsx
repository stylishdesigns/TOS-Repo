import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, Copy, Check, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getAuth } from 'firebase/auth';

/**
 * Owner-facing access-code settings (Prompt C Part C). The code is shown
 * only here, server-verified (owner or TOS staff), and regenerating it
 * invalidates the old code immediately, writes an audit entry, and notifies
 * the owner by email when email is configured.
 */

export const AccessCodeSettings: React.FC = () => {
  const { activeCentreId } = useApp() as any;
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  // Batch 44: the facility can switch the access-code gate off entirely.
  // It is ON by default; switching it off lets students and staff go
  // straight from the splash screen to signing in.
  const [required, setRequired] = useState<boolean | null>(null);
  const [savingReq, setSavingReq] = useState(false);

  const load = useCallback(async () => {
    if (!activeCentreId) return;
    setLoading(true);
    setError('');
    try {
      // Server-side enforcement: the call carries the caller's verified ID token.
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch(`/api/centre/access-code?centreId=${encodeURIComponent(activeCentreId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the access code.');
      setCode(data.accessCode || '');
      setRequired(data.accessCodeRequired !== false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeCentreId]);

  useEffect(() => { load(); }, [load]);

  const saveRequired = async (next: boolean) => {
    setSavingReq(true);
    setError('');
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/access-code/require', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ centreId: activeCentreId, required: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the setting.');
      setRequired(data.accessCodeRequired !== false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingReq(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    setError('');
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/access-code/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ centreId: activeCentreId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not regenerate the code.');
      setCode(data.accessCode || '');
      setConfirming(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="bg-white/60 backdrop-blur rounded-2xl border border-slate-200/60 p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-orange-600" />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-800">Access code</h3>
          <p className="text-[13px] text-slate-700">Staff and students join your facility with this 6-digit code.</p>
        </div>
      </div>

      {/* Batch 44: whether anyone is asked for this code at all. */}
      <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-200/70">
        <div>
          <p className="text-xs font-black text-slate-800">Access code required</p>
          <p className="text-[13px] text-slate-700 leading-snug mt-0.5">
            {required === false
              ? 'Off: students and staff skip the code and sign in straight away.'
              : 'On: students and staff enter this code before they can sign in.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required !== false}
          aria-label="Access code required"
          disabled={required === null || savingReq}
          onClick={() => saveRequired(!(required !== false))}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${required !== false ? '' : 'bg-slate-300'}`}
          style={required !== false ? { background: 'var(--brand, #F97316)' } : undefined}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${required !== false ? 'translate-x-5' : ''}`} />
          {savingReq && <Loader2 className="w-3 h-3 text-white animate-spin absolute inset-0 m-auto" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-3"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-black text-slate-900 font-mono tracking-[0.25em]">{code || '—'}</p>
            {code && (
              <button onClick={copy} className="text-slate-400 hover:text-orange-600" title="Copy code">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Regenerating gives you a brand-new code and the old one stops working immediately. Members who already joined stay signed in.
          </p>
          {error && (
            <div className="flex items-start gap-2 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
              <p className="text-rose-600 text-xs">{error}</p>
            </div>
          )}
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={regenerating}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 font-bold text-xs transition-colors disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Generate a new code
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-600 font-semibold mr-1">Generate a new code now?</p>
              <button onClick={regenerate} disabled={regenerating} className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-2">
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Yes, regenerate
              </button>
              <button onClick={() => setConfirming(false)} className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-600 font-bold text-xs">Cancel</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AccessCodeSettings;
