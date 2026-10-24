import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, ChevronLeft, AlertTriangle, Send, Ban, RefreshCw,
  Copy, Wallet, CheckCircle2, Plus, Trash2,
} from 'lucide-react';
import {
  api, money, fmtDate, fmtDateTime, STATUS_LABELS, Json,
  StatusPill, Card, Field, inputCls, btnPrimary, btnGhost, CredentialsModal,
} from './tosShared';
import { CentrePeople } from './TosDirectory';
import { AddCentreModal } from './TosAddCentre';

// NOTE: this module was split out of TosPortal.tsx mechanically; code is
// moved verbatim with no behavior change. TosPortal.tsx imports it back.

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
  const [ownerNote, setOwnerNote] = useState('');
  const [confirmCode, setConfirmCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
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

  // Centre deletion: platform-only action, confirmed by typing the centre
  // name and giving a reason. The whole centre leaves the platform.
  const deleteCentreNow = async () => {
    setBusy('delete-centre');
    setActionError('');
    try {
      await api(`/api/tos/centres/${centreId}/action`, { method: 'POST', body: { type: 'delete-centre', reason: deleteReason } });
      setConfirmDelete(false);
      onDataChanged();
      onBack();
    } catch (e: any) {
      setActionError(e.message || 'Could not delete the centre.');
    } finally {
      setBusy('');
    }
  };

  if (error) return <div><button onClick={onBack} className="text-orange-300 text-sm mb-3 inline-flex items-center gap-1.5"><ChevronLeft className="w-4 h-4" /> All centres</button><p className="text-rose-300 text-sm">{error}</p></div>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const { centre, billing, payments } = data;
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
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => doAction('resend-credentials', {}, (r) => {
              if (r.tempPassword) {
                setCredentials({ centreName: centre.name, email: centre.ownerEmail, password: r.tempPassword, accessCode: centre.accessCode });
              } else {
                setOwnerNote('A new temporary password was sent to the owner by email.');
              }
            })}
            disabled={busy === 'resend-credentials'}
            className={btnGhost}
          >
            {busy === 'resend-credentials' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Reset owner password
          </button>
          {ownerNote && <p className="text-xs text-emerald-300">{ownerNote}</p>}
        </div>
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
            {!billing?.skippedTrial ? (
              <div className="flex items-end gap-2">
                <Field label="Extend trial (days)">
                  <input type="number" min="1" max="365" value={seatEdits.extendDays} onChange={(e) => setSeatEdits((s) => ({ ...s, extendDays: e.target.value }))} className={`${inputCls} w-28`} />
                </Field>
                <button onClick={() => doAction('extend-trial', { days: Number(seatEdits.extendDays) })} disabled={busy !== ''} className={btnGhost}>Extend</button>
              </div>
            ) : (
              <button onClick={() => doAction('start-trial')} disabled={busy !== ''} className={btnPrimary}>Start trial</button>
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
              <button onClick={() => { setConfirmDelete(true); setDeleteName(''); setDeleteReason(''); }} disabled={busy !== ''} className={btnGhost}>
                <Trash2 className="w-4 h-4 text-rose-400" /> Delete centre
              </button>
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
            <p className="text-[11px] text-slate-500">Codes are system-generated only, so there is never a mix-up between centres.</p>
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

      <Card title="People">
        <CentrePeople centreId={centreId} />
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
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0"><AlertTriangle className="w-4.5 h-4.5 text-rose-400" /></div>
              <h3 className="text-white font-bold pt-1">Delete {centre.name}?</h3>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              The centre, its people records, exams, timetable, results, attendance, ratings, programmes, subjects, billing, payments, settings and access codes are all removed. This cannot be undone. Type the centre name to confirm, and add a reason for the record.
            </p>
            <div className="mt-3 space-y-2">
              <Field label="Type the centre name to confirm">
                <input value={deleteName} onChange={(e) => setDeleteName(e.target.value)} className={inputCls} placeholder={centre.name} />
              </Field>
              <Field label="Reason">
                <input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className={inputCls} />
              </Field>
            </div>
            {actionError && <p className="text-rose-300 text-xs mt-2">{actionError}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(false)} className={`${btnGhost} flex-1`}>Cancel</button>
              <button
                onClick={deleteCentreNow}
                disabled={busy !== '' || deleteName !== centre.name || !deleteReason.trim()}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm"
              >
                {busy === 'delete-centre' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
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

export const CentresTab: React.FC<{ refreshKey: number; openCentreId: string; onClearOpenCentre: () => void; onDataChanged: () => void }> = ({ refreshKey, openCentreId, onClearOpenCentre, onDataChanged }) => {
  const [centres, setCentres] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(openCentreId || null);
  const [adding, setAdding] = useState(false);

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
        <button onClick={() => setAdding(true)} className={btnPrimary}><Plus className="w-4 h-4" /> Add centre</button>
      </div>
      {adding && (
        <AddCentreModal
          onClose={() => setAdding(false)}
          onCreated={(centreId) => { setAdding(false); load(); setSelected(centreId); onDataChanged(); }}
        />
      )}
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : shown.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No centres match. New centres appear here the moment they are provisioned.</p></Card>
      ) : (
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-bold">Centre</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold">Seats</th>
                <th className="px-4 py-3 font-bold">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.id)} className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-bold">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.ownerEmail || 'no owner email'}</p>
                    {c.credentialsNotDelivered && <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 mt-0.5"><AlertTriangle className="w-3 h-3" /> credentials undelivered</span>}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={c.billingStatus} /></td>
                  <td className="px-4 py-3 text-xs text-slate-300">{c.planId ? c.planId.replace('centre_', 'Centre ').replace('_', ' ') : 'no plan'}{c.trialEndsAt && c.billingStatus === 'trial' ? <span className="block text-slate-500">trial ends {fmtDate(c.trialEndsAt)}</span> : null}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{c.seatsUsed ?? 0} / {c.seatCap ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.createdAt ? fmtDate(c.createdAt) : '—'}</td>
                  <td className="px-4 py-3 text-right"><span className="text-[11px] font-bold text-orange-300">Open →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
