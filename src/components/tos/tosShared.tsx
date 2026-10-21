import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  KeyRound, X, AlertTriangle, Copy, Check,
} from 'lucide-react';

// NOTE: this module was split out of TosPortal.tsx mechanically; code is
// moved verbatim with no behavior change. TosPortal.tsx imports it back.

export type Json = any;

export async function api(path: string, opts: { method?: string; body?: any } = {}): Promise<Json> {
  // Every /api/tos route is authenticated server-side: attach the caller's
  // verified Firebase ID token. A fresh token (force refresh) also picks up a
  // `tos` claim minted moments ago during session sync.
  const user = getAuth().currentUser;
  if (!user) throw new Error('You are signed out. Sign in again to continue.');
  const token = await user.getIdToken(true);
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    // Server error messages are safe to surface. When the body is not JSON at
    // all (a platform 502, a timeout, an HTML error page) say so with the
    // status and a short hint instead of a bare "Request failed".
    if (data && typeof data === 'object' && data.error) throw new Error(String(data.error));
    if (res.status >= 500) {
      throw new Error(`Server returned ${res.status}. The platform backend may be starting or misconfigured.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Server returned ${res.status}. Your session may have expired; sign in again.`);
    }
    throw new Error(`Server returned ${res.status}. Please try again.`);
  }
  if (data === null) {
    throw new Error('The server response was not valid JSON. The platform backend may be starting or misconfigured.');
  }
  return data;
}

export const money = (n: any) => '₦' + (Number(n) || 0).toLocaleString();
export const fmtDate = (s: any) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (s: any) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  pending_payment: 'Awaiting payment',
  active: 'Active',
  overdue: 'Overdue',
  suspended: 'Suspended',
};
export const STATUS_STYLES: Record<string, string> = {
  trial: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  pending_payment: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  suspended: 'bg-red-500/15 text-red-300 border-red-500/30',
};
export const LEAD_STATUS_LABELS: Record<string, string> = {
  unverified: 'Unverified',
  verified: 'Verified, needs setup',
  provisioned: 'Provisioned',
  duplicate: 'Duplicate',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const StatusPill: React.FC<{ status: string; labels?: Record<string, string>; styles?: Record<string, string> }> = ({
  status,
  labels = STATUS_LABELS,
  styles = STATUS_STYLES,
}) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${styles[status] || 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
    {labels[status] || status}
  </span>
);

export const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-slate-900/70 border border-white/10 rounded-2xl p-5 ${className}`}>
    {title && <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 mb-4">{title}</h3>}
    {children}
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</span>
    {children}
  </label>
);

export const inputCls =
  'w-full bg-slate-950/60 border border-white/10 focus:border-orange-500/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-sm transition-all';
export const btnGhost =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/25 bg-slate-950/40 disabled:opacity-50 text-slate-200 font-semibold text-sm transition-all';

// ---------------------------------------------------------------------------
// Credentials modal: a temporary password is shown exactly once, here, and
// never stored. Closing it is the only way to see it again... there isn't one.
// ---------------------------------------------------------------------------
export const CredentialsModal: React.FC<{ details: { email: string; password?: string; accessCode?: string; centreName: string }; onClose: () => void }> = ({ details, onClose }) => {
  const [copied, setCopied] = useState<string>('');
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white font-bold">Login details ready</h3>
              <p className="text-slate-400 text-xs">{details.centreName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-amber-200 text-xs leading-relaxed">
            Shown this once only. It is not stored anywhere, so hand it over securely now.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Login email</p>
              <p className="text-white text-sm font-semibold">{details.email}</p>
            </div>
          </div>
          {details.password && (
            <div className="flex items-center justify-between bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Temporary password</p>
                <p className="text-white text-sm font-mono font-bold tracking-wider">{details.password}</p>
              </div>
              <button onClick={() => copy('pw', details.password!)} className="text-slate-400 hover:text-orange-300">
                {copied === 'pw' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          {details.accessCode && (
            <div className="flex items-center justify-between bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Access code</p>
                <p className="text-white text-sm font-mono font-bold tracking-wider">{details.accessCode}</p>
              </div>
              <button onClick={() => copy('code', details.accessCode!)} className="text-slate-400 hover:text-orange-300">
                {copied === 'code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className={`${btnPrimary} w-full mt-6`}>Done</button>
      </div>
    </div>
  );
};
