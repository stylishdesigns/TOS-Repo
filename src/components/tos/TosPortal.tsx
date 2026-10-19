import React, { useCallback, useEffect, useState } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import {
  LayoutDashboard, Users, Building2, Wallet, ScrollText, UserPlus, Loader2,
  RefreshCw, KeyRound, Send, Ban, X, ChevronLeft, AlertTriangle, CheckCircle2,
  PlayCircle, Copy, Check, Plus, ShieldCheck, Clock, ArrowUpRight, Lock,
} from 'lucide-react';

/**
 * TOS platform console (Prompt C Part D).
 * Reachable only for accounts carrying the `tos` claim; the claim itself is
 * enforced on every /api/tos route server-side, this UI is the front end.
 * Desktop-first, orange-on-slate platform branding (Plus Jakarta Sans is
 * already the app's interface font).
 */

type Json = any;

async function api(path: string, opts: { method?: string; body?: any } = {}): Promise<Json> {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}

const money = (n: any) => '₦' + (Number(n) || 0).toLocaleString();
const fmtDate = (s: any) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = (s: any) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  pending_payment: 'Awaiting payment',
  active: 'Active',
  overdue: 'Overdue',
  suspended: 'Suspended',
};
const STATUS_STYLES: Record<string, string> = {
  trial: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  pending_payment: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  suspended: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const LEAD_STATUS_LABELS: Record<string, string> = {
  unverified: 'Unverified',
  verified: 'Verified, needs setup',
  provisioned: 'Provisioned',
  duplicate: 'Duplicate',
  rejected: 'Rejected',
  expired: 'Expired',
};

const StatusPill: React.FC<{ status: string; labels?: Record<string, string>; styles?: Record<string, string> }> = ({
  status,
  labels = STATUS_LABELS,
  styles = STATUS_STYLES,
}) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${styles[status] || 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
    {labels[status] || status}
  </span>
);

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-slate-900/70 border border-white/10 rounded-2xl p-5 ${className}`}>
    {title && <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 mb-4">{title}</h3>}
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</span>
    {children}
  </label>
);

const inputCls =
  'w-full bg-slate-950/60 border border-white/10 focus:border-orange-500/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-sm transition-all';
const btnGhost =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/25 bg-slate-950/40 disabled:opacity-50 text-slate-200 font-semibold text-sm transition-all';

// ---------------------------------------------------------------------------
// Credentials modal: a temporary password is shown exactly once, here, and
// never stored. Closing it is the only way to see it again... there isn't one.
// ---------------------------------------------------------------------------
const CredentialsModal: React.FC<{ details: { email: string; password?: string; accessCode?: string; centreName: string }; onClose: () => void }> = ({ details, onClose }) => {
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

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
const OverviewTab: React.FC<{ onOpenCentre: (id: string) => void; refreshKey: number; onDataLoaded?: () => void }> = ({ onOpenCentre, refreshKey, onDataLoaded }) => {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string>('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('/api/tos/overview');
      setData(d);
      onDataLoaded?.();
    } catch (e: any) {
      setError(e.message);
    }
  }, [onDataLoaded]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const runSweep = async () => {
    setSweeping(true);
    setSweepResult('');
    try {
      const r = await api('/api/tos/billing-sweep', { method: 'POST' });
      setSweepResult(`Checked ${r.scanned} centre${r.scanned === 1 ? '' : 's'}; suspended ${r.suspended.length}.`);
      await load();
    } catch (e: any) {
      setSweepResult(e.message);
    } finally {
      setSweeping(false);
    }
  };

  if (error) return <p className="text-rose-300 text-sm">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const c = data.centres || {};
  const leads = data.leads || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Centres</p>
          <p className="text-2xl font-black text-white mt-1">{c.total ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">{c.active || 0} active · {c.trial || 0} trial</p>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Awaiting payment</p>
          <p className="text-2xl font-black text-rose-300 mt-1">{c.pending_payment || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">{c.overdue || 0} overdue</p>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student seats</p>
          <p className="text-2xl font-black text-white mt-1">{data.seats?.used ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">of {data.seats?.cap ?? 0} capacity</p>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Leads</p>
          <p className="text-2xl font-black text-white mt-1">{leads.total ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">{leads.unverified || 0} unverified · {leads.verified || 0} to set up</p>
        </div>
      </div>

      {(data.trialsEndingSoon || []).length > 0 && (
        <Card title="Trials ending within 7 days">
          <div className="space-y-2">
            {data.trialsEndingSoon.map((t: any) => (
              <button key={t.centreId} onClick={() => onOpenCentre(t.centreId)} className="w-full flex items-center justify-between bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2.5 hover:border-orange-500/40 transition-colors text-left">
                <span className="text-sm text-white font-semibold">{t.name}</span>
                <span className="text-xs text-amber-300 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> ends {fmtDate(t.endsAt)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card title="Platform maintenance">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runSweep} disabled={sweeping} className={btnGhost}>
            {sweeping ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 text-orange-400" />}
            Run billing sweep
          </button>
          <p className="text-xs text-slate-500">Suspends centres whose trial or paid period ended plus the grace days. Every suspension is audited. Also runs on the nightly schedule when one is set up.</p>
        </div>
        {sweepResult && <p className="text-xs text-emerald-300 mt-3">{sweepResult}</p>}
      </Card>

      <Card title="Recent platform activity">
        <div className="space-y-2">
          {(data.recentAudit || []).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs">
              <span className="font-bold text-white">{String(e.action || '').replace(/_/g, ' ')}</span>
              <span className="text-slate-500">{fmtDateTime(e.at)}</span>
            </div>
          ))}
          {!(data.recentAudit || []).length && <p className="text-slate-500 text-xs">Nothing recorded yet.</p>}
        </div>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------
const LeadsTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [leads, setLeads] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [credentials, setCredentials] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api('/api/tos/leads');
      setLeads(d.leads || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (lead: any, type: string, extra?: any) => {
    setBusyId(lead.id);
    setError('');
    try {
      const r = await api(`/api/tos/leads/${lead.id}/action`, { method: 'POST', body: { type, ...extra } });
      if (type === 'provision') {
        setCredentials({
          centreName: lead.businessName,
          email: lead.email,
          password: r.tempPassword,
          accessCode: r.accessCode,
          delivered: r.welcomeDelivered,
        });
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const shown = filter ? leads.filter((l) => l.status === filter) : leads;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} max-w-56`}>
          <option value="">All leads</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : shown.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No leads here yet. Sign-ups from the public site land in this list.</p></Card>
      ) : (
        <div className="space-y-2">
          {shown.map((l) => (
            <div key={l.id} className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-white font-bold">{l.businessName}</p>
                    <StatusPill status={l.status} labels={LEAD_STATUS_LABELS} styles={{ verified: STATUS_STYLES.trial }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{l.fullName} · {l.email} · {l.phone}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {l.studentCount} students · {l.city}, {l.state} · {(l.examTypes || []).join(', ')} · {l.skipTrial ? 'skipping trial' : 'wants the trial'} · {fmtDate(l.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {l.status === 'unverified' && (
                    <button onClick={() => act(l, 'resend-verification')} disabled={busyId === l.id} className={btnGhost}>
                      {busyId === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Resend link
                    </button>
                  )}
                  {(l.status === 'unverified' || l.status === 'verified') && (
                    <>
                      <button onClick={() => act(l, 'provision')} disabled={busyId === l.id} className={btnPrimary}>
                        {busyId === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Provision now
                      </button>
                      <button onClick={() => { setRejecting(l); setRejectReason(''); }} disabled={busyId === l.id} className={btnGhost}>
                        <Ban className="w-4 h-4 text-rose-400" /> Reject
                      </button>
                    </>
                  )}
                  {l.status === 'provisioned' && l.centreId && (
                    <a href={`#/tos`} onClick={() => window.dispatchEvent(new CustomEvent('tos-open-centre', { detail: l.centreId }))} className={btnGhost}>
                      <ArrowUpRight className="w-4 h-4" /> Open centre
                    </a>
                  )}
                </div>
              </div>
              {l.rejectedReason && <p className="text-xs text-rose-300/80 mt-2">Rejected: {l.rejectedReason}</p>}
            </div>
          ))}
        </div>
      )}

      {credentials && (
        <CredentialsModal
          details={credentials}
          onClose={() => setCredentials(null)}
        />
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-2">Reject {rejecting.businessName}?</h3>
            <Field label="Reason (kept in the audit log)">
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className={inputCls} placeholder="Why this lead is being declined" />
            </Field>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setRejecting(null)} className={`${btnGhost} flex-1`}>Cancel</button>
              <button
                onClick={async () => { await act(rejecting, 'reject', { reason: rejectReason }); setRejecting(null); }}
                disabled={!rejectReason.trim()}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm"
              >
                Reject lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CENTRES
// ---------------------------------------------------------------------------
const CentreDetail: React.FC<{ centreId: string; onBack: () => void; onDataChanged: () => void }> = ({ centreId, onBack, onDataChanged }) => {
  const [data, setData] = useState<Json | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [credentials, setCredentials] = useState<any | null>(null);
  const [confirmCode, setConfirmCode] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<'' | 'suspend' | 'reactivate'>('');
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState({ amount: '', periodEnd: '', method: '', reference: '', note: '' });
  const [seatEdits, setSeatEdits] = useState({ seatCap: '', billedSeatsMinimum: '', planId: '', extendDays: '7' });

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, p] = await Promise.all([api(`/api/tos/centres/${centreId}`), api('/api/tos/plans')]);
      setData(d);
      setPlans(p.plans || []);
      setSeatEdits({
        seatCap: d.billing?.seatCap != null ? String(d.billing.seatCap) : '',
        billedSeatsMinimum: d.billing?.billedSeatsMinimum != null ? String(d.billing.billedSeatsMinimum) : '',
        planId: d.billing?.planId || 'centre_standard',
        extendDays: '7',
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, [centreId]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (type: string, body: any = {}, onDone?: (r: any) => void) => {
    setBusy(type);
    setActionError('');
    try {
      const r = await api(`/api/tos/centres/${centreId}/action`, { method: 'POST', body: { type, ...body } });
      onDone?.(r);
      await load();
      onDataChanged();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy('');
    }
  };

  if (error) return <div><button onClick={onBack} className="text-orange-300 text-sm mb-3 inline-flex items-center gap-1.5"><ChevronLeft className="w-4 h-4" /> All centres</button><p className="text-rose-300 text-sm">{error}</p></div>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const { centre, billing, payments, audit } = data;
  const status = centre.billingStatus || centre.status;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-orange-300 text-sm inline-flex items-center gap-1.5 hover:text-orange-200"><ChevronLeft className="w-4 h-4" /> All centres</button>

      <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-white">{centre.name}</h2>
              <StatusPill status={status} />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Owner: {centre.ownerName || '—'} · {centre.ownerEmail || '—'} · {centre.ownerPhone || '—'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Created {fmtDate(centre.createdAt)}
              {centre.contact?.state ? ` · ${centre.contact.city || ''}${centre.contact.city ? ', ' : ''}${centre.contact.state}` : ''}
              {(centre.audienceTypes || []).length ? ` · ${(centre.audienceTypes || []).join(', ')}` : ''}
            </p>
          </div>
        </div>
        {centre.credentialsNotDelivered && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-amber-200 text-xs leading-relaxed">Login email could not be delivered for this centre (no email provider configured when it was created). Resend the credentials to hand them over.</p>
            </div>
            <button onClick={() => doAction('resend-credentials', {}, (r) => setCredentials({ centreName: centre.name, email: centre.ownerEmail, password: r.tempPassword, accessCode: centre.accessCode }))} disabled={busy === 'resend-credentials'} className={btnPrimary}>
              {busy === 'resend-credentials' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Show login details
            </button>
          </div>
        )}
        {centre.suspendedReason && (
          <p className="mt-3 text-xs text-rose-300/80">Suspension note: {centre.suspendedReason}</p>
        )}
        {actionError && <p className="mt-3 text-xs text-rose-300">{actionError}</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card title="Plan and seats">
          <div className="space-y-4">
            <Field label="Plan">
              <select value={seatEdits.planId} onChange={(e) => setSeatEdits((s) => ({ ...s, planId: e.target.value }))} className={inputCls}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}/seat/month</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Seat cap">
                <input type="number" min="1" value={seatEdits.seatCap} onChange={(e) => setSeatEdits((s) => ({ ...s, seatCap: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Minimum billed seats">
                <input type="number" min="0" value={seatEdits.billedSeatsMinimum} onChange={(e) => setSeatEdits((s) => ({ ...s, billedSeatsMinimum: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <button
              onClick={() => doAction('set-plan', { planId: seatEdits.planId }, () => doAction('set-seat-cap', { seatCap: Number(seatEdits.seatCap) }))}
              disabled={busy !== ''}
              className={btnPrimary}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save plan and seats
            </button>
            {billing && (
              <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-white/5">
                <p>Seats in use: <span className="text-white font-bold">{billing.activeStudentCount ?? 0}</span> of <span className="text-white font-bold">{billing.seatCap}</span></p>
                <p>Billable seats this month: <span className="text-white font-bold">{Math.max(billing.billedSeatsMinimum || 0, billing.activeStudentCount || 0)}</span> × {money((plans.find((p) => p.id === billing.planId) || {}).price)}</p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Trial and status">
          <div className="space-y-4">
            <div className="text-xs text-slate-400 space-y-1">
              {billing?.trialEndsAt && !billing.skippedTrial && <p>Trial ends <span className="text-white font-bold">{fmtDate(billing.trialEndsAt)}</span></p>}
              <p>Paid through <span className="text-white font-bold">{fmtDate(billing?.paidThrough)}</span></p>
              {billing?.discountPct ? <p>Skip-trial discount: <span className="text-white font-bold">{billing.discountPct}%</span></p> : null}
              {billing?.skippedTrial && <p className="text-rose-300">Trial skipped; first payment records the start of billing.</p>}
            </div>
            {!billing?.skippedTrial && (
              <div className="flex items-end gap-2">
                <Field label="Extend trial (days)">
                  <input type="number" min="1" max="365" value={seatEdits.extendDays} onChange={(e) => setSeatEdits((s) => ({ ...s, extendDays: e.target.value }))} className={`${inputCls} w-28`} />
                </Field>
                <button onClick={() => doAction('extend-trial', { days: Number(seatEdits.extendDays) })} disabled={busy !== ''} className={btnGhost}>Extend</button>
              </div>
            )}
            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
              {status === 'suspended' ? (
                <button onClick={() => { setConfirmStatus('reactivate'); setReason(''); }} className={btnPrimary}>
                  <CheckCircle2 className="w-4 h-4" /> Reactivate centre
                </button>
              ) : (
                <button onClick={() => { setConfirmStatus('suspend'); setReason(''); }} className={btnGhost}>
                  <Ban className="w-4 h-4 text-rose-400" /> Suspend centre
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Access code">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-2xl font-black text-white font-mono tracking-[0.2em]">{centre.accessCode || '—'}</p>
              <button onClick={() => navigator.clipboard?.writeText(centre.accessCode || '').catch(() => {})} className="text-slate-400 hover:text-orange-300" title="Copy"><Copy className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Staff and students join with this code. Regenerating invalidates the old code immediately; existing members stay signed in, and the owner is notified.</p>
            <button onClick={() => setConfirmCode(true)} disabled={busy !== ''} className={btnGhost}><RefreshCw className="w-4 h-4" /> Generate a new code</button>
          </div>
        </Card>

        <Card title="Record a payment">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₦)">
                <input type="number" min="0" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} className={inputCls} placeholder="e.g. 30000" />
              </Field>
              <Field label="Paid through (date)">
                <input type="date" value={payment.periodEnd} onChange={(e) => setPayment((p) => ({ ...p, periodEnd: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method">
                <input value={payment.method} onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value }))} className={inputCls} placeholder="Transfer, cash, POS…" />
              </Field>
              <Field label="Reference">
                <input value={payment.reference} onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))} className={inputCls} placeholder="Bank reference" />
              </Field>
            </div>
            <Field label="Note">
              <input value={payment.note} onChange={(e) => setPayment((p) => ({ ...p, note: e.target.value }))} className={inputCls} />
            </Field>
            <button
              onClick={() => doAction('record-payment', { amount: Number(payment.amount), periodEnd: payment.periodEnd, method: payment.method, reference: payment.reference, note: payment.note }, () => setPayment({ amount: '', periodEnd: '', method: '', reference: '', note: '' }))}
              disabled={busy !== '' || !payment.amount || !payment.periodEnd}
              className={btnPrimary}
            >
              {busy === 'record-payment' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />} Record payment
            </button>
            {(payments || []).length > 0 && (
              <div className="pt-3 border-t border-white/5 space-y-1.5">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-white font-bold">{money(p.amount)}</span>
                    <span className="text-slate-400">covers to {fmtDate(p.periodCoveredUntil)} · {p.method || '—'} · {fmtDateTime(p.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title="Centre audit trail">
        <div className="space-y-1.5">
          {(audit || []).map((e: any) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-950/50 border border-white/5 rounded-xl px-3.5 py-2">
              <span className="font-bold text-white">{String(e.action || '').replace(/_/g, ' ')}</span>
              <span className="text-slate-500">{fmtDateTime(e.at)} · {e.actorUid || ''}</span>
            </div>
          ))}
          {!(audit || []).length && <p className="text-slate-500 text-xs">Nothing recorded for this centre yet.</p>}
        </div>
      </Card>

      {credentials && <CredentialsModal details={credentials} onClose={() => setCredentials(null)} />}

      {confirmCode && (
        <ConfirmModal
          title="Generate a new access code?"
          body="The current code stops working immediately. Anyone joining with the old code will need the new one."
          confirmLabel="Generate new code"
          busy={busy === 'regenerate-access-code'}
          onCancel={() => setConfirmCode(false)}
          onConfirm={async () => { await doAction('regenerate-access-code'); setConfirmCode(false); }}
        />
      )}
      {confirmStatus !== '' && (
        <ConfirmModal
          title={confirmStatus === 'suspend' ? `Suspend ${centre.name}?` : `Reactivate ${centre.name}?`}
          body={confirmStatus === 'suspend'
            ? 'Suspended centres cannot be entered by anyone except the owner, who sees payment instructions. Add the reason for the record.'
            : 'The centre becomes active again right away. Add the reason for the record.'}
          confirmLabel={confirmStatus === 'suspend' ? 'Suspend' : 'Reactivate'}
          busy={busy === 'suspend' || busy === 'reactivate'}
          requireReason
          reason={reason}
          onReasonChange={setReason}
          onCancel={() => setConfirmStatus('')}
          onConfirm={async () => {
            await doAction(confirmStatus, { reason });
            setConfirmStatus('');
          }}
        />
      )}
    </div>
  );
};

const ConfirmModal: React.FC<{
  title: string; body: string; confirmLabel: string; busy: boolean; requireReason?: boolean;
  reason?: string; onReasonChange?: (v: string) => void; onCancel: () => void; onConfirm: () => void;
}> = ({ title, body, confirmLabel, busy, requireReason, reason, onReasonChange, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
    <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0"><AlertTriangle className="w-4.5 h-4.5 text-rose-400" /></div>
        <h3 className="text-white font-bold pt-1">{title}</h3>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed">{body}</p>
      {requireReason && (
        <div className="mt-3">
          <Field label="Reason"><input value={reason} onChange={(e) => onReasonChange?.(e.target.value)} className={inputCls} /></Field>
        </div>
      )}
      <div className="flex gap-2 mt-5">
        <button onClick={onCancel} className={`${btnGhost} flex-1`}>Cancel</button>
        <button onClick={onConfirm} disabled={busy || (requireReason && !(reason || '').trim())} className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

const CentresTab: React.FC<{ refreshKey: number; openCentreId: string; onClearOpenCentre: () => void; onDataChanged: () => void }> = ({ refreshKey, openCentreId, onClearOpenCentre, onDataChanged }) => {
  const [centres, setCentres] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(openCentreId || null);

  useEffect(() => { if (openCentreId) setSelected(openCentreId); }, [openCentreId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api('/api/tos/centres');
      setCentres(d.centres || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (selected) {
    return <CentreDetail centreId={selected} onBack={() => { setSelected(null); onClearOpenCentre(); }} onDataChanged={onDataChanged} />;
  }

  const shown = centres.filter((c) => {
    if (status && c.billingStatus !== status) return false;
    if (query && !`${c.name} ${c.ownerEmail}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputCls} max-w-xs`} placeholder="Search name or owner email…" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} max-w-52`}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : shown.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No centres match. New centres appear here the moment they are provisioned.</p></Card>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className="w-full text-left bg-slate-900/70 border border-white/10 rounded-2xl p-4 hover:border-orange-500/40 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-white font-bold">{c.name}</p>
                    <StatusPill status={c.billingStatus} />
                    {c.credentialsNotDelivered && <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="w-3 h-3" /> credentials undelivered</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{c.ownerEmail || 'no owner email'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-300 font-semibold">{c.seatsUsed ?? 0} / {c.seatCap ?? '—'} seats</p>
                  <p className="text-[11px] text-slate-500">{c.planId ? c.planId.replace('centre_', 'Centre ').replace('_', ' ') : 'no plan'}{c.trialEndsAt && c.billingStatus === 'trial' ? ` · trial ends ${fmtDate(c.trialEndsAt)}` : ''}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------
const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/tos/plans');
      setPlans(d.plans || []);
      setConfig(d.config || {});
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api('/api/tos/plans', { method: 'POST', body: { plans, config } });
      setMessage('Saved. Changes apply to new calculations only, never to payments already recorded.');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setPlan = (id: string, key: string, value: any) =>
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, [key]: value } : p)));

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const configFields: [string, string][] = [
    ['trialDays', 'Trial length (days)'],
    ['skipTrialDiscountPct', 'Skip-trial discount (%)'],
    ['trialGraceDays', 'Grace days after expiry'],
    ['seatSwapLimitPerStudent', 'Seat swaps per student'],
    ['seatSwapWindowDays', 'Seat swap window (days)'],
    ['aiRouteRateLimitPerHour', 'AI requests per user per hour'],
  ];

  return (
    <div className="space-y-5">
      {plans.map((p) => (
        <Card key={p.id} title={p.name}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Price (₦/seat/month)">
              <input type="number" min="0" value={p.price ?? ''} onChange={(e) => setPlan(p.id, 'price', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Full seat cap">
              <input type="number" min="0" value={p.seatCap ?? ''} onChange={(e) => setPlan(p.id, 'seatCap', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Trial seat cap">
              <input type="number" min="0" value={p.trialSeatCap ?? ''} onChange={(e) => setPlan(p.id, 'trialSeatCap', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Trial days">
              <input type="number" min="0" value={p.trialDays ?? ''} onChange={(e) => setPlan(p.id, 'trialDays', e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 mt-4">
            {[['studentChat', 'Student chat'], ['whatsappNotifications', 'WhatsApp parent notices'], ['aiQuestionGen', 'AI question generation'], ['aiPerformanceAnalysis', 'AI performance analysis']].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={p[key] === true} onChange={(e) => setPlan(p.id, key, e.target.checked)} className="accent-orange-500 w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
        </Card>
      ))}

      <Card title="Platform settings">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {configFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" min="0" value={config[key] ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, [key]: e.target.value }))} className={inputCls} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save plans and settings
        </button>
        {message && <p className="text-xs text-emerald-300">{message}</p>}
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
      <p className="text-[11px] text-slate-500">AI essay marking runs on every plan and is never shown to customers, so it has no switch here. Every change is recorded in the audit log with what it was before.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------
const AuditTab: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api(`/api/tos/audit${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      setEntries(d.entries || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          className={`${inputCls} max-w-xs`}
          placeholder="Search the audit log…"
        />
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Search</button>
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">Nothing matches that search.</p></Card>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.id} className="bg-slate-900/70 border border-white/10 rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">{String(e.action || '').replace(/_/g, ' ')}</span>
                <span className="text-[11px] text-slate-500">{fmtDateTime(e.at)} · {e.actorUid || '—'}{e.centreId ? ` · ${e.centreId}` : ''}</span>
              </div>
              {(e.before || e.after) && (
                <pre className="text-[10px] text-slate-400 mt-1.5 whitespace-pre-wrap break-all">{JSON.stringify({ ...(e.before ? { before: e.before } : {}), ...(e.after ? { after: e.after } : {}) }, null, 1)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// TEAM
// ---------------------------------------------------------------------------
const TeamTab: React.FC = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('support');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/tos/team');
      setStaff(d.staff || []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await api('/api/tos/team', { method: 'POST', body: { email, role } });
      setMessage(`${email} now has platform access.`);
      setEmail('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Add a platform teammate">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-56">
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="teammate@example.com" /></Field>
          </div>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} w-44`}>
              <option value="support">Support</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          <button onClick={add} disabled={busy || !email.trim()} className={btnPrimary}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">They need to have signed in to Tutorial OS at least once. Access is revoked by removing them in Firebase Authentication, not here.</p>
        {message && <p className="text-xs text-emerald-300 mt-2">{message}</p>}
        {error && <p className="text-xs text-rose-300 mt-2">{error}</p>}
      </Card>

      <Card title={`Platform staff (${staff.length})`}>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-1.5">
            {staff.map((s) => (
              <div key={s.uid} className="flex items-center justify-between bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2.5">
                <span className="text-sm text-white font-semibold">{s.email}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300">{s.role}</span>
              </div>
            ))}
            {!staff.length && <p className="text-slate-500 text-xs">No staff listed yet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SHELL
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'centres', label: 'Centres', icon: Building2 },
  { id: 'plans', label: 'Plans', icon: Wallet },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
  { id: 'team', label: 'Team', icon: Users },
] as const;

export const TosPortal: React.FC = () => {
  const [tab, setTab] = useState<string>('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [openCentreId, setOpenCentreId] = useState<string>('');

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) { setOpenCentreId(id); setTab('centres'); }
    };
    window.addEventListener('tos-open-centre', handler);
    return () => window.removeEventListener('tos-open-centre', handler);
  }, []);

  // With the console as the default screen for platform staff, this button
  // means it: end the session, then land on the public site signed out.
  const signOutToLanding = async () => {
    window.location.hash = '';
    try { await signOut(getAuth()); } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/5 bg-slate-950 p-5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-orange-400">Tutorial OS</p>
            <p className="text-sm font-black text-white">Platform</p>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === t.id ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
        <a href="#centre" className="text-slate-500 hover:text-slate-300 text-xs font-medium px-3.5 py-2 text-left flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" /> Centre dashboard
        </a>
        <button onClick={signOutToLanding} className="text-slate-500 hover:text-slate-300 text-xs font-medium px-3.5 py-2 text-left flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> Back to the public site
        </button>
      </aside>

      {/* Mobile tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur border-t border-white/10 flex overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold ${tab === t.id ? 'text-orange-300' : 'text-slate-500'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 p-5 md:p-8 pb-24 md:pb-8">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-white tracking-tight capitalize">{TABS.find((t) => t.id === tab)?.label}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {tab === 'overview' && 'Everything happening across the platform right now.'}
            {tab === 'leads' && 'Sign-ups from the public site. Verify, provision, or decline.'}
            {tab === 'centres' && 'Every centre, its plan, seats, billing and access code.'}
            {tab === 'plans' && 'Pricing, caps and feature flags. All stored as data.'}
            {tab === 'audit' && 'Every privileged action, recorded.'}
            {tab === 'team' && 'The people who run the platform.'}
          </p>
        </header>

        {tab === 'overview' && <OverviewTab onOpenCentre={(id) => { setOpenCentreId(id); setTab('centres'); }} refreshKey={refreshKey} onDataLoaded={() => setRefreshKey((k) => k)} />}
        {tab === 'leads' && <LeadsTab refreshKey={refreshKey} />}
        {tab === 'centres' && <CentresTab refreshKey={refreshKey} openCentreId={openCentreId} onClearOpenCentre={() => setOpenCentreId('')} onDataChanged={() => setRefreshKey((k) => k + 1)} />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'team' && <TeamTab />}
      </main>
    </div>
  );
};

export default TosPortal;
