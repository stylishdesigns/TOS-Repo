import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Copy, Check, CheckCircle2 } from 'lucide-react';
import { api, Field, inputCls, btnPrimary, btnGhost } from './tosShared';

/**
 * Manual centre creation (Prompt F item 1): TOS staff create a centre and its
 * owner directly, without the public sign-up form. The temporary password is
 * generated here with crypto, shown once, and the owner is locked into
 * changing it at first sign-in before their centre dashboard opens (the
 * mustChangePassword claim set by the server). The password is never stored.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const AddCentreModal: React.FC<{ onClose: () => void; onCreated: (centreId: string) => void }> = ({ onClose, onCreated }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({
    businessName: '', fullName: '', email: '', phone: '', state: '', city: '',
    planId: '', skipTrial: false, tempPassword: '',
  });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<any | null>(null);

  useEffect(() => {
    api('/api/tos/plans')
      .then((d: any) => {
        const ps = d.plans || [];
        setPlans(ps);
        setForm((f) => (f.planId ? f : { ...f, planId: ps.find((p: any) => p.id === 'centre_standard')?.id || ps[0]?.id || '' }));
      })
      .catch(() => {});
  }, []);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const generate = () => set('tempPassword', generateTemporaryPassword());

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const canSubmit =
    form.businessName.trim().length >= 2 &&
    form.fullName.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.phone.replace(/\D/g, '').length >= 7 &&
    form.tempPassword.length >= 10;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/tos/centres', { method: 'POST', body: form });
      setCreated(r);
    } catch (e: any) {
      setError(e.message || 'Could not create the centre. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
              <p className="font-bold">{created.centreName} is live.</p>
            </div>
            <p className="text-xs text-slate-400">Hand these to the owner. They show this once only and are never stored anywhere.</p>
            <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 text-xs">Login email</span>
                <span className="text-white font-bold truncate">{form.email.trim()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 text-xs">Temporary password</span>
                <span className="flex items-center gap-2">
                  <span className="text-white font-mono font-bold">{created.tempPassword || 'sent by email'}</span>
                  {created.tempPassword && (
                    <button onClick={copyPassword} className="text-orange-300 hover:text-orange-200" title="Copy password">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 text-xs">Access code</span>
                <span className="text-white font-mono font-bold">{created.accessCode}</span>
              </div>
            </div>
            <p className="text-[11px] text-amber-300">The owner must change this password at first sign-in before their centre dashboard opens. If they lose it, use Reset owner password on the centre page.</p>
            <button onClick={() => onCreated(created.centreId)} className={`${btnPrimary} w-full justify-center`}>
              Done, open the centre
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-white font-black text-lg">Add a centre manually</h3>
                <p className="text-xs text-slate-400 mt-1">Creates the centre, its owner account and billing in one step. No public form needed.</p>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none" title="Close">×</button>
            </div>
            <div className="space-y-3">
              <Field label="Centre name">
                <input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} className={inputCls} maxLength={120} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner full name">
                  <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputCls} maxLength={100} />
                </Field>
                <Field label="Owner phone">
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} inputMode="tel" />
                </Field>
              </div>
              <Field label="Owner email (their login)">
                <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} inputMode="email" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State (optional)">
                  <input value={form.state} onChange={(e) => set('state', e.target.value)} className={inputCls} maxLength={60} />
                </Field>
                <Field label="City (optional)">
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} maxLength={60} />
                </Field>
              </div>
              <Field label="Plan">
                <select value={form.planId} onChange={(e) => set('planId', e.target.value)} className={inputCls}>
                  {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} · ₦{(p.price ?? 0).toLocaleString('en-NG')}/seat/month</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={form.skipTrial} onChange={(e) => set('skipTrial', e.target.checked)} className="accent-orange-500 w-4 h-4" />
                Skip the trial (students wait for the first payment)
              </label>
              <p className="text-[11px] text-slate-500">The access code is generated automatically, so there is never a mix-up between centres.</p>
              <Field label="Temporary password">
                <div className="flex items-center gap-2">
                  <input value={form.tempPassword} onChange={(e) => set('tempPassword', e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" />
                  <button onClick={generate} className={`${btnGhost} shrink-0`}>
                    <RefreshCw className="w-4 h-4" /> Generate
                  </button>
                </div>
              </Field>
            </div>
            {error && <p className="text-rose-300 text-xs mt-3">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={onClose} className={`${btnGhost} flex-1 justify-center`}>Cancel</button>
              <button onClick={submit} disabled={busy || !canSubmit} className={`${btnPrimary} flex-1 justify-center`}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Create centre
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">The owner changes this password at first sign-in before their dashboard opens. Everything is recorded in the audit log.</p>
          </>
        )}
      </div>
    </div>
  );
};
