import React, { useCallback, useState, useEffect } from 'react';
import {
  Users,
  Sparkles,
  AlertCircle,
  RefreshCw,
  History,
  UserPlus,
  X,
  Lock,
  CircleDot,
  CheckCircle2,
  Copy,
  Upload,
  MessageCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';
import { Student, SeatSummary } from '../../types';

interface SeatsManagementPanelProps {
  students: Student[];
}

const statusChip = (status: string) => {
  if (status === 'active')
    return 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] border-transparent';
  if (status === 'locked')
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
};

const statusLabel = (status: string) =>
  status === 'active' ? 'Running' : status === 'locked' ? 'Locked' : 'Paused';

const fmtDay = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '';

export const SeatsManagementPanel: React.FC<SeatsManagementPanelProps> = ({ students }) => {
  const {
    activeCentreId,
    activeCentre,
    seatsSummary,
    refreshSeatsSummary,
    setSeatSwitch,
    assignStudentToSeat,
    addToast,
  } = useApp();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailSeat, setDetailSeat] = useState<SeatSummary | null>(null);
  const [seatSwitchingId, setSeatSwitchingId] = useState<string | null>(null);
  const [assignSeat, setAssignSeat] = useState<SeatSummary | null>(null);
  const [assignPick, setAssignPick] = useState('');
  const [assigning, setAssigning] = useState(false);
  // Batch 27: the full plan read carries everything the upgrade flow needs:
  // the plans, the paid-seat minimum, how many active paid seats the facility
  // holds, the cap, the pay account and the admin WhatsApp number.
  const [planState, setPlanState] = useState<any>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<'plan' | 'students' | 'account' | 'receipt'>('plan');
  const [chosenPlan, setChosenPlan] = useState<{ id: string; name: string; price: number } | null>(null);
  const [seatCountPick, setSeatCountPick] = useState('5');
  const [requestId, setRequestId] = useState('');
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);
  // Batch 27: the facility sees its uploaded receipt before it messages the
  // admin, so it can be sure the right file went up.
  const [receiptPreview, setReceiptPreview] = useState('');

  useEffect(() => {
    refreshSeatsSummary();
  }, [activeCentreId]);

  // Batch 22: the facility's chosen plan, shown above the pool. The chosen
  // plan bills every seat the facility creates, per student per month.
  useEffect(() => {
    if (!activeCentreId) return;
    let alive = true;
    api(`/api/centre/seats/plan?centreId=${encodeURIComponent(activeCentreId)}`)
      .then((d: any) => { if (alive) setPlanState(d); })
      .catch(() => { /* the card hides when the plan lookup fails */ });
    return () => { alive = false; };
  }, [activeCentreId]);

  // Re-reads the plan payload (plans, minimum, pending upgrade) without a
  // remount, so the pending-confirmation banner stays current after the
  // upgrade flow closes or the admin acts.
  const refreshPlan = useCallback(async () => {
    if (!activeCentreId) return;
    try {
      const d: any = await api(`/api/centre/seats/plan?centreId=${encodeURIComponent(activeCentreId)}`);
      setPlanState(d);
    } catch { /* the card hides when the plan lookup fails */ }
  }, [activeCentreId]);

  const seats = seatsSummary?.seats ?? [];
  const pool = seatsSummary?.pool ?? {
    total: seats.length,
    active: 0,
    available: 0,
    locked: 0,
    bankedDays: 0,
  };
  const enrolled = students.filter((s) => s.status !== 'Suspended').length;
  const used = seatsSummary?.used ?? students.filter((s) => s.status !== 'Suspended').length;
  // Batch 26: a lead (signed up, never upgraded) gets a lead chip in place
  // of the old trial countdown.
  const isLead = (seatsSummary?.tier ?? 'lead') === 'lead';

  // Which seat each student holds, straight from the pool.
  const seatByUid = new Map<string, SeatSummary>();
  seats.forEach((s) => {
    if (s.studentUid) seatByUid.set(s.studentUid, s);
  });

  const handleSeatSwitch = async (seat: SeatSummary, active: boolean) => {
    setSeatSwitchingId(seat.id);
    setErrorMessage(null);
    try {
      await setSeatSwitch(seat.id, active);
      await refreshSeatsSummary();
      addToast({
        type: 'success',
        title: active ? `Seat ${seat.seatNo} switched on` : `Seat ${seat.seatNo} switched off`,
        description: active
          ? `Seat ${seat.seatNo}'s day count is running now, with or without a student on it.`
          : seat.studentName
          ? `${seat.studentName} left Seat ${seat.seatNo}; their access is off and their app now shows the contact-admin banner. The seat is paused with its remaining days.`
          : `Seat ${seat.seatNo} is paused; its days stop counting and its remaining days are safe.`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to switch the seat.');
      addToast({
        type: 'error',
        title: 'Action Denied',
        description: err.message || 'Could not switch the seat.',
      });
    } finally {
      setSeatSwitchingId(null);
    }
  };

  const handleAssign = async () => {
    if (!assignSeat || !assignPick) return;
    const student = students.find((s) => (s.uid || s.id) === assignPick);
    setAssigning(true);
    setErrorMessage(null);
    try {
      await assignStudentToSeat(assignSeat.id, assignPick);
      await refreshSeatsSummary();
      addToast({
        type: 'success',
        title: `Added to Seat ${assignSeat.seatNo}`,
        description: `${student?.name || 'The student'} now holds Seat ${assignSeat.seatNo}; their access is on and they can sign in.`,
      });
      setAssignSeat(null);
      setAssignPick('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add the student to the seat.');
      addToast({
        type: 'error',
        title: 'Action Denied',
        description: err.message || 'Could not add the student to the seat.',
      });
    } finally {
      setAssigning(false);
    }
  };


  // Batch 27: Add seat opens the upgrade flow: pick a plan, pick how many
  // students, pay by bank transfer, upload the receipt. The seats land by
  // themselves once Tutorial OS confirms the payment.
  const openUpgradeFlow = () => {
    const minimum = Number(planState?.paidSeatMinimum ?? 5);
    const activePaid = Number(planState?.activePaidSeats ?? 0);
    const start = activePaid >= 1 ? Math.max(1, minimum - activePaid) : Math.max(1, minimum);
    setSeatCountPick(String(start));
    setFlowStep('plan');
    setChosenPlan(null);
    setRequestId('');
    setReceiptDone(false);
    setReceiptPreview('');
    setFlowOpen(true);
  };

  // The smallest purchase the platform accepts right now: active paid seats
  // plus this purchase may never land below the minimum. The dropdown only
  // ever shows counts from here up, so an under-minimum pick is impossible.
  const minSeats = (() => {
    const minimum = Number(planState?.paidSeatMinimum ?? 5);
    const activePaid = Number(planState?.activePaidSeats ?? 0);
    return activePaid >= 1 ? Math.max(1, minimum - activePaid) : Math.max(1, minimum);
  })();
  const maxSeats = (() => {
    const held = Number(planState?.paidSeatsHeld ?? 0);
    const cap = Number(planState?.paidMaxSeats ?? 0);
    return Math.min(200, Math.max(minSeats, cap > 0 ? cap - held : 50));
  })();
  const pickedSeats = Math.max(minSeats, Math.min(maxSeats, Number(seatCountPick) || minSeats));
  const seatTotal = chosenPlan ? pickedSeats * Number(chosenPlan.price || 0) : 0;
  const nairaFmt = (n: number) => `\u20A6${Number(n || 0).toLocaleString()}`;

  // The payment is filed only together with its receipt: upload + request in
  // one step, so a payment without proof can never sit waiting for
  // confirmation. The Done button stays locked until the receipt is in.
  const handleReceiptUpload = async (file: File) => {
    if (!activeCentreId || !chosenPlan || !file) return;
    if (file.size > 4 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Too large', description: 'The receipt can be up to 4 MB.' });
      return;
    }
    setReceiptUploading(true);
    setErrorMessage(null);
    try {
      const data: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      setReceiptPreview(data);
      const d: any = await api('/api/centre/seats/upgrade-request', {
        method: 'POST',
        body: { centreId: activeCentreId, planId: chosenPlan.id, seats: pickedSeats, receiptData: data },
      });
      setRequestId(String(d?.request?.id || ''));
      setReceiptDone(true);
      addToast({ type: 'success', title: 'Receipt uploaded', description: 'Your payment is now awaiting confirmation from Tutorial OS.' });
    } catch (err: any) {
      setReceiptDone(false);
      addToast({ type: 'error', title: 'Could not upload the receipt', description: err.message || 'Try again.' });
    } finally {
      setReceiptUploading(false);
    }
  };

  const openWhatsApp = () => {
    const raw = String(planState?.whatsappNumber || '09030064109').replace(/\D/g, '');
    const intl = raw.startsWith('0') ? `234${raw.slice(1)}` : raw;
    const centreName = String(activeCentre?.name || 'Our facility');
    const text = encodeURIComponent(
      `Hello Tutorial OS, ${centreName} has paid ${nairaFmt(seatTotal)} for ${pickedSeats} seats on the ${chosenPlan?.name || ''} plan. The receipt is uploaded. Please confirm our payment and activate our seats.`
    );
    window.open(`https://wa.me/${intl}?text=${text}`, '_blank', 'noopener');
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm transition-all mb-8">
      {/* Top header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-[var(--brand,#0F172A)]/10 text-[var(--brand,#0F172A)] dark:text-[var(--brand-tint,#93c5fd)] flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Seat Control Room</span>
                {isLead && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-3 h-3" />
                    Lead · free seats
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                You pay for seats, not students. A seat only counts while a student is on it:
                adding a student switches the seat on and starts its count, and switching them off
                pauses it with its remaining days. When a seat's days run out it locks until a new
                payment reopens it.
              </p>
            </div>
          </div>
        </div>
        {planState?.pendingUpgrade && (
          <div className="mb-5 rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3.5 flex items-start gap-3">
            <span className="relative flex h-3 w-3 mt-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <div>
              <p className="text-xs font-black text-amber-800 dark:text-amber-300">
                Awaiting confirmation from Tutorial OS
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                {planState.pendingUpgrade.planName || 'Your'} upgrade, {planState.pendingUpgrade.seats} seat{Number(planState.pendingUpgrade.seats) === 1 ? '' : 's'} ({nairaFmt(planState.pendingUpgrade.total || 0)}), is awaiting confirmation from Tutorial OS. Once it is confirmed, the seats appear here by themselves. Nothing else to do.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={openUpgradeFlow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all"
            title="Pick a plan, pay and upload your receipt; your seats land once Tutorial OS confirms"
          >
            <UserPlus className="w-4 h-4" />
            Add seat
          </button>
          <button
            onClick={() => refreshSeatsSummary()}
            className="p-2 text-slate-400 hover:text-[var(--brand,#0F172A)] rounded-xl hover:bg-slate-50 dark:hover:brightness-110 transition-colors"
            title="Refresh seats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pool metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Seats
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{pool.total}</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Running now
          </span>
          <span className="text-2xl font-black text-[var(--brand,#0F172A)] dark:text-[var(--brand-tint,#93c5fd)]">
            {pool.active}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Paused seats
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            {pool.available}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Locked
          </span>
          <span className="text-2xl font-black text-rose-500">{pool.locked}</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Paused days
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            {pool.bankedDays}
          </span>
        </div>
      </div>

      {/* Error notice */}
      {errorMessage && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs underline hover:text-rose-700 dark:hover:text-rose-300 ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {planState && planState.plans.length > 0 && (
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-4">
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Plan</p>
            <p className="text-[11px] text-slate-400 mt-0.5">The chosen plan bills every seat you create, per student per month.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-900 dark:text-white">
              {(() => {
                const current = (planState.plans || []).find((p: any) => p.id === planState.planId);
                return current
                  ? `${current.name}${Number(current.price) > 0 ? ` · \u20A6${Number(current.price).toLocaleString()}/seat/month` : ' · free seats only'}`
                  : 'Free · free seats only';
              })()}
            </span>
            <button
              onClick={openUpgradeFlow}
              className="text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl px-3 py-2 transition-all"
              title="Move to a new plan: pick one, pay and upload your receipt"
            >
              Upgrade
            </button>
          </div>
        </div>
      )}

      {/* Seat pool: a table with a live switch on every seat */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">The pool</h3>
          <span className="text-[11px] text-slate-400">
            {enrolled} enrolled · {used} holding a running seat{seats.some((s) => (s as any).kind === 'free') ? ` · ${seats.filter((s) => (s as any).kind === 'free').length} free` : ''}
          </span>
        </div>
        {seatsSummary?.freeSeatsUnlocked === false && seats.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
            Free seats unlock once the facility pays for at least {seatsSummary.paidSeatMinimum ?? 5} seats ({seatsSummary.paidSeatsHeld ?? 0} paid so far).
          </p>
        )}
        {seats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
            No seats in this facility&apos;s pool yet. Free seats appear here automatically, and
            Add seat opens the upgrade flow: pick a plan, pay, and your seats land once the
            Tutorial OS confirms.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Seat</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4 text-center">Switch</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {seats.map((seat, idx) => {
                  const pct = Math.min(100, Math.round((seat.daysUsed / Math.max(1, seat.daysTotal)) * 100));
                  const low = seat.remaining <= 5 && seat.status === 'active';
                  const seatBusy = seatSwitchingId === seat.id;
                  const isFree = (seat as any).kind === 'free';
                  const freeLocked = isFree && seatsSummary?.freeSeatsUnlocked === false;
                  return (
                    <React.Fragment key={seat.id}>
                      {isFree && idx === 0 && (
                        <tr className="bg-emerald-500/5">
                          <td colSpan={6} className="py-2 px-4">
                            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              Free seats · granted by Tutorial OS · never paid · never expire
                            </div>
                          </td>
                        </tr>
                      )}
                      {!isFree && (idx === 0 || (seats[idx - 1] as any)?.kind === 'free') && (
                        <tr>
                          <td colSpan={6} className="py-2 px-4">
                            <div className="border-t border-dashed border-slate-300 dark:border-slate-600 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                              Paid seats
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50/50 dark:hover:brightness-110/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          Seat {seat.seatNo}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {seat.studentName ? (
                          <span className="font-bold text-slate-900 dark:text-white">{seat.studentName}</span>
                        ) : (
                          <span className="italic text-slate-400">No student</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusChip(seat.status)}`}
                        >
                          {seat.status === 'locked' ? (
                            <Lock className="w-3 h-3" />
                          ) : seat.status === 'active' ? (
                            <CircleDot className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {statusLabel(seat.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isFree ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">No expiry</span>
                        ) : seat.status === 'locked' ? (
                          <span className="text-[11px] text-rose-500 font-semibold">
                            Completed its {seat.daysTotal} days · needs payment
                          </span>
                        ) : (
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-[10px] text-slate-400">
                                Day {seat.daysUsed} of {seat.daysTotal}
                              </span>
                              <span
                                className={`text-[11px] font-black ${low ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}`}
                              >
                                {seat.remaining} left
                              </span>
                            </div>
                            <div className="h-1.5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-rose-500' : 'bg-[var(--brand,#0F172A)]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isFree && !seat.studentUid ? (
                          <span
                            className="text-[10px] font-black text-emerald-600 dark:text-emerald-400"
                            title="Empty free seat: add a student and the switch appears here"
                          >
                            Free
                          </span>
                        ) : seat.studentUid ? (
                          <button
                            type="button"
                            disabled={seatBusy}
                            onClick={() => handleSeatSwitch(seat, false)}
                            title="Switch off: the student leaves, their access suspends and the seat is vacant"
                            className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 ${
                              seat.status === 'active'
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                            } ${seatBusy ? 'opacity-60 cursor-wait' : ''}`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                seat.status === 'active' ? 'translate-x-7' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        ) : (
                          <span
                            className="text-[11px] text-slate-300 dark:text-slate-600 font-bold"
                            title="A seat switches on only when a student is added to it"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isFree && seat.status === 'locked' && (
                            <button
                              type="button"
                              onClick={openUpgradeFlow}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-lg transition-all"
                              title="This seat finished its days. Buy new seats to bring it back."
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Add new seat
                            </button>
                          )}
                          {!seat.studentUid && seat.status !== 'locked' && (
                            <button
                              type="button"
                              disabled={freeLocked}
                              onClick={() => {
                                setAssignSeat(seat);
                                setAssignPick('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-lg transition-all disabled:opacity-40"
                              title={freeLocked ? `Free seats unlock once the facility has paid for at least ${seatsSummary?.paidSeatMinimum ?? 5} seats` : 'Add a student to this seat'}
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Add student
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailSeat(seat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:brightness-110 rounded-lg transition-colors"
                            title="View this seat's history and details"
                          >
                            <History className="w-3.5 h-3.5" />
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add-student-to-seat modal: this is also the only way a seat turns on */}
      {assignSeat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !assigning && setAssignSeat(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Add a student to Seat {assignSeat.seatNo}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  The seat starts counting the day it takes the student. Only students without a
                  seat are listed here.
                </p>
              </div>
              <button
                onClick={() => setAssignSeat(null)}
                disabled={assigning}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Choose student
            </label>
            {(() => {
              const unseated = students.filter((s) => !seatByUid.get(s.uid || s.id));
              if (unseated.length === 0) {
                return (
                  <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3">
                    Every student in this facility already holds a seat. Switch a student off to
                    free their seat first, or enrol a new student.
                  </p>
                );
              }
              return (
                <select
                  value={assignPick}
                  onChange={(e) => setAssignPick(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-[var(--brand,#0F172A)]"
                >
                  <option value="">Select a student...</option>
                  {unseated.map((s) => {
                    const uid = s.uid || s.id;
                    return (
                      <option key={uid} value={uid}>
                        {s.name}
                      </option>
                    );
                  })}
                </select>
              );
            })()}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setAssignSeat(null)}
                disabled={assigning}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:brightness-110 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!assignPick || assigning}
                onClick={handleAssign}
                className="px-4 py-2 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all disabled:opacity-40"
              >
                {assigning ? 'Adding...' : 'Add student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat details + history modal */}
      {/* Batch 27: the upgrade flow. Step 1 picks a plan, step 2 how many
          students (never below the minimum), step 3 the account details,
          step 4 the receipt upload with the WhatsApp contact. The seats land
          by themselves once Tutorial OS confirms the payment. */}
      {flowOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !receiptUploading && setFlowOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {flowStep === 'plan' && (
              <>
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Choose a plan</h3>
                  <button onClick={() => setFlowOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Pick the plan you want to move into. You pay per student seat, per month.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(planState?.plans || []).map((p: any) => {
                    const isFreePlan = p.id === 'centre_free';
                    const current = planState?.planId === p.id;
                    return (
                      <div key={p.id} className={`rounded-2xl border p-4 flex flex-col ${current ? 'border-[var(--brand,#0F172A)] border-2' : 'border-slate-200 dark:border-slate-700'}`}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{p.name}</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                          {Number(p.price) > 0 ? `\u20A6${Number(p.price).toLocaleString()}` : '\u20A60'}
                        </p>
                        <p className="text-[10px] text-slate-400">{Number(p.price) > 0 ? 'per seat / month' : 'free seats only'}</p>
                        {current && (
                          <span className="mt-2 inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                            Current plan
                          </span>
                        )}
                        {!isFreePlan && !current && (
                          <button
                            type="button"
                            onClick={() => { setChosenPlan(p); setFlowStep('students'); }}
                            className="mt-3 w-full py-2 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all"
                          >
                            Select
                          </button>
                        )}
                        {isFreePlan && !current && (
                          <p className="mt-3 text-[10px] text-slate-400">Your free seats stay free on any plan.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!(planState?.plans || []).length && (
                  <p className="text-xs text-slate-400">Plans could not be loaded. Refresh and try again.</p>
                )}
              </>
            )}

            {flowStep === 'students' && chosenPlan && (
              <>
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Upgrade to {chosenPlan.name}</h3>
                  <button onClick={() => setFlowStep('plan')} className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-white">Back</button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">How many students are you enrolling?</p>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Number of students</label>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setSeatCountPick(String(pickedSeats - 1))}
                    disabled={pickedSeats <= minSeats}
                    className="w-11 h-11 text-xl font-black text-slate-600 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    −
                  </button>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {`${pickedSeats} student${pickedSeats === 1 ? '' : 's'}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSeatCountPick(String(pickedSeats + 1))}
                    disabled={pickedSeats >= maxSeats}
                    className="w-11 h-11 text-xl font-black text-slate-600 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {Number(planState?.activePaidSeats ?? 0) >= 1
                    ? `You hold ${planState.activePaidSeats} active paid seat${planState.activePaidSeats === 1 ? '' : 's'}, so this purchase must take the total to at least ${planState?.paidSeatMinimum ?? 5}.`
                    : `The platform minimum is ${planState?.paidSeatMinimum ?? 5} students on the first purchase.`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  {nairaFmt(Number(chosenPlan.price))} per student per month
                </p>
                <div className="mt-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-4 py-3">
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {`${pickedSeats} student${pickedSeats === 1 ? '' : 's'} × ${nairaFmt(Number(chosenPlan.price))} = ${nairaFmt(seatTotal)}`}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setFlowStep('plan')}
                    className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlowStep('account')}
                    className="px-4 py-2 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all"
                  >
                    Continue to payment
                  </button>
                </div>
              </>
            )}

            {flowStep === 'account' && chosenPlan && (() => {
              const acct = planState?.payAccount || { name: 'Michael Ogunnaike', number: '5070133907', bank: 'Moniepoint' };
              const copy = (v: string) => {
                try {
                  navigator.clipboard.writeText(v);
                  addToast({ type: 'success', title: 'Copied', description: v });
                } catch { /* clipboard unavailable */ }
              };
              return (
                <>
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Payment details</h3>
                    <button onClick={() => setFlowStep('students')} className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-white">Back</button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Pay {nairaFmt(seatTotal)} by bank transfer for {pickedSeats} student{pickedSeats === 1 ? '' : 's'} on the {chosenPlan.name} plan.
                  </p>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {([['Bank', acct.bank], ['Account name', acct.name], ['Account number', acct.number]] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{value}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copy(value)}
                          className="p-2 text-slate-400 hover:text-[var(--brand,#0F172A)] rounded-lg"
                          title={`Copy the ${label.toLowerCase()}`}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Use this account only for this payment.</p>
                  <button
                    type="button"
                    onClick={() => setFlowStep('receipt')}
                    className="mt-5 w-full py-3 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all"
                  >
                    I have made the payment
                  </button>
                </>
              );
            })()}

            {flowStep === 'receipt' && chosenPlan && (
              <>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">Confirm your payment</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Upload the receipt of your bank transfer.</p>
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="hidden"
                    disabled={receiptUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleReceiptUpload(f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center hover:border-[var(--brand,#0F172A)] transition-colors">
                    <Upload className="w-6 h-6 mx-auto text-slate-400" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2">
                      {receiptUploading ? 'Uploading...' : receiptDone ? 'Receipt uploaded' : 'Upload receipt (image or PDF)'}
                    </p>
                  </div>
                </label>
                {receiptPreview && (
                  <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                    <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receipt preview</p>
                      <span className={`text-[10px] font-bold ${receiptDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {receiptUploading ? 'Uploading...' : receiptDone ? 'Uploaded' : 'Not uploaded yet'}
                      </span>
                    </div>
                    {receiptPreview.startsWith('data:application/pdf') ? (
                      <iframe src={receiptPreview} title="Receipt preview" className="w-full h-56" />
                    ) : (
                      <img src={receiptPreview} alt="Receipt preview" className="w-full max-h-64 object-contain" />
                    )}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-2">Your receipt goes straight to Tutorial OS.</p>
                <button
                  type="button"
                  disabled={!receiptDone}
                  onClick={openWhatsApp}
                  className={`mt-4 w-full py-3 text-xs font-bold rounded-xl transition-all inline-flex items-center justify-center gap-2 text-white ${receiptDone ? 'bg-emerald-500 hover:brightness-110' : 'bg-emerald-500/40 cursor-not-allowed'}`}
                >
                  <MessageCircle className="w-4 h-4" />
                  Contact Tutorial OS on WhatsApp
                </button>
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                  {receiptDone ? 'Ask Tutorial OS to confirm your payment and activate your seats.' : 'This unlocks once your receipt is uploaded.'}
                </p>
                <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-4 py-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Once Tutorial OS confirms your payment, the {chosenPlan.name} seats you paid for appear on this
                    dashboard by themselves, on top of your free seats. Nothing else to do.
                  </p>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    type="button"
                    disabled={!receiptDone}
                    onClick={() => { setFlowOpen(false); refreshSeatsSummary(); refreshPlan(); }}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${receiptDone ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800' : 'text-slate-400 cursor-not-allowed'}`}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detailSeat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailSeat(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Seat {detailSeat.seatNo}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1 ${statusChip(detailSeat.status)}`}
                >
                  {statusLabel(detailSeat.status)}
                </span>
              </div>
              <button
                onClick={() => setDetailSeat(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 mb-4">
              <p>
                <span className="text-slate-400">Status: </span>
                {detailSeat.status === 'active'
                  ? 'Running, one day burns each calendar day'
                  : detailSeat.status === 'locked'
                  ? 'Locked, a payment reopens it'
                  : 'Paused in the pool, not counting'}
              </p>
              {detailSeat.status !== 'locked' && (
                <p>
                  <span className="text-slate-400">Days: </span>
                  Day {detailSeat.daysUsed} of {detailSeat.daysTotal} ·{' '}
                  <span className="font-bold">{detailSeat.remaining} left</span>
                </p>
              )}
              {detailSeat.status === 'active' && detailSeat.startedAt && (
                <p>
                  <span className="text-slate-400">Switched on: </span>
                  {fmtDay(detailSeat.startedAt)}
                </p>
              )}
              <p>
                <span className="text-slate-400">Student on it now: </span>
                {detailSeat.studentName || 'No student'}
              </p>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
              History of students on this seat
            </h4>
            {detailSeat.history.length === 0 ? (
              <p className="text-xs text-slate-400">
                No student history on this seat yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {detailSeat.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li
                      key={`${h.uid}-${i}`}
                      className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-3 py-2 text-[11px]"
                    >
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        {h.name || h.uid}
                      </div>
                      <div className="text-slate-400">
                        {fmtDay(h.from)} → {fmtDay(h.to)}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
