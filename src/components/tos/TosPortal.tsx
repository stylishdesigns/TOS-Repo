import React, { useCallback, useEffect, useState } from 'react';
import { getAuth, signOut, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import {
  LayoutDashboard, Users, Building2, Wallet, ScrollText, UserPlus, Loader2,
  RefreshCw, Send, Ban, CheckCircle2, PlayCircle, Check, Plus, ShieldCheck,
  Clock, ArrowUpRight, Lock, UserRound, BookOpen, Library, CalendarDays,
} from 'lucide-react';
import {
  api, fmtDate, fmtDateTime, LEAD_STATUS_LABELS, STATUS_STYLES, Json,
  StatusPill, Card, Field, inputCls, btnPrimary, btnGhost, CredentialsModal,
} from './tosShared';
import { CentrePeople } from './TosDirectory';
import { CentresTab } from './TosCentres';
import { QuestionBankTab } from './TosQuestionBank';
import { QuestionLibraryTab } from './TosQuestionLibrary';
import { MocksTab } from './TosMocks';

/**
 * TOS platform console (Prompt C Part D).
 * Reachable only for accounts carrying the `tos` claim; the claim itself is
 * enforced on every /api/tos route server-side, this UI is the front end.
 * Desktop-first, orange-on-slate platform branding (Plus Jakarta Sans is
 * already the app's interface font).
 *
 * Split into modules (TosShared / TosDirectory / TosCentres) mechanically:
 * code moved verbatim, no behavior change.
 */

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
              {e.reason && (
                <p className="text-[11px] text-amber-300 mt-1">Reason: {String(e.reason)}</p>
              )}
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
// ACCOUNT (Prompt E item 3): name, email, password, sign out. Reads the
// signed-in Firebase user directly, so it needs no server route. Profile
// picture upload comes in a later piece; a Google photo shows read-only.
// ---------------------------------------------------------------------------
const AccountTab: React.FC = () => {
  const [me, setMe] = useState<any>(null);
  const [name, setName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameDone, setNameDone] = useState('');
  const [error, setError] = useState('');
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState('');
  const auth = getAuth();

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { setError('You are signed out. Sign in again to continue.'); return; }
    setMe({
      displayName: u.displayName || '',
      email: u.email || '',
      emailVerified: u.emailVerified,
      photoUrl: u.photoURL || '',
      hasPasswordProvider: u.providerData.some((p) => p.providerId === 'password'),
      lastSignInAt: u.metadata.lastSignInTime,
    });
    setName(u.displayName || '');
  }, [auth]);

  const saveName = async () => {
    setNameBusy(true); setNameDone(''); setError('');
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('You are signed out. Sign in again to continue.');
      await updateProfile(u, { displayName: name.trim() });
      setMe((m: any) => ({ ...m, displayName: name.trim() }));
      setNameDone('Display name saved.');
    } catch (e: any) { setError(e.message || 'Could not save the display name.'); }
    finally { setNameBusy(false); }
  };

  const changePassword = async () => {
    setPwdError(''); setPwdDone('');
    if (me && !me.hasPasswordProvider) { setPwdError('This account signs in with Google, so there is no password to change here.'); return; }
    if (pwd.next.length < 8) { setPwdError('The new password must be at least 8 characters.'); return; }
    if (pwd.next !== pwd.confirm) { setPwdError('The two new passwords do not match.'); return; }
    setPwdBusy(true);
    try {
      const u = auth.currentUser;
      if (!u || !u.email) throw new Error('You are signed out. Sign in again to continue.');
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pwd.current));
      await updatePassword(u, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      setPwdDone('Password changed.');
    } catch (e: any) {
      setPwdError(e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential' ? 'That current password is not right.' : e.message || 'Could not change the password.');
    } finally { setPwdBusy(false); }
  };

  const signOutEverywhere = async () => {
    window.location.hash = '';
    try { await signOut(getAuth()); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4 max-w-xl">
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      <Card title="Profile">
        <div className="flex items-center gap-4">
          {me?.photoUrl ? (
            <img src={me.photoUrl} alt="Profile picture" className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-300 font-black text-xl">
              {(me?.displayName || me?.email || '?').trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-bold truncate">{me?.displayName || 'No name set'}</p>
            <p className="text-xs text-slate-400 truncate">{me?.email}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {me?.emailVerified ? 'Email verified' : 'Email not verified'}
              {me?.lastSignInAt ? ` · last sign-in ${fmtDateTime(me.lastSignInAt)}` : ''}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Display name">
        <Field label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} />
        </Field>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveName} disabled={nameBusy || name.trim().length < 2} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-bold">
            {nameBusy && <Loader2 className="w-4 h-4 animate-spin" />} Save name
          </button>
          {nameDone && <p className="text-emerald-300 text-xs">{nameDone}</p>}
        </div>
      </Card>

      <Card title="Password">
        {me && !me.hasPasswordProvider ? (
          <p className="text-slate-400 text-sm">You sign in with Google, so your password is managed by Google. There is nothing to change here.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Current password"><input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className={inputCls} autoComplete="current-password" /></Field>
            <Field label="New password"><input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className={inputCls} autoComplete="new-password" /></Field>
            <Field label="Repeat new password"><input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} className={inputCls} autoComplete="new-password" /></Field>
            <p className="text-[11px] text-slate-500">You will be asked for the current password again before it changes.</p>
            <div className="flex items-center gap-3">
              <button onClick={changePassword} disabled={pwdBusy || !pwd.current || !pwd.next || !pwd.confirm} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-bold">
                {pwdBusy && <Loader2 className="w-4 h-4 animate-spin" />} Change password
              </button>
              {pwdDone && <p className="text-emerald-300 text-xs">{pwdDone}</p>}
            </div>
            {pwdError && <p className="text-rose-300 text-xs">{pwdError}</p>}
          </div>
        )}
      </Card>

      <Card title="Session">
        <button onClick={signOutEverywhere} className={btnGhost}>Sign out</button>
        <p className="text-[11px] text-slate-500 mt-2">Ends this session on this device.</p>
      </Card>
    </div>
  );
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'centres', label: 'Centres', icon: Building2 },
  { id: 'plans', label: 'Plans', icon: Wallet },
  { id: 'questions', label: 'Question Bank', icon: BookOpen },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'mocks', label: 'Mocks', icon: CalendarDays },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'account', label: 'Account', icon: UserRound },
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

  // The TC dashboards stream live through Firestore listeners; the console's
  // data goes through the server, so it refreshes when the admin comes back
  // to the tab. No blind timer: a periodic refresh churned the screen every
  // few seconds while the admin was mid-task, so it only refreshes on the
  // moment of return now (plus every tab's own refresh after its actions).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
            {tab === 'questions' && 'Author questions once, publish to the CDN, and every centre practices from the same live bank.'}
            {tab === 'library' && 'Browse, search and fix questions 50 at a time, fast at any bank size. Built for tens of thousands.'}
            {tab === 'mocks' && "One mock a day for every centre's students. Create, freeze and manage them from here."}
            {tab === 'audit' && 'Every privileged action, recorded.'}
            {tab === 'team' && 'The people who run the platform.'}
            {tab === 'account' && 'Your platform profile, password and sign-out.'}
          </p>
        </header>

        {tab === 'overview' && <OverviewTab onOpenCentre={(id) => { setOpenCentreId(id); setTab('centres'); }} refreshKey={refreshKey} onDataLoaded={() => setRefreshKey((k) => k)} />}
        {tab === 'leads' && <LeadsTab refreshKey={refreshKey} />}
        {tab === 'centres' && <CentresTab refreshKey={refreshKey} openCentreId={openCentreId} onClearOpenCentre={() => setOpenCentreId('')} onDataChanged={() => setRefreshKey((k) => k + 1)} />}
        {tab === 'questions' && <QuestionBankTab refreshKey={refreshKey} />}
        {tab === 'library' && <QuestionLibraryTab refreshKey={refreshKey} />}
        {tab === 'mocks' && <MocksTab refreshKey={refreshKey} />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'account' && <AccountTab />}
      </main>
    </div>
  );
};

export default TosPortal;
