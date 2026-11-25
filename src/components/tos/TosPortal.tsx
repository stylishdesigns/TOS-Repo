import React, { useCallback, useEffect, useState } from 'react';
import { getAuth, signOut, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import {
  LayoutDashboard, Users, Building2, Wallet, ScrollText, UserPlus, Loader2,
  RefreshCw, Send, Ban, CheckCircle2, PlayCircle, Check, Plus, ShieldCheck,
  ArrowUpRight, UserRound, BookOpen, CalendarDays, Copy, HelpCircle, Sparkles,
  AlertTriangle, X, ChevronRight, MessageSquare, Globe, Trash2, Settings, FileText,
  PanelLeftClose, PanelLeftOpen, Share2,
} from 'lucide-react';
import {
  api, fmtDate, fmtDateTime, LEAD_STATUS_LABELS, STATUS_STYLES, Json,
  StatusPill, Card, Field, inputCls, btnPrimary, btnGhost, CredentialsModal,
} from './tosShared';
import { loadLastGood, saveLastGood } from '../../lib/lastGood';
import { CentrePeople } from './TosDirectory';
import { CentresTab, CentreDetail, CentreSlideOver, ConfirmBulkDelete } from './TosCentres';
import { QuestionBankTab } from './TosQuestionBank';
import { QuestionLibraryTab } from './TosQuestionLibrary';
import { QuestionBankHub, MockPapersTab } from './TosQuestionHub';
import { MocksTab } from './TosMocks';
import { TosChat } from './TosChat';
import { WebsiteTab } from './TosWebsite';
import ProposalsTab from './TosProposals';

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
// Lagos calendar day, for the no-mock-today check on the Overview.
const lagosYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const OverviewTab: React.FC<{ onOpenCentre: (id: string) => void; refreshKey: number; onDataLoaded?: () => void }> = ({ onOpenCentre, refreshKey, onDataLoaded }) => {
  const [data, setData] = useState<Json | null>(() => loadLastGood<Json>('tos:overview'));
  const [error, setError] = useState('');
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string>('');
  const [noMockToday, setNoMockToday] = useState<boolean | null>(null);

  // MB2: computed from the real mock list, never a hard-coded date. A mock
  // only counts when it is Scheduled or Live today; a draft, a cancelled or
  // a voided mock leaves students with "no mock today".
  useEffect(() => {
    let alive = true;
    const today = lagosYmd();
    api(`/api/tos/mocks?month=${today.slice(0, 7)}`)
      .then((r: Json) => {
        if (!alive) return;
        const mock = (r.mocks || []).find((m: Json) => m.date === today);
        setNoMockToday(!(mock && ['scheduled', 'live'].includes(mock.status)));
      })
      .catch(() => { if (alive) setNoMockToday(null); });
    return () => { alive = false; };
  }, [refreshKey]);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('/api/tos/overview');
      setData(d);
      saveLastGood('tos:overview', d);
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
      setSweepResult(`Checked ${r.scanned} facility${r.scanned === 1 ? '' : 's'}; suspended ${r.suspended.length}.`);
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
      {noMockToday === true && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <p className="text-xs text-amber-100 flex-1 min-w-[200px]">No mock scheduled for today. Students will see &quot;no mock today&quot;.</p>
          <button onClick={() => window.dispatchEvent(new CustomEvent('tos-open-mocks-new'))}
            className="text-xs font-black px-3 py-2 rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 min-h-[36px]">
            Create it
          </button>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Facilities</p>
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

      {(data.leadCentres || []).length > 0 && (
        <Card title="Leads not yet upgraded">
          <div className="space-y-2">
            {data.leadCentres.map((t: any) => (
              <button key={t.centreId} onClick={() => onOpenCentre(t.centreId)} className="w-full flex items-center justify-between bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2.5 hover:border-orange-500/40 transition-colors text-left">
                <span className="text-sm text-white font-semibold">{t.name}</span>
                <span className="text-xs text-amber-300 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> lead · free seats</span>
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
          <p className="text-xs text-slate-500">Suspends facilities whose trial or paid period ended plus the grace days. Every suspension is audited. Also runs on the nightly schedule when one is set up.</p>
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
  // Leads: owners who started a free trial but have not signed in and set
  // their own password yet. They move to Facilities the moment they do.
  const [leads, setLeads] = useState<any[]>(() => loadLastGood<any[]>('tos:leads') || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api('/api/tos/centres');
      const list = (d.centres || []).filter((c: any) => !c.ownerOnboarded);
      setLeads(list);
      saveLastGood('tos:leads', list);
      setPicked(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = leads.length > 0 && leads.every((c) => picked.has(c.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(leads.map((c) => c.id)));

  const deleteNow = async () => {
    setDeleting(true);
    setActionError('');
    try {
      const r = await api('/api/tos/centres/bulk-delete', { method: 'POST', body: { ids: Array.from(picked) } });
      const failed = (r.results || []).filter((x: any) => !x.ok);
      setActionError(failed.length ? `${failed.length} could not be deleted: ${failed.map((f: any) => f.error).join('; ')}` : '');
      setConfirming(false);
      await load();
    } catch (e: any) {
      setActionError(e.message);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
        <p className="text-xs text-slate-500">Owners on a free trial who have not signed in and set their own password yet. Each one becomes a facility once they do.</p>
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading && leads.length === 0 ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : leads.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No leads yet. Every new free trial lands here until its owner signs in and sets their own password.</p></Card>
      ) : (
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-3"><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all leads" className="w-4 h-4 accent-orange-500" /></th>
                <th className="px-3 py-3 font-bold">#</th>
                <th className="px-4 py-3 font-bold">Facility</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Trial ends</th>
                <th className="px-4 py-3 font-bold">Started</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((c, i) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors">
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} className="w-4 h-4 accent-orange-500" />
                  </td>
                  <td className="px-3 py-3 text-xs font-black text-orange-300">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="text-white font-bold">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.ownerName || '—'} · {c.ownerEmail || 'no owner email'}</p>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={c.billingStatus} /></td>
                  <td className="px-4 py-3 text-xs text-slate-300">{c.tier === 'lead' ? <span className="text-amber-300 font-semibold">Lead · free seats</span> : <span className="text-emerald-300">Facility</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.createdAt ? fmtDate(c.createdAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {actionError && <p className="text-rose-300 text-sm">{actionError}</p>}

      {picked.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-white font-bold whitespace-nowrap">{picked.size} selected</span>
          <button onClick={() => setPicked(new Set())} className={btnGhost}>Clear</button>
          <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm">
            <Trash2 className="w-4 h-4" /> Delete permanently
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmBulkDelete
          count={picked.size}
          label={picked.size === 1 ? 'lead' : 'leads'}
          busy={deleting}
          onCancel={() => setConfirming(false)}
          onConfirm={deleteNow}
        />
      )}

      {openId ? (
        <CentreSlideOver onClose={() => setOpenId('')}>
          <CentreDetail centreId={openId} onBack={() => setOpenId('')} onDataChanged={load} backLabel="All leads" />
        </CentreSlideOver>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------
const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<any[]>(() => loadLastGood<any[]>('tos:plans') || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/tos/plans');
      setPlans(d.plans || []);
      saveLastGood('tos:plans', d.plans || []);
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
      await api('/api/tos/plans', { method: 'POST', body: { plans } });
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

  if (loading && plans.length === 0) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

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

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save plans
        </button>
        {message && <p className="text-xs text-emerald-300">{message}</p>}
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
      <p className="text-[11px] text-slate-500">AI essay marking runs on every plan and is never shown to customers, so it has no switch here. Every change is recorded in the audit log with what it was before.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SETTINGS (batch 24): seat policy and platform settings, out of the Plans
// tab so the pricing page stays pricing. Dropdowns for fixed choices, fields
// for numbers. Every value is checked on the server and read fresh on each
// seat action, so nothing here can be worked around with a stale copy.
// ---------------------------------------------------------------------------
const SettingsTab: React.FC = () => {
  const [config, setConfig] = useState<any>(() => loadLastGood<any>('tos:plansConfig') || {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api('/api/tos/plans');
      setConfig(d.config || {});
      saveLastGood('tos:plansConfig', d.config || {});
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const d = await api('/api/tos/plans', { method: 'POST', body: { plans: [], config } });
      const a = d?.applied;
      if (a) {
        const parts: string[] = [];
        if (a.freeSeatsRemoved > 0) parts.push(`${a.freeSeatsRemoved} free seat${a.freeSeatsRemoved === 1 ? '' : 's'} removed`);
        if (a.freeSeatsAdded > 0) parts.push(`${a.freeSeatsAdded} free seat${a.freeSeatsAdded === 1 ? '' : 's'} added`);
        if (a.trialSeatsRemoved > 0) parts.push(`${a.trialSeatsRemoved} trial seat${a.trialSeatsRemoved === 1 ? '' : 's'} removed`);
        if (a.studentsDetached > 0) parts.push(`${a.studentsDetached} student${a.studentsDetached === 1 ? '' : 's'} detached`);
        setMessage(`Saved. Applied across ${a.facilities} facilit${a.facilities === 1 ? 'y' : 'ies'}${parts.length ? `: ${parts.join(', ')}.` : ', nothing to change.'}`);
      } else {
        setMessage('Saved. The platform reads these values fresh on every seat action and checks them on the server.');
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const platformFields: [string, string][] = [
    ['aiRouteRateLimitPerHour', 'AI requests per user per hour'],
  ];

  const unlimited = config.paidSeatsUnlimited === true;

  return (
    <div className="space-y-5">
      <Card title="Seat policy">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Paid seats for facilities not on trial">
            <select
              value={unlimited ? 'unlimited' : 'limited'}
              onChange={(e) => setConfig((c: any) => ({ ...c, paidSeatsUnlimited: e.target.value === 'unlimited' }))}
              className={inputCls}
            >
              <option value="limited">A set limit</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </Field>
          <Field label="Max paid seats, facilities not on trial">
            <input type="number" min="0" value={config.paidMaxSeats ?? ''} disabled={unlimited} onChange={(e) => setConfig((c: any) => ({ ...c, paidMaxSeats: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Free seats for every facility">
            <input type="number" min="0" value={config.freeSeatsGeneral ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, freeSeatsGeneral: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Minimum paid seats">
            <input type="number" min="0" value={config.paidSeatMinimum ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, paidSeatMinimum: e.target.value }))} className={inputCls} />
          </Field>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Saving applies these numbers to every facility right away: lowering a number trims the extra seats live and moves students off removed seats (their access switches off), raising it adds seats. The minimum is judged on paid seats only; free seats never count toward it. A lead below the minimum cannot create paid seats at all: it upgrades by paying for the minimum in one go. Every facility runs on its free-seat grant, and each facility can carry its own override on its page.
        </p>
      </Card>

      <Card title="Payment account">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Account name">
            <input value={config.payAccountName ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, payAccountName: e.target.value }))} className={inputCls} placeholder="Michael Ogunnaike" />
          </Field>
          <Field label="Account number">
            <input value={config.payAccountNumber ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, payAccountNumber: e.target.value }))} className={inputCls} placeholder="5070133907" />
          </Field>
          <Field label="Bank">
            <input value={config.payBank ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, payBank: e.target.value }))} className={inputCls} placeholder="Moniepoint" />
          </Field>
          <Field label="WhatsApp number for payment confirmations">
            <input value={config.tosWhatsappNumber ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, tosWhatsappNumber: e.target.value }))} className={inputCls} placeholder="09030064109" />
          </Field>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Facilities see these details on the payment step of the upgrade flow, and the WhatsApp button opens this number.
          Leave a field empty to keep its current value.
        </p>
      </Card>

      <Card title="Platform settings">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {platformFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" min="0" value={config[key] ?? ''} onChange={(e) => setConfig((c: any) => ({ ...c, [key]: e.target.value }))} className={inputCls} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save settings
        </button>
        {message && <p className="text-xs text-emerald-300">{message}</p>}
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------
const AuditTab: React.FC = () => {
  const [entries, setEntries] = useState<any[]>(() => loadLastGood<any[]>('tos:audit') || []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api(`/api/tos/audit${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      setEntries(d.entries || []);
      saveLastGood('tos:audit', d.entries || []);
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
// Teammate creation (Prompt N2a): mirrors the Add-centre flow. The temporary
// password is generated here with crypto, shown once, and a brand-new account
// is locked into changing it at first sign-in (mustChangePassword claim set by
// the server). The password is never stored.
const TEAM_PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateTeamPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TEAM_PW_ALPHABET[b % TEAM_PW_ALPHABET.length]).join('');
}

const TeamTab: React.FC = () => {
  const [staff, setStaff] = useState<any[]>(() => loadLastGood<any[]>('tos:team') || []);
  const [form, setForm] = useState({ name: '', email: '', role: 'support', tempPassword: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<any | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/tos/team');
      setStaff(d.staff || []);
      saveLastGood('tos:team', d.staff || []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const canAdd =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.tempPassword.length >= 10;

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/tos/team', {
        method: 'POST',
        body: { name: form.name, email: form.email, role: form.role, password: form.tempPassword },
      });
      setCreated({ email: form.email.trim(), tempPassword: form.tempPassword, createdAuthUser: !!d.createdAuthUser });
      setForm({ name: '', email: '', role: 'support', tempPassword: '' });
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
        {created ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <p className="font-bold">
                {created.createdAuthUser ? `${created.email} is on the team.` : `${created.email} already had an account and now has platform access.`}
              </p>
            </div>
            {created.createdAuthUser ? (
              <>
                <p className="text-xs text-slate-400">Hand these over. They show this once only and are never stored anywhere. They will be asked to change this password at first sign-in.</p>
                <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 text-xs">Login email</span>
                    <span className="text-white font-bold truncate">{created.email}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 text-xs">Temporary password</span>
                    <span className="flex items-center gap-2">
                      <span className="text-white font-mono font-bold">{created.tempPassword}</span>
                      <button onClick={copyPassword} className="text-orange-300 hover:text-orange-200" title="Copy password">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">Their existing password was left untouched.</p>
            )}
            <button onClick={() => setCreated(null)} className={btnGhost}>Add another</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-56">
                <Field label="Name (optional)"><input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="Their name" /></Field>
              </div>
              <div className="flex-1 min-w-56">
                <Field label="Email"><input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="teammate@example.com" /></Field>
              </div>
              <Field label="Role">
                <select value={form.role} onChange={(e) => set('role', e.target.value)} className={`${inputCls} w-44`}>
                  <option value="support">Support</option>
                  <option value="owner">Owner</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-56">
                <Field label="Temporary password">
                  <input value={form.tempPassword} onChange={(e) => set('tempPassword', e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" />
                </Field>
              </div>
              <button onClick={() => set('tempPassword', generateTeamPassword())} className={btnGhost}>
                <RefreshCw className="w-4 h-4" /> Generate
              </button>
              <button onClick={() => set('tempPassword', '')} className={btnGhost}>Clear</button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={add} disabled={busy || !canAdd} className={btnPrimary}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add teammate
              </button>
              {form.tempPassword.length > 0 && form.tempPassword.length < 10 && (
                <span className="text-xs text-amber-300">The password must be at least 10 characters.</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">A new account is created with this temporary password and the person must change it at first sign-in. Someone who already has an account keeps their password and just gains access. Access is revoked by removing them in Firebase Authentication, not here.</p>
            {error && <p className="text-xs text-rose-300">{error}</p>}
          </div>
        )}
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

  const [appOnly, setAppOnly] = useState<boolean | null>(null);
  const [appOnlyBusy, setAppOnlyBusy] = useState(false);
  const [appOnlyDone, setAppOnlyDone] = useState('');
  useEffect(() => {
    fetch('/api/public/platform-settings')
      .then((r) => r.json())
      .then((d: { appOnlyPortals?: boolean }) => setAppOnly(!!d.appOnlyPortals))
      .catch(() => setAppOnly(false));
  }, []);
  const saveAppOnly = async (next: boolean) => {
    setAppOnlyBusy(true); setAppOnlyDone(''); setError('');
    try {
      await api('/api/tos/platform-settings', { method: 'POST', body: { appOnlyPortals: next } });
      setAppOnly(next);
      setAppOnlyDone(next ? 'App-only mode is on. The three portals now open only inside the app.' : 'App-only mode is off. Portals open in browsers as usual.');
    } catch (e: any) { setError(e.message || 'Could not save the setting.'); }
    finally { setAppOnlyBusy(false); }
  };

  const signOutEverywhere = async () => {
    // Signing out of the TOS console returns to the TOS staff sign-in door,
    // never the landing page or a facility's access-code gate.
    window.location.hash = '#tos-admin';
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

      <Card title="App-only portals">
        <p className="text-slate-400 text-sm">
          When on, the admin, tutor and student portals open only inside the installed app. Any browser, phone or desktop sees an "Open this portal in the app" screen with an install button instead. The TOS console and the landing pages are never affected.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <button
            role="switch"
            aria-checked={!!appOnly}
            aria-label="Toggle app-only portals"
            onClick={() => saveAppOnly(!appOnly)}
            disabled={appOnly === null || appOnlyBusy}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${appOnly ? 'bg-orange-600' : 'bg-slate-600'}`}
          >
            <span className={`pointer-events-none inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow transition duration-200 ${appOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm font-bold text-white">{appOnly === null ? 'Loading' : appOnly ? 'On' : 'Off'}</span>
          {appOnlyBusy && <Loader2 className="w-4 h-4 animate-spin text-orange-400" />}
        </div>
        {appOnlyDone && <p className="text-emerald-300 text-xs mt-2">{appOnlyDone}</p>}
      </Card>

      <Card title="Session">
        <button onClick={signOutEverywhere} className={btnGhost}>Sign out</button>
        <p className="text-[11px] text-slate-500 mt-2">Ends this session on this device.</p>
      </Card>
    </div>
  );
};

// N2: the sidebar groups its items into Business / Content / System. The
// same nav array and groups drive the desktop sidebar and the phone panel:
// on phones the sections sit by the side exactly as arranged on the desktop,
// with a collapse button that closes the panel and a round button that
// brings it back.
const GROUPS = ['Business', 'Content', 'System'] as const;

// ---------------------------------------------------------------------------
// BATCH 27: UPGRADE REQUESTS
// Facilities that paid for seats and are waiting on the platform's word. A
// facility picks Standard or Premium, pays by bank transfer, uploads its
// receipt and contacts the admin on WhatsApp; approving here creates exactly
// the seats paid for (they auto-populate on the facility's dashboard), moves
// the billing to the chosen plan, raises the tier and sends the two
// confirmation emails. Declining tells the facility why.
// ---------------------------------------------------------------------------
const UpgradeRequestsTab: React.FC = () => {
  const [requests, setRequests] = useState<any[]>(() => loadLastGood<any[]>('tos:upgrades') || []);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [declineId, setDeclineId] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  // Batch 27: receipts are viewed on the dashboard, never bounced out to the
  // image host: the receipt opens in a modal here.
  const [receiptView, setReceiptView] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/api/tos/upgrade-requests');
      setRequests(d.requests || []);
      saveLastGood('tos:upgrades', d.requests || []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (requestId: string, action: 'approve' | 'decline', reason = '') => {
    setBusyId(requestId);
    setError('');
    setMessage('');
    try {
      const d = await api('/api/tos/upgrade-requests/decide', {
        method: 'POST',
        body: { requestId, action, declineReason: reason },
      });
      setMessage(
        action === 'approve'
          ? `Approved: ${Array.isArray(d?.seatsCreated) ? d.seatsCreated.length : '?'} seat(s) created on the facility's dashboard and the two confirmation emails sent.`
          : 'Request declined and the facility was told.'
      );
      setDeclineId('');
      setDeclineReason('');
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setBusyId('');
  };

  const chip = (status: string) => {
    if (status === 'approved') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (status === 'declined') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={load} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      {message && <p className="text-xs text-emerald-400 mb-3">{message}</p>}
      {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
      {loading && requests.length === 0 ? (
        <p className="text-sm text-slate-400"><Loader2 className="w-4 h-4 inline animate-spin" /> Loading requests...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-400">No upgrade requests yet. Facilities file one from the Add seat flow: they pick a plan, pay by bank transfer and upload their receipt here.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/5 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Facility</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Seats</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Receipt</th>
                <th className="py-3 px-4">Requested</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {requests.map((r: any) => {
                const pending = String(r.status || '') === 'pending';
                const busy = busyId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-bold text-white">{r.centreName || r.centreId}</td>
                      <td className="py-3 px-4 text-slate-300">{r.planName || r.planId}</td>
                      <td className="py-3 px-4 text-slate-300">{r.seats}</td>
                      <td className="py-3 px-4 font-bold text-white">{`₦${Number(r.total || 0).toLocaleString()}`}</td>
                      <td className="py-3 px-4">
                        {r.receiptUrl ? (
                          <button onClick={() => setReceiptView(r)} className="text-orange-400 hover:text-orange-300 underline">View receipt</button>
                        ) : (
                          <span className="text-slate-500">Awaiting receipt</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">{fmtDateTime(String(r.createdAt || ''))}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${chip(String(r.status || ''))}`}>{r.status}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {pending ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => decide(r.id, 'approve')}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold"
                              title="Creates the seats on the facility's dashboard, moves them to the plan and sends the two confirmation emails"
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Approve
                            </button>
                            <button
                              onClick={() => { setDeclineId(declineId === r.id ? '' : r.id); setDeclineReason(''); }}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 text-slate-300 text-xs font-bold"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">Handled</span>
                        )}
                      </td>
                    </tr>
                    {declineId === r.id && (
                      <tr>
                        <td colSpan={8} className="py-3 px-4 bg-white/5">
                          <div className="flex items-center gap-2">
                            <input
                              value={declineReason}
                              onChange={(e) => setDeclineReason(e.target.value)}
                              placeholder="Why it is declined (the facility sees this)"
                              className="flex-1 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-orange-500/60"
                            />
                            <button
                              onClick={() => decide(r.id, 'decline', declineReason)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold"
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                              Confirm decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {receiptView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setReceiptView(null)}>
          <div className="bg-slate-950 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0">
              <div>
                <p className="text-sm font-bold text-white">{receiptView.centreName || receiptView.centreId}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {receiptView.planName} · {receiptView.seats} seat{Number(receiptView.seats) === 1 ? '' : 's'} · {`₦${Number(receiptView.total || 0).toLocaleString()}`}
                </p>
              </div>
              <button onClick={() => setReceiptView(null)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-900 min-h-[320px] flex items-center justify-center p-4">
              {/\.pdf($|\?)/i.test(String(receiptView.receiptUrl || ''))
                ? <iframe src={String(receiptView.receiptUrl)} className="w-full h-[68vh] rounded-xl bg-white" title="Payment receipt" />
                : <img src={String(receiptView.receiptUrl)} alt="Payment receipt" className="max-w-full max-h-[68vh] object-contain rounded-xl" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TABS = [
  { id: 'overview', label: 'Overview', mlabel: 'Home', icon: LayoutDashboard, group: 'Business' },
  { id: 'leads', label: 'Leads', mlabel: 'Leads', icon: UserPlus, group: 'Business' },
  { id: 'centres', label: 'Facilities', mlabel: 'Facilities', icon: Building2, group: 'Business' },
  { id: 'plans', label: 'Plans', mlabel: 'Plans', icon: Wallet, group: 'Business' },
  { id: 'upgrades', label: 'Upgrade Requests', mlabel: 'Upgrades', icon: FileText, group: 'Business' },
  { id: 'proposals', label: 'Proposals', mlabel: 'Proposals', icon: Share2, group: 'Business' },
  { id: 'settings', label: 'Settings', mlabel: 'Settings', icon: Settings, group: 'Business' },
  { id: 'questions', label: 'Question Bank', mlabel: 'Bank', icon: BookOpen, group: 'Content' },
  { id: 'mocks', label: 'Mocks', mlabel: 'Mocks', icon: CalendarDays, group: 'Content' },
  { id: 'chat', label: 'Chat', mlabel: 'Chat', icon: MessageSquare, group: 'Content' },
  { id: 'website', label: 'Website', mlabel: 'Website', icon: Globe, group: 'Content' },
  { id: 'audit', label: 'Audit log', mlabel: 'Audit', icon: ScrollText, group: 'System' },
  { id: 'team', label: 'Team', mlabel: 'Team', icon: Users, group: 'System' },
  { id: 'account', label: 'Account', mlabel: 'Account', icon: UserRound, group: 'System' },
] as const;

// Question Bank shell (MB1 Step 1): Question Bank opens on the bank hub
// (design screen 1). Opening a bank enters that bank's workspace: it wears
// the bank's colour (Practice sky, Mock amber) and a banner that always says
// which bank you are in, with a Switch bank link back to the hub. Each bank
// has its own tabs and every screen below the banner lists only that bank's
// questions; nothing in the UI moves a question across.
//   Practice: Library, Import & edit, Publish (badge = changes ready to go out)
//   Mock:     Library, Import, Publish (badge = drafts waiting to go live),
//             Mock papers (the mock list)
const QB_STREAM_KEY = 'TOS_qb_stream';
const QB_SUBS_PRACTICE = [
  { id: 'library', label: 'Library' },
  { id: 'edit', label: 'Import & edit' },
  { id: 'publish', label: 'Publish' },
] as const;
const QB_SUBS_MOCK = [
  { id: 'library', label: 'Library' },
  { id: 'import', label: 'Import' },
  { id: 'publish', label: 'Publish' },
  { id: 'papers', label: 'Mock papers' },
] as const;

// U1: the "How this works" guide. A plain-language side panel for a new
// staff member: what the shelf is, what the statuses mean, and the order of
// work. Nothing in it is hard-coded to the current data. It opens by itself
// the first time Question Bank is opened on this device (remembered in
// localStorage, best effort); the (?) button always brings it back.
const QB_GUIDE_SEEN_KEY = 'TOS_qb_guide_seen';

const QbGuidePanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 lg:bg-slate-950/80 lg:flex lg:justify-end" onClick={onClose}>
      <div className="w-full lg:max-w-[480px] h-full bg-slate-950 border-l border-slate-800 overflow-y-auto p-5 lg:p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white">How this works</p>
          <button onClick={onClose} aria-label="Close the guide" className="p-2 rounded-lg text-slate-400 hover:text-white min-h-[44px] min-w-[44px]"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-2">The shelf, top to bottom</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {['Stream', 'Exam', 'Subject', 'Topic', 'Year', 'Question'].map((step, i) => (
              <React.Fragment key={step}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span className="px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-200 text-xs font-bold whitespace-nowrap">{step}</span>
              </React.Fragment>
            ))}
          </div>
          <p className="text-sm text-slate-300 mt-2">You open one level at a time: pick a stream, then an exam, a subject, a topic and a year. Questions only appear at the bottom of that path, or in search results. Search looks across the whole stream from wherever you are.</p>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-1">Practice and Mock are two separate banks</p>
          <p className="text-sm text-slate-300">Practice feeds student practice across every facility. Mock feeds the daily mock exam. Each keeps its own questions, its own counts and its own published file, so switching the stream at the top switches every tab below it.</p>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-1">Every question carries an exam pipeline</p>
          <p className="text-sm text-slate-300">JAMB or WAEC/NECO. The shelf can filter by it, and each import chooses it once for the whole batch.</p>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-1">What the statuses mean</p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li><span className="font-bold text-slate-100">Draft:</span> saved but not live for students yet.</li>
            <li><span className="font-bold text-slate-100">Published:</span> went live with a publish.</li>
            <li><span className="font-bold text-slate-100">Changed since publish:</span> a published question you edited; the next publish carries the change.</li>
            <li><span className="font-bold text-slate-100">Removed:</span> taken out of the bank; it waits in the Removed list until the bin is emptied.</li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-1">The order of work</p>
          <p className="text-sm text-slate-300">Import & edit first: paste questions in (they arrive as drafts) and fix anything that needs it. Publish second: review the change list, then confirm. A publish writes one new versioned file and never overwrites an older one.</p>
        </div>

        <div>
          <p className="text-sm font-bold text-orange-300 mb-1">"Setup needed"</p>
          <p className="text-sm text-slate-300">The library counts questions from counter documents, not by scanning the bank. The first time a stream is used it needs a backfill (adds search keys to existing questions) and a recount (builds those counters). Both show a preview first and write nothing until you confirm.</p>
        </div>

        <button onClick={() => { try { localStorage.setItem(QB_GUIDE_SEEN_KEY, '1'); } catch { /* storage unavailable */ } onClose(); }} className={btnPrimary}>Got it, don't show this again</button>
        <p className="text-[11px] text-slate-500">The (?) button at the top of Question Bank brings this back at any time.</p>
      </div>
    </div>
  );
};

type BankMode = 'hub' | 'practice' | 'mock';

const QuestionBankShell: React.FC<{ refreshKey: number; onNewMock?: () => void }> = ({ refreshKey, onNewMock }) => {
  // The hub is the landing screen every time Question Bank opens.
  const [mode, setMode] = useState<BankMode>('hub');
  const [sub, setSub] = useState<string>('library');
  const [localRefresh, setLocalRefresh] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  // One small server read serves the hub cards, the tab badges and the
  // banner's live-version line. It loads on entry and on Refresh.
  const [summary, setSummary] = useState<Json | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(QB_GUIDE_SEEN_KEY)) setGuideOpen(true); } catch { /* storage unavailable */ }
  }, []);

  const fullKey = refreshKey + localRefresh;
  useEffect(() => {
    let alive = true;
    setSummaryLoading(true);
    setSummaryError('');
    api('/api/tos/questionbank/bank-summary')
      .then((r) => { if (alive) setSummary(r); })
      .catch((e: any) => { if (alive) setSummaryError(e?.message || 'Could not load the bank numbers.'); })
      .finally(() => { if (alive) setSummaryLoading(false); });
    return () => { alive = false; };
  }, [fullKey]);

  const openBank = (k: 'practice' | 'mock') => {
    setMode(k);
    setSub('library');
    try { localStorage.setItem(QB_STREAM_KEY, k); } catch { /* storage unavailable */ }
  };
  const refresh = () => setLocalRefresh((n) => n + 1);

  if (mode === 'hub') {
    return (
      <div className="space-y-5">
        <div className="flex justify-end gap-2">
          <button onClick={() => setGuideOpen(true)} aria-label="How this works" title="How this works"
            className="p-2.5 rounded-xl border border-slate-700/60 text-slate-300 hover:text-white min-h-[44px] min-w-[44px]">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
        <QuestionBankHub
          summary={summary as { practice: any; mock: any } | null}
          loading={summaryLoading}
          error={summaryError}
          onOpen={openBank}
        />
        <QbGuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    );
  }

  const isMock = mode === 'mock';
  const kind = isMock ? 'mock' : 'practice';
  const subs = isMock ? QB_SUBS_MOCK : QB_SUBS_PRACTICE;
  const liveVersion = Number((summary as any)?.practice?.currentVersion) || 0;
  const badge = isMock
    ? Number((summary as any)?.mock?.pending) || 0
    : Number((summary as any)?.practice?.pending) || 0;

  return (
    <div className={`space-y-4 ${isMock ? 'bank-scope-mock' : 'bank-scope-practice'}`}>
      {/* The banner always says which bank this is (design screens 2-7). */}
      <div className={`rounded-2xl border px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${isMock ? 'border-amber-400/50 bg-amber-400/10' : 'border-sky-400/50 bg-sky-400/10'}`}>
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-black tracking-wide ${isMock ? 'bg-amber-400 text-slate-950' : 'bg-sky-400 text-slate-950'}`}>
          YOU ARE IN THE {isMock ? 'MOCK' : 'PRACTICE'} BANK
        </span>
        <p className="text-xs text-slate-300 flex-1 min-w-[220px] leading-relaxed">
          {isMock
            ? 'Daily mocks are built from this bank. Papers are private; answers never leave the server.'
            : `Students practise from this bank${liveVersion ? `: live version ${liveVersion}` : ''}.`}
        </p>
        <button onClick={() => setMode('hub')}
          className="text-xs font-bold text-slate-300 hover:text-white inline-flex items-center gap-0.5 min-h-[44px]">
          Switch bank <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black text-white mr-auto">{isMock ? 'Mock Bank' : 'Practice Bank'}</h2>
          <button onClick={refresh} aria-label="Refresh this bank" title="Refresh"
            className="p-2.5 rounded-xl border border-slate-700/60 text-slate-300 hover:text-white min-h-[44px] min-w-[44px]">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setGuideOpen(true)} aria-label="How this works" title="How this works"
            className="p-2.5 rounded-xl border border-slate-700/60 text-slate-300 hover:text-white min-h-[44px] min-w-[44px]">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 mt-2">
          {subs.map((t) => (
            <button key={t.id} onClick={() => setSub(t.id)}
              className={`min-h-[44px] px-5 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap inline-flex items-center gap-2 ${sub === t.id
                ? (isMock ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-orange-500/15 text-orange-300 border-orange-500/30')
                : 'text-slate-400 border-white/10 hover:text-white'}`}>
              {t.label}
              {t.id === 'publish' && badge > 0 && (
                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-black ${isMock ? 'bg-amber-400 text-slate-950' : 'bg-orange-500 text-white'}`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {sub === 'library' && <QuestionLibraryTab refreshKey={fullKey} kind={kind} onKindChange={openBank} />}
      {isMock && sub === 'import' && <QuestionBankTab refreshKey={fullKey} view="edit" kind={kind} onKindChange={openBank} />}
      {isMock && sub === 'publish' && <QuestionBankTab refreshKey={fullKey} view="publish" kind={kind} onKindChange={openBank} />}
      {isMock && sub === 'papers' && <MockPapersTab refreshKey={fullKey} onNewMock={onNewMock} />}
      {!isMock && sub === 'edit' && <QuestionBankTab refreshKey={fullKey} view="edit" kind={kind} onKindChange={openBank} />}
      {!isMock && sub === 'publish' && <QuestionBankTab refreshKey={fullKey} view="publish" kind={kind} onKindChange={openBank} />}
      <QbGuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
};

export const TosPortal: React.FC = () => {
  // Refresh persistence: the dashboard reopens on the tab (and facility) the
  // admin was on before the refresh, never back on Overview.
  const TOS_TAB_KEY = 'tos:tab';
  const TOS_CENTRE_KEY = 'tos:openCentreId';
  const [tab, setTabState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TOS_TAB_KEY) || '';
      if (TABS.some((t) => t.id === saved)) return saved;
    } catch { /* storage unavailable */ }
    return 'overview';
  });
  const setTab = (t: string) => {
    setTabState(t);
    try {
      localStorage.setItem(TOS_TAB_KEY, t);
      if (t !== 'centres') localStorage.removeItem(TOS_CENTRE_KEY);
    } catch { /* storage unavailable */ }
  };
  const [refreshKey, setRefreshKey] = useState(0);
  const [openCentreId, setOpenCentreIdState] = useState<string>(() => {
    try {
      if (localStorage.getItem(TOS_TAB_KEY) === 'centres') return localStorage.getItem(TOS_CENTRE_KEY) || '';
    } catch { /* storage unavailable */ }
    return '';
  });
  const setOpenCentreId = (id: string) => {
    setOpenCentreIdState(id);
    try { localStorage.setItem(TOS_CENTRE_KEY, id); } catch { /* storage unavailable */ }
  };
  const [mocksCreateKey, setMocksCreateKey] = useState(0);

  // Mobile sections panel: on phones the sections sit by the side, exactly as
  // arranged on the desktop. The button on the panel collapses it; the round
  // button brings it back. The choice survives a refresh. Defaults collapsed:
  // a fresh visitor (or one coming from the landing page) opens the console
  // with the nav tucked away, never covering the content.
  const TOS_NAV_KEY = 'tos:navOpen';
  const [mobileNavOpen, setMobileNavOpenState] = useState<boolean>(() => {
    try { return localStorage.getItem(TOS_NAV_KEY) === '1'; } catch { return false; }
  });
  const setMobileNavOpen = (open: boolean) => {
    setMobileNavOpenState(open);
    try { localStorage.setItem(TOS_NAV_KEY, open ? '1' : '0'); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) { setOpenCentreId(id); setTab('centres'); }
    };
    window.addEventListener('tos-open-centre', handler);
    return () => window.removeEventListener('tos-open-centre', handler);
  }, []);

  // MB2: the Overview "Create it" button and the Mock papers "+ New mock"
  // button both land on the Mocks screen with the create form already open.
  useEffect(() => {
    const handler = () => { setTab('mocks'); setMocksCreateKey((k) => k + 1); };
    window.addEventListener('tos-open-mocks-new', handler);
    return () => window.removeEventListener('tos-open-mocks-new', handler);
  }, []);

  // No automatic refresh anywhere: every tab loads when opened and when the
  // staff member acts, and each tab header carries a visible Refresh button.
  // Nothing reloads behind the admin's back, so an open form, a typed
  // confirm or a scroll position can never be wiped by a timer, and idle
  // screens cost zero reads.

  // One nav body drives the desktop sidebar and the phone panel, so phones
  // show the exact same sections, in the same groups, in the same order.
  const navBody = (
    <>
      <nav className="space-y-5 flex-1 min-h-0 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-600 px-3.5 mb-1.5">{g}</p>
            <div className="space-y-1">
              {TABS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === t.id ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-white/5">
        <button
          onClick={() => { window.location.hash = '#landing'; }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          title="Open the Tutorial OS landing page. You stay signed in: three quick taps on the Tutorial OS logo bring you straight back here."
        >
          <Globe className="w-4 h-4" />
          Landing page
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/5 bg-slate-950 p-5 sticky top-0 h-screen overflow-hidden">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-orange-400">Tutorial OS</p>
            <p className="text-sm font-black text-white">Platform</p>
          </div>
        </div>
        {navBody}
      </aside>

      {/* Mobile: the same sections by the side, collapsible. Open by default;
          the button on the panel collapses it, the round button brings it back. */}
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-60 bg-slate-950 border-r border-white/5 p-5 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${mobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-orange-400">Tutorial OS</p>
              <p className="text-sm font-black text-white">Platform</p>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            title="Collapse sections"
            aria-label="Collapse sections"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>
        {navBody}
      </aside>

      {/* Brings the sections back after collapsing: sits at the top, where the
          collapse button it mirrors lives */}
      {!mobileNavOpen && (
        <button
          onClick={() => setMobileNavOpen(true)}
          title="Show sections"
          aria-label="Show sections"
          className="md:hidden fixed top-3 left-3 z-40 w-11 h-11 rounded-full bg-slate-900 border border-white/10 text-slate-300 grid place-items-center shadow-lg active:scale-95 transition-transform"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 p-5 md:p-8">
        <header className={`mb-6 ${!mobileNavOpen ? 'pl-12 md:pl-0' : ''}`}>
          <h1 className="text-2xl font-black text-white tracking-tight capitalize">{TABS.find((t) => t.id === tab)?.label}</h1>
          <p className="text-slate-400 text-xs mt-1">
            {tab === 'overview' && 'Everything happening across the platform right now.'}
            {tab === 'leads' && 'Trial owners who have not yet signed in and set their own password.'}
            {tab === 'centres' && 'Facilities whose owners have set their own password. Plan, seats, billing and access code.'}
            {tab === 'plans' && 'Pricing and feature flags. All stored as data. Seat settings live under Settings.'}
            {tab === 'upgrades' && 'Facilities that paid for seats and are waiting on your word. Approving creates their seats and emails them.'}
            {tab === 'proposals' && 'Generate a partnership proposal link or PDF for any facility, addressed to them by name.'}
            {tab === 'settings' && 'Seat policy and platform settings. Saved values are enforced live and checked on the server.'}
            {tab === 'questions' && 'Two separate banks: Practice and Mock. Pick one on the hub to work in.'}
            {tab === 'mocks' && "One mock a day for every facility's students. Create, freeze and manage them from here."}
            {tab === 'chat' && 'The platform channel, chat settings and escalated reports.'}
            {tab === 'website' && 'Each facility\'s public landing page: template, content and publish.'}
            {tab === 'audit' && 'Every privileged action, recorded.'}
            {tab === 'team' && 'The people who run the platform.'}
            {tab === 'account' && 'Your platform profile, password and sign-out.'}
          </p>
        </header>

        {tab === 'overview' && <OverviewTab onOpenCentre={(id) => { setOpenCentreId(id); setTab('centres'); }} refreshKey={refreshKey} onDataLoaded={() => setRefreshKey((k) => k)} />}
        {tab === 'leads' && <LeadsTab refreshKey={refreshKey} />}
        {tab === 'centres' && <CentresTab refreshKey={refreshKey} openCentreId={openCentreId} onClearOpenCentre={() => setOpenCentreId('')} onDataChanged={() => setRefreshKey((k) => k + 1)} />}
        {tab === 'questions' && <QuestionBankShell refreshKey={refreshKey} onNewMock={() => { setTab('mocks'); setMocksCreateKey((k) => k + 1); }} />}
        {tab === 'library' && <QuestionLibraryTab refreshKey={refreshKey} />}
        {tab === 'mocks' && <MocksTab refreshKey={refreshKey} openCreateSignal={mocksCreateKey} />}
        {tab === 'chat' && <TosChat refreshKey={refreshKey} />}
        {tab === 'website' && <WebsiteTab refreshKey={refreshKey} />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'upgrades' && <UpgradeRequestsTab />}
        {tab === 'proposals' && <ProposalsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'account' && <AccountTab />}
      </main>
    </div>
  );
};

export default TosPortal;
