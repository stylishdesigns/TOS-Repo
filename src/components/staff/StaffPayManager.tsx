import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getAuth } from 'firebase/auth';
import {
  Wallet,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  Camera,
  Clock,
  AlertTriangle,
  Banknote,
  Landmark,
  RefreshCw,
  Users,
  CheckCircle2,
  Bell,
  MessageSquare,
  Phone,
  Mail,
} from 'lucide-react';
import { formatPayInfo } from './PaySetupFields';
import { formatDateLong, todayISO } from '../../lib/paymentDates';
import { computeNextPayDate, payDueStatus, overdueDays } from '../../lib/staffPay';
import { uploadPaymentProof } from '../../lib/paymentProof';

interface StaffPayment {
  id: string;
  staffId: string;
  collection?: string;
  staffRole?: string;
  staffName?: string;
  amount: number;
  mode: string;
  datePaid: string;
  periodsCovered?: number | null;
  note?: string;
  evidenceUrl?: string | null;
  createdAt?: string;
}

interface StaffRow {
  id: string;
  name: string;
  role: string;
  collection: 'tutors' | 'admins';
  doc: any;
}

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`;

const RecordPaymentModal: React.FC<{
  row: StaffRow;
  centreId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ row, centreId, onClose, onSaved }) => {
  const { addToast } = useApp();
  const isTutor = row.collection === 'tutors';
  const [amount, setAmount] = useState<string>(
    !isTutor && Number(row.doc.payAmount) > 0 ? String(row.doc.payAmount) : ''
  );
  const [mode, setMode] = useState<'Bank Transfer' | 'Cash'>('Bank Transfer');
  const [datePaid, setDatePaid] = useState<string>(todayISO());
  const [periods, setPeriods] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [evidence, setEvidence] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickEvidence = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      setEvidence(await uploadPaymentProof(file));
      addToast({ type: 'success', title: 'Screenshot Attached', description: file.name });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upload Failed', description: err?.message || 'The screenshot could not be uploaded.' });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addToast({ type: 'error', title: 'Amount Required', description: 'Enter the amount that was paid.' });
      return;
    }
    setSaving(true);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/staff-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          centreId,
          staffId: row.id,
          collection: row.collection,
          amount: amountNum,
          mode,
          datePaid,
          periodsCovered: isTutor && periods ? Number(periods) : null,
          note,
          evidenceUrl: evidence?.url || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not record the payment.');
      addToast({ type: 'success', title: 'Payment Recorded', description: `${naira(amountNum)} paid to ${row.name}.` });
      onSaved();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Failed', description: err?.message || 'Could not record the payment.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
              <Wallet className="w-5 h-5 text-orange-600" />
              <span>Record Payment</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {row.name} · {row.role}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Amount Paid (₦) *</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
            />
            {isTutor && Number(row.doc.ratePerPeriod) > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                Their rate is {naira(Number(row.doc.ratePerPeriod))} per class. The amount is whatever you actually paid.
              </p>
            )}
          </div>

          {(row.doc.bankName || row.doc.bankAccountName || row.doc.bankAccountNumber) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Pay Into Account</p>
              <p className="text-[11px] font-bold text-slate-600">
                {row.doc.bankName || 'Bank not set'} · {row.doc.bankAccountName || 'Account name not set'}
              </p>
              <p className="text-xs font-black text-slate-900">{row.doc.bankAccountNumber || 'Account number not set'}</p>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Payment Mode *</label>
            <div className="grid grid-cols-2 gap-3">
              {(['Bank Transfer', 'Cash'] as const).map((m) => {
                const Icon = m === 'Bank Transfer' ? Landmark : Banknote;
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex items-center justify-center space-x-2 p-3 rounded-xl border font-bold transition-all ${
                      active
                        ? 'bg-orange-50 border-orange-300 text-orange-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{m}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date Paid</label>
              <input
                type="date"
                value={datePaid}
                onChange={(e) => setDatePaid(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
              />
            </div>
            {isTutor && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Classes Covered</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="e.g. 12"
                  value={periods}
                  onChange={(e) => setPeriods(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Screenshot Evidence</label>
            {evidence ? (
              <div className="flex items-center space-x-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                <img src={evidence.url} alt="Payment evidence" className="w-10 h-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                <span className="text-[11px] font-bold text-emerald-800 truncate flex-1">{evidence.name}</span>
                <button type="button" onClick={() => setEvidence(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center space-x-2 p-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600 cursor-pointer transition-all">
                <Camera className="w-4 h-4" />
                <span className="text-[11px] font-bold">{uploading ? 'Uploading...' : 'Attach a screenshot or photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickEvidence(e.target.files?.[0])} disabled={uploading} />
              </label>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Note</label>
            <textarea
              rows={2}
              placeholder="e.g. November salary, periods 1-12"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || uploading}
              className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Payment Record'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const StaffPayManager: React.FC = () => {
  const { tutors, admins, activeCentreId, centreName, addToast, planCaps } = useApp();
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordFor, setRecordFor] = useState<StaffRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remindFor, setRemindFor] = useState<string | null>(null);

  const staffRows: StaffRow[] = useMemo(() => {
    const rows: StaffRow[] = [];
    (tutors || []).forEach((t: any) => rows.push({ id: t.id, name: t.name, role: 'Tutor', collection: 'tutors', doc: t }));
    (admins || []).forEach((a: any) => rows.push({ id: a.id, name: a.name, role: a.role || 'Staff', collection: 'admins', doc: a }));
    return rows;
  }, [tutors, admins]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch(`/api/centre/staff-payments?centreId=${encodeURIComponent(activeCentreId || '')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not load the pay records.');
      setPayments(data.payments || []);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Load Failed', description: err?.message || 'Could not load the pay records.' });
    } finally {
      setLoading(false);
    }
  };

  // Automatic reminders: the daily server sweep sends these on its own; this
  // button runs the same sweep for this facility right now (handy for testing).
  const [remindersRunning, setRemindersRunning] = useState(false);
  const runReminders = async () => {
    if (remindersRunning) return;
    setRemindersRunning(true);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/staff-pay-reminders/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ centreId: activeCentreId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not run the reminders.');
      const parts = [`chat ${data.chatted || 0}`, `push ${data.pushed || 0}`, `email ${data.emailed || 0}`];
      addToast({
        type: 'success',
        title: (data.reminded || 0) > 0 ? 'Reminders Sent' : 'Nobody To Remind',
        description: (data.reminded || 0) > 0
          ? `${data.reminded} staff member(s) due or overdue were reminded (${parts.join(', ')}).`
          : 'No staff member is due or overdue for pay right now.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Reminders Failed', description: err?.message || 'Could not run the reminders.' });
    } finally {
      setRemindersRunning(false);
    }
  };

  useEffect(() => {
    if (activeCentreId) loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCentreId]);

  const paymentsFor = (row: StaffRow) => payments.filter((p) => p.staffId === row.id);

  const nextPayFor = (row: StaffRow): string | null => {
    const list = paymentsFor(row);
    return computeNextPayDate(row.doc.payFrequency, row.doc.payDay, list[0]?.datePaid || row.doc.lastPaidAt || null);
  };

  const waDigits = (v: string): string => {
    let digits = (v || '').replace(/[^0-9]/g, '');
    // Nigerian numbers are usually saved locally (0903...); wa.me needs 234....
    if (digits.length === 11 && digits.startsWith('0')) digits = '234' + digits.slice(1);
    return digits;
  };

  const reminderMessage = (row: StaffRow): string | null => {
    if (!row.doc.payFrequency) return null;
    const next = nextPayFor(row);
    if (!next) return null;
    const status = payDueStatus(next);
    let due: string;
    if (status === 'overdue') {
      const d = overdueDays(next);
      due = `Your payment from ${formatDateLong(next)} is now ${d} day${d > 1 ? 's' : ''} overdue.`;
    } else if (status === 'due') {
      due = `Your payment is due today, ${formatDateLong(next)}.`;
    } else {
      due = `Your next payment is due on ${formatDateLong(next)}.`;
    }
    return `Hello ${row.name}, this is a payment reminder from ${centreName}. ${due} Pay details: ${formatPayInfo(row.doc, row.collection === 'tutors')}.`;
  };

  const sendReminder = async (row: StaffRow, channel: 'chat' | 'whatsapp' | 'email') => {
    setRemindFor(null);
    const msg = reminderMessage(row);
    if (!msg) {
      addToast({ type: 'error', title: 'No Pay Cycle', description: `${row.name} has no pay cycle set yet.` });
      return;
    }
    if (channel === 'chat') {
      try {
        await navigator.clipboard.writeText(msg);
        addToast({ type: 'success', title: 'Copied', description: 'Reminder message copied. Paste it in chat.' });
      } catch {
        addToast({ type: 'error', title: 'Copy Failed', description: 'Could not copy the message. Try again.' });
      }
    } else if (channel === 'whatsapp') {
      const digits = waDigits(row.doc.phone || '');
      if (!digits) {
        addToast({ type: 'error', title: 'No Phone Number', description: `${row.name} has no phone number on file.` });
        return;
      }
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      const email = row.doc.email || '';
      if (!email) {
        addToast({ type: 'error', title: 'No Email', description: `${row.name} has no email address on file.` });
        return;
      }
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Payment reminder from ${centreName}`)}&body=${encodeURIComponent(msg)}`;
    }
  };

  const monthPrefix = todayISO().slice(0, 7);
  const monthTotal = payments
    .filter((p) => (p.datePaid || '').startsWith(monthPrefix))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const onPayroll = staffRows.filter((r) => r.doc.payFrequency).length;
  const dueNow = staffRows.filter((r) => payDueStatus(nextPayFor(r)) !== 'none').length;

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center space-x-2">
            <Wallet className="w-6 h-6 text-orange-600" />
            <span>Staff Pay</span>
          </h1>
          <p className="text-sm sm:text-[15px] font-bold text-slate-900 mt-1 max-w-xl">
            Pay your tutors and admins, keep the record, and attach the screenshot as evidence.
          </p>
        </div>
        <button
          onClick={runReminders}
          disabled={remindersRunning}
          className="px-3 py-2 text-[10px] font-black text-slate-600 bg-white border border-slate-200 rounded-lg uppercase tracking-wider inline-flex items-center space-x-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{remindersRunning ? 'Sending...' : 'Send Reminders'}</span>
        </button>

        <button
          onClick={loadPayments}
          className="px-3 py-2 text-[10px] font-black text-slate-600 bg-white border border-slate-200 rounded-lg uppercase tracking-wider inline-flex items-center space-x-1.5 hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paid This Month</p>
          <p className="text-base font-black text-slate-900 mt-1">{naira(monthTotal)}</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center space-x-1">
            <Users className="w-3 h-3" />
            <span>On Payroll</span>
          </p>
          <p className="text-base font-black text-slate-900 mt-1">{onPayroll}</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Due Now</span>
          </p>
          <p className={`text-base font-black mt-1 ${dueNow > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{dueNow}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 font-bold py-8 text-center">Loading pay records...</p>
      ) : staffRows.length === 0 ? (
        <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center">
          <Wallet className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-700 mt-3">No staff yet</p>
          <p className="text-xs text-slate-400 mt-1">Add tutors and staff members first; they will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffRows.map((row) => {
            const list = paymentsFor(row);
            const next = nextPayFor(row);
            const status = payDueStatus(next);
            return (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 font-black text-sm flex items-center justify-center overflow-hidden shrink-0">
                      {row.doc.avatar ? (
                        <img src={row.doc.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        row.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{row.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{row.role}</p>
                      <p className="text-[11px] font-bold text-slate-600 mt-0.5">{formatPayInfo(row.doc, row.collection === 'tutors')}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {next ? (
                      <>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-end space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Next Pay</span>
                        </p>
                        <p className="text-[11px] font-black text-slate-800">{formatDateLong(next)}</p>
                        {status === 'due' && (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black">
                            Due today
                          </span>
                        )}
                        {status === 'overdue' && (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-black">
                            Overdue {overdueDays(next)}d
                          </span>
                        )}
                      </>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400">No pay cycle set</p>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-4 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-bold text-slate-400">
                    {list.length === 0
                      ? 'No payments recorded yet'
                      : `Last paid ${naira(list[0].amount)} on ${formatDateLong(list[0].datePaid)}`}
                  </p>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <button
                        onClick={() => setRemindFor(remindFor === row.id ? null : row.id)}
                        className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 text-slate-600 uppercase tracking-wider inline-flex items-center space-x-1 hover:bg-slate-50"
                      >
                        <Bell className="w-3 h-3" />
                        <span>Remind</span>
                      </button>
                      {remindFor === row.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-44">
                          {([
                            { key: 'chat', label: 'Chat', Icon: MessageSquare },
                            { key: 'whatsapp', label: 'WhatsApp', Icon: Phone },
                            { key: 'email', label: 'Email', Icon: Mail },
                          ] as const).filter((ch) => ch.key !== 'whatsapp' || planCaps?.whatsappNotifications).map(({ key, label, Icon }) => (
                            <button
                              key={key}
                              onClick={() => sendReminder(row, key)}
                              className="w-full px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                            >
                              <Icon className="w-3.5 h-3.5 text-slate-400" />
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 text-slate-600 uppercase tracking-wider inline-flex items-center space-x-1 hover:bg-slate-50"
                    >
                      {expandedId === row.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      <span>History ({list.length})</span>
                    </button>
                    <button
                      onClick={() => setRecordFor(row)}
                      className="px-3 py-1.5 text-[10px] font-black text-white bg-orange-600 hover:bg-orange-700 rounded-lg uppercase tracking-wider inline-flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Record Payment</span>
                    </button>
                  </div>
                </div>

                {expandedId === row.id && (
                  <div className="px-4 pb-4 pt-3 space-y-2 border-t border-slate-100">
                    {list.length === 0 ? (
                      <p className="text-xs text-slate-400 font-bold py-2 text-center">No payments recorded yet.</p>
                    ) : (
                      list.map((p) => (
                        <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900">{naira(p.amount)}</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {formatDateLong(p.datePaid)} · {p.mode}
                              {p.periodsCovered ? ` · ${p.periodsCovered} class${p.periodsCovered > 1 ? 'es' : ''}` : ''}
                            </p>
                            {p.note && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.note}</p>}
                          </div>
                          {p.evidenceUrl ? (
                            <a
                              href={p.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-black text-orange-600 uppercase tracking-wider shrink-0 hover:underline"
                            >
                              View Proof
                            </a>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {recordFor && (
        <RecordPaymentModal
          row={recordFor}
          centreId={activeCentreId || ''}
          onClose={() => setRecordFor(null)}
          onSaved={() => {
            setRecordFor(null);
            loadPayments();
          }}
        />
      )}
    </div>
  );
};
