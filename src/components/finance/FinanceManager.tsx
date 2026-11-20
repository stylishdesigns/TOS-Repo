import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PaymentRecord, isConfirmedPayment, Student } from '../../types';
import { DEFAULT_FEE_REMINDER_SETTINGS, FEE_REMINDER_DAY_OPTIONS, normalizeFeeReminderSettings, renderChatTemplate } from '../../lib/feeReminders';
import { nextPaymentDue, formatDateLong, todayISO } from '../../lib/paymentDates';
import { ModernSelect } from '../ui/ModernSelect';
import { uploadPaymentProof } from '../../lib/paymentProof';
import { ProofOfPaymentUpload } from '../ui/ProofOfPaymentUpload';
import {
  CreditCard,
  Search,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Building2,
  Settings,
  Edit2,
  Check,
  Image as ImageIcon,
  FileText,
  Eye,
  Banknote,
  Mail,
  BellRing,
  MessageSquare,
} from 'lucide-react';

export const FinanceManager: React.FC = () => {
  const {
    payments,
    students,
    programmes,
    settings,
    recordPayment,
    confirmPayment,
    runPaymentReminders,
    updateProgramme,
    updateSettings,
    addToast,
    centreName,
  } = useApp();

  const [search, setSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'All' | 'Owes' | 'Paid'>('All');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedDetailStudent, setSelectedDetailStudent] = useState<Student | null>(null);

  // Exam Program Fee & Channel Settings Modal State
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [tariffModalTab, setTariffModalTab] = useState<'fees' | 'channels' | 'reminders'>('fees');
  const [editingProgrammeId, setEditingProgrammeId] = useState<string | null>(null);
  const [tempFeeValue, setTempFeeValue] = useState<string>('');

  // Center Account & Cash Guide settings state
  const [bankName, setBankName] = useState(settings.bankName || 'Access Bank Plc');
  const [bankAccountNumber, setBankAccountNumber] = useState(settings.bankAccountNumber || '0123456789');
  const [bankAccountName, setBankAccountName] = useState(settings.bankAccountName || centreName);
  const [cashPaymentGuide, setCashPaymentGuide] = useState(
    settings.cashPaymentGuide ||
      'Please proceed in person to the Facility Accounts Bursar, Mr. Adeleke, at the Admin Office (Reception Block A, 1st Floor). Always collect an official stamped paper receipt upon payment.'
  );

  // Preview evidence modal
  const [viewEvidenceModal, setViewEvidenceModal] = useState<{ url: string; title: string } | null>(null);

  // New payment form
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Cash'>('Bank Transfer');
  const [adminNote, setAdminNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofName, setProofName] = useState('');
  const [proofBusy, setProofBusy] = useState(false);
  const [paymentFrom, setPaymentFrom] = useState('');
  const [paymentTo, setPaymentTo] = useState('');

  // Review modal: the admin confirms or declines a student's claim from here,
  // after seeing the evidence, amount, mode and note, and sets the window the
  // payment covers.
  const [reviewPayment, setReviewPayment] = useState<PaymentRecord | null>(null);
  const [reviewFrom, setReviewFrom] = useState('');
  const [reviewTo, setReviewTo] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Only confirmed payments count as money collected.
  const totalCollected = payments
    .filter(isConfirmedPayment)
    .reduce((sum, p) => sum + (p.amountPaid || 0), 0);
  const pendingPayments = payments.filter((p) => p.status === 'Pending');
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);

  // Automatic payment reminder settings (Fees & Payments > settings > Automatic Reminders).
  const [remEnabled, setRemEnabled] = useState(false);
  const [remDays, setRemDays] = useState(7);
  const [remMonday, setRemMonday] = useState(false);
  const [remEmail, setRemEmail] = useState(true);
  const [remPush, setRemPush] = useState(true);
  const [remChat, setRemChat] = useState(true);
  const [remTemplate, setRemTemplate] = useState(DEFAULT_FEE_REMINDER_SETTINGS.chatTemplate);
  const [remSaving, setRemSaving] = useState(false);
  const [remBusy, setRemBusy] = useState(false);

  const openReview = (pay: PaymentRecord) => {
    setReviewPayment(pay);
    setReviewFrom(pay.effectiveFrom || todayISO());
    setReviewTo(pay.expiresAt || '');
    setReviewReason('');
  };

  const handleReviewConfirm = async () => {
    if (!reviewPayment) return;
    if (reviewFrom && reviewTo && reviewTo < reviewFrom) {
      addToast({ type: 'error', title: 'Invalid Payment Window', description: 'The expiry date must come after the start date.' });
      return;
    }
    setReviewBusy(true);
    try {
      const ok = await confirmPayment(reviewPayment.id, 'confirm', undefined, {
        effectiveFrom: reviewFrom || undefined,
        expiresAt: reviewTo || undefined,
      });
      if (ok) setReviewPayment(null);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleReviewReject = async () => {
    if (!reviewPayment) return;
    setReviewBusy(true);
    try {
      const ok = await confirmPayment(reviewPayment.id, 'reject', reviewReason.trim() || undefined);
      if (ok) setReviewPayment(null);
    } finally {
      setReviewBusy(false);
    }
  };
  const totalBilled = students.reduce((sum, s) => sum + (s.totalFee || 0), 0);
  const totalOutstanding = students.reduce((sum, s) => sum + (s.outstandingBalance || 0), 0);

  const handleSaveChannelSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      bankName,
      bankAccountNumber,
      bankAccountName,
      cashPaymentGuide,
    }, { silent: true });
    addToast({
      type: 'success',
      title: 'Payment Settings Saved',
      description: 'Facility bank account details and cash payment instructions updated.',
    });
  };

  const handleSaveProgrammeFee = async (programmeId: string) => {
    const feeNumber = Number(tempFeeValue);
    if (isNaN(feeNumber) || feeNumber < 0) {
      addToast({
        type: 'error',
        title: 'Invalid Fee Amount',
        description: 'Please enter a valid non-negative fee amount.',
      });
      return;
    }

    await updateProgramme(programmeId, { fee: feeNumber });
    const prog = programmes.find((p) => p.id === programmeId);
    addToast({
      type: 'success',
      title: 'Fee Tariff Updated',
      description: `Approved fee for ${prog?.name || 'programme'} set to ${settings.currencySymbol}${feeNumber.toLocaleString()}`,
    });
    setEditingProgrammeId(null);
  };

  // Payment roster: one row per student, built from the live student and
  // payment lists. A student's name appears once no matter how many times
  // they pay; every payment updates their single row.
  const paymentsByStudent = new Map<string, PaymentRecord[]>();
  payments.forEach((p) => {
    const list = paymentsByStudent.get(p.studentId) || [];
    list.push(p);
    paymentsByStudent.set(p.studentId, list);
  });

  const rosterSearch = search.trim().toLowerCase();
  const allRows = students
    .filter((st) => !rosterSearch || st.name.toLowerCase().includes(rosterSearch))
    .map((st) => {
      const history = paymentsByStudent.get(st.id) || [];
      return { st, history, nextDue: nextPaymentDue(history) };
    });
  const owesRows = allRows.filter((r) => Number(r.st.outstandingBalance || 0) > 0 || !(Number(r.st.totalFee || 0) > 0));
  const paidRows = allRows.filter((r) => Number(r.st.outstandingBalance || 0) <= 0 && Number(r.st.totalFee || 0) > 0);
  const visibleOwes = rosterFilter === 'Paid' ? [] : owesRows;
  const visiblePaid = rosterFilter === 'Owes' ? [] : paidRows;
  const owesTotal = owesRows.reduce((sum, r) => sum + Number(r.st.outstandingBalance || 0), 0);

  const renderRosterRow = (row: { st: Student; history: PaymentRecord[]; nextDue: string | null }) => {
    const { st, history, nextDue } = row;
    const owes = Number(st.outstandingBalance || 0) > 0;
    const noFee = !(Number(st.totalFee || 0) > 0);
    const pendingCount = history.filter((p) => p.status === 'Pending').length;
    const overdue = !!nextDue && nextDue < todayISO();
    const initials = st.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
    return (
      <div key={st.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80 transition-colors">
        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
          {st.avatar ? (
            <img src={st.avatar} alt={st.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-black text-slate-500">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 truncate">{st.name}</span>
            {pendingCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                {pendingCount} awaiting confirmation
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate">{st.programmeName || 'No programme set'}</p>
        </div>
        <div className="text-right shrink-0">
          {noFee ? (
            <span className="text-[10px] font-bold text-slate-400">No fee set</span>
          ) : owes ? (
            <>
              <p className="text-xs font-black text-amber-700">{settings.currencySymbol}{Number(st.outstandingBalance || 0).toLocaleString()}</p>
              {nextDue && (
                <p className={`text-[10px] font-semibold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                  {overdue ? `Overdue, was due ${formatDateLong(nextDue)}` : `Due ${formatDateLong(nextDue)}`}
                </p>
              )}
            </>
          ) : (
            <span className="text-[10px] font-bold text-emerald-700">Paid up</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedDetailStudent(st)}
          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-md border border-slate-200 shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
        >
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          View Details
        </button>
      </div>
    );
  };

  // Reminder settings stay in step with the facility's saved settings doc.
  useEffect(() => {
    const norm = normalizeFeeReminderSettings((settings as any).paymentReminders);
    setRemEnabled(norm.enabled);
    setRemDays(norm.daysBefore);
    setRemMonday(norm.weeklyMonday);
    setRemEmail(norm.channels.email);
    setRemPush(norm.channels.push);
    setRemChat(norm.channels.chat);
    setRemTemplate(norm.chatTemplate);
  }, [settings.paymentReminders]);

  const handleSaveReminders = async () => {
    setRemSaving(true);
    try {
      await updateSettings({
        paymentReminders: {
          enabled: remEnabled,
          daysBefore: remDays,
          weeklyMonday: remMonday,
          channels: { email: remEmail, push: remPush, chat: remChat },
          chatTemplate: remTemplate,
        },
      }, { silent: true });
      addToast({ type: 'success', title: 'Reminders Saved', description: 'Automatic payment reminders will follow these settings.' });
    } finally {
      setRemSaving(false);
    }
  };

  const handleRunReminders = async () => {
    setRemBusy(true);
    try {
      const r = await runPaymentReminders();
      if (r.ok) {
        const pushNote = r.pushReason
          ? r.pushReason.includes('WEB_PUSH_PRIVATE_KEY')
            ? ' Device push notifications are not switched on for this deployment yet.'
            : ` Push note: ${r.pushReason}`
          : '';
        addToast({
          type: 'success',
          title: 'Reminders Run',
          description: `${r.emailed || 0} email${(r.emailed || 0) === 1 ? '' : 's'}, ${r.pushed || 0} push notification${(r.pushed || 0) === 1 ? '' : 's'} and ${r.chatted || 0} chat message${(r.chatted || 0) === 1 ? '' : 's'} sent.${pushNote}`,
        });
      } else {
        addToast({ type: 'error', title: 'Could Not Run Reminders', description: r.error || 'Please try again.' });
      }
    } finally {
      setRemBusy(false);
    }
  };

  const handleProofPick = async (file: File | null) => {
    if (!file) return;
    setProofBusy(true);
    try {
      const res = await uploadPaymentProof(file);
      setProofUrl(res.url);
      setProofName(res.name);
    } catch (err) {
      addToast({ type: 'error', title: 'Proof Upload Failed', description: err instanceof Error ? err.message : 'The proof image could not be uploaded.' });
    } finally {
      setProofBusy(false);
    }
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.id === selectedStudentId);
    if (!st) return;

    const amount = Number(amountPaid);
    if (!amount || amount <= 0) return;
    if (paymentFrom && paymentTo && paymentTo < paymentFrom) {
      addToast({ type: 'error', title: 'Invalid Payment Window', description: 'The expiry date must come after the start date.' });
      return;
    }

    const result = await recordPayment({
      studentId: st.id,
      amountPaid: amount,
      method: paymentMethod,
      note: adminNote.trim() || undefined,
      evidenceUrl: proofUrl || undefined,
      evidenceName: proofName || undefined,
      effectiveFrom: paymentFrom || undefined,
      expiresAt: paymentTo || undefined,
    });
    if (result) {
      addToast({
        type: 'success',
        title: 'Payment Recorded!',
        description: `Receipt ${result.receiptNumber} generated for ${st.name}.`,
      });
    }

    setShowRecordModal(false);
    setAmountPaid('');
    setAdminNote('');
    setPaymentFrom('');
    setPaymentTo('');
    setProofUrl('');
    setProofName('');
  };

  return (
    <div id="finance-management-page" className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Section Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Fees & Payments
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Track tuition fee collections, outstanding student balances, and official receipts
          </p>
          <div className="mt-3">
            <button
              onClick={() => {
                setPaymentFrom(todayISO());
                setPaymentTo('');
                setShowRecordModal(true);
              }}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-all inline-flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Payment</span>
            </button>
          </div>
        </div>

        {/* "Exam program fee" button placed at the top right corner */}
        <div className="flex items-center sm:self-start">
          <button
            type="button"
            onClick={() => {
              setShowTariffModal(true);
              setEditingProgrammeId(null);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 border border-slate-200 rounded-xl shadow-xs transition-all group cursor-pointer"
            title="Configure Exam Program Fees, Bank Details & Cash Guide"
          >
            <Settings className="w-4 h-4 text-slate-400 group-hover:text-orange-600 group-hover:rotate-90 transition-transform duration-500" />
            <span>Exam program fee</span>
          </button>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="p-4 sm:p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-emerald-700">Total Collected</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600">
            {settings.currencySymbol}
            {(totalCollected || 0).toLocaleString()}
          </div>
          <p className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-1">
            {Math.round((totalCollected / (totalBilled || 1)) * 100)}% Rate
          </p>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-amber-700">Outstanding Balance</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600">
            {settings.currencySymbol}
            {(totalOutstanding || 0).toLocaleString()}
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Pending student installments</p>
        </div>
      </div>

      {/* Payments Ledger Table */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        {/* Roster toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
          <div className="w-full sm:w-56">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Student status
            </label>
            <ModernSelect
              value={rosterFilter}
              onChange={(val) => setRosterFilter(val as 'All' | 'Owes' | 'Paid')}
              options={[
                { value: 'All', label: 'All students' },
                { value: 'Owes', label: 'Owing balance' },
                { value: 'Paid', label: 'Paid up' },
              ]}
            />
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-72">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
              />
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Awaiting confirmation */}
        {pendingPayments.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-blue-900">
                {pendingPayments.length} student payment{pendingPayments.length === 1 ? '' : 's'} awaiting your confirmation
              </span>
              <span className="text-[10px] text-blue-700 font-medium hidden sm:block">Balances only change once you confirm.</span>
            </div>
            <div className="space-y-1.5">
              {pendingPayments.map((pay) => (
                <div key={pay.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-blue-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{pay.studentName}</p>
                    <p className="text-[10px] text-slate-500">
                      {settings.currencySymbol}{(pay.amountPaid || 0).toLocaleString()} &bull; {pay.method}
                      {pay.evidenceUrl ? ' &bull; proof attached' : ' &bull; no proof yet'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyPaymentId === pay.id}
                    onClick={() => openReview(pay)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 rounded-md border border-slate-200 shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    View Details
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outstanding balances */}
        <div>
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Outstanding balances ({visibleOwes.length})
            </span>
            <span className="text-[10px] font-bold text-amber-700">
              {settings.currencySymbol}{owesTotal.toLocaleString()} owed
            </span>
          </div>
          <div className="rounded-xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {visibleOwes.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400 font-medium">No student owes right now.</p>
            ) : (
              visibleOwes.map((row) => renderRosterRow(row))
            )}
          </div>
        </div>

        {/* Paid up */}
        <div>
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Paid up ({visiblePaid.length})
            </span>
          </div>
          <div className="rounded-xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {visiblePaid.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400 font-medium">No paid-up students yet.</p>
            ) : (
              visiblePaid.map((row) => renderRosterRow(row))
            )}
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-extrabold text-slate-900 text-base">Record Tuition Payment</h3>
              <button
                onClick={() => setShowRecordModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="py-4 space-y-3.5 overflow-y-auto flex-1 min-h-0 text-xs">
              <ModernSelect
                label="Select Candidate *"
                value={selectedStudentId}
                onChange={(val) => setSelectedStudentId(val)}
                options={students.map(st => ({
                  value: st.id,
                  label: `${st.name} — Bal: ${settings.currencySymbol}${(st.outstandingBalance || 0).toLocaleString()}`
                }))}
              />

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Amount Received ({settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  placeholder="e.g. 25000"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <ModernSelect
                label="Payment Method"
                value={paymentMethod}
                onChange={(val) => setPaymentMethod(val as any)}
                options={[
                  { value: 'Bank Transfer', label: 'Bank Transfer (Direct Bank Deposit)' },
                  { value: 'Cash', label: 'Cash Receipt at Bursary Desk' }
                ]}
              />

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Window (when this payment takes effect and expires)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500 mb-1">Takes effect from</span>
                    <input
                      type="date"
                      value={paymentFrom}
                      onChange={(e) => setPaymentFrom(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500 mb-1">Expires on</span>
                    <input
                      type="date"
                      value={paymentTo}
                      onChange={(e) => setPaymentTo(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">The expiry date becomes the student's next payment due date.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Short Note / Statement (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid cash at bursary counter / Reference note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <ProofOfPaymentUpload
                url={proofUrl}
                name={proofName}
                busy={proofBusy}
                onPick={handleProofPick}
                onClear={() => { setProofUrl(''); setProofName(''); }}
              />

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-lg shadow-sm"
                >
                  Post Payment & Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {/* Student Payment Details */}
      {selectedDetailStudent && (() => {
        const history = (paymentsByStudent.get(selectedDetailStudent.id) || [])
          .slice()
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const nextDue = nextPaymentDue(history);
        const totalFee = Number(selectedDetailStudent.totalFee || 0);
        const outstanding = Number(selectedDetailStudent.outstandingBalance || 0);
        const paidSoFar = Math.max(0, totalFee - outstanding);
        const initials = selectedDetailStudent.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {selectedDetailStudent.avatar ? (
                    <img src={selectedDetailStudent.avatar} alt={selectedDetailStudent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-black text-slate-500">{initials}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{selectedDetailStudent.name}</h3>
                  <p className="text-[11px] text-slate-500">{selectedDetailStudent.programmeName || 'No programme set'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                  <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Outstanding</p>
                  <p className="text-sm font-black text-amber-700 mt-0.5">{settings.currencySymbol}{outstanding.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Next due</p>
                  <p className="text-[11px] font-bold text-slate-800 mt-1">{nextDue ? formatDateLong(nextDue) : 'Not set'}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                  <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Paid so far</p>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">{settings.currencySymbol}{paidSoFar.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment history ({history.length})</h5>
                {history.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400 font-medium">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-800">{formatDateLong(h.date)}</p>
                            <p className="text-[9px] text-slate-500 truncate">{h.method}{h.expiresAt ? ` • to ${formatDateLong(h.expiresAt)}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-[11px] font-black text-slate-900">{settings.currencySymbol}{(h.amountPaid || 0).toLocaleString()}</p>
                            <span className={`text-[9px] font-bold ${h.status === 'Paid' ? 'text-emerald-600' : h.status === 'Partial' ? 'text-amber-600' : h.status === 'Pending' ? 'text-blue-600' : 'text-rose-600'}`}>
                              {h.status === 'Pending' ? 'Awaiting confirmation' : h.status}
                            </span>
                          </div>
                          {h.evidenceUrl && (
                            <button
                              type="button"
                              onClick={() => setViewEvidenceModal({ url: h.evidenceUrl!, title: `${selectedDetailStudent.name} - Payment Evidence` })}
                              className="p-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer"
                              title="View payment evidence"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setSelectedDetailStudent(null)}
                className="px-6 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Exam Program Fee & Payment Settings Modal */}
      {showTariffModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">Exam Program Fee & Payment Settings</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
                      {settings.academicSession}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Set up approved tuition fees, facility account details, and cash payment guidelines
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTariffModal(false);
                  setEditingProgrammeId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-100 pt-2 shrink-0 space-x-4">
              <button
                type="button"
                onClick={() => setTariffModalTab('fees')}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  tariffModalTab === 'fees'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Approved Program Fees ({programmes.length})
              </button>
              <button
                type="button"
                onClick={() => setTariffModalTab('channels')}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  tariffModalTab === 'channels'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Facility Account & Cash Guide
              </button>
              <button
                type="button"
                onClick={() => setTariffModalTab('reminders')}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  tariffModalTab === 'reminders'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Automatic Reminders
              </button>
            </div>

            {/* Modal Body */}
            {tariffModalTab === 'fees' ? (
              <div className="py-4 space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                {programmes.map((p) => {
                  const isEditing = editingProgrammeId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="p-4 bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                            {p.code}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                            {p.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">Duration: {p.duration || 'Full Session'}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                {settings.currencySymbol}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={tempFeeValue}
                                onChange={(e) => setTempFeeValue(e.target.value)}
                                className="w-32 pl-7 pr-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white border border-orange-400 rounded-lg outline-none focus:ring-2 focus:ring-orange-200"
                                autoFocus
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveProgrammeFee(p.id)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingProgrammeId(null)}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">Approved Fee</span>
                              <span className="text-base font-black text-slate-900">
                                {settings.currencySymbol}{(p.fee || 0).toLocaleString()}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProgrammeId(p.id);
                                setTempFeeValue(String(p.fee || 0));
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Set Fee</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : tariffModalTab === 'reminders' ? (
              <div className="py-4 space-y-5 overflow-y-auto flex-1 min-h-0 pr-1">
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  Students with an outstanding balance are reminded automatically. Nobody sends reminders by hand again.
                </p>

                {/* Master switch */}
                <button
                  type="button"
                  onClick={() => setRemEnabled(!remEnabled)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-slate-900">Automatic reminders</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">Remind every student who owes, on the schedule below.</span>
                  </span>
                  <span className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${remEnabled ? 'bg-[var(--brand,#EA580C)]' : 'bg-slate-300'}`}>
                    <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all ${remEnabled ? 'left-[21px]' : 'left-[3px]'}`} />
                  </span>
                </button>

                {/* Schedule */}
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Schedule</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Remind how early</label>
                      <ModernSelect
                        value={String(remDays)}
                        onChange={(val) => setRemDays(Number(val))}
                        options={FEE_REMINDER_DAY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extra sweep</label>
                      <label className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${remMonday ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200 bg-white'}`}>
                        <input type="checkbox" checked={remMonday} onChange={(e) => setRemMonday(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer shrink-0" />
                        <span className="text-xs font-semibold text-slate-700">Also remind everyone owing every Monday</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Channels */}
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Channels</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${remEmail ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200 bg-white'}`}>
                      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Mail className="w-4 h-4 text-slate-500" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-900">Email</span>
                        <span className="block text-[10px] text-slate-500">To the student's email</span>
                      </span>
                      <input type="checkbox" checked={remEmail} onChange={(e) => setRemEmail(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer shrink-0" />
                    </label>
                    <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${remPush ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200 bg-white'}`}>
                      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><BellRing className="w-4 h-4 text-slate-500" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-900">Push notification</span>
                        <span className="block text-[10px] text-slate-500">On their device</span>
                      </span>
                      <input type="checkbox" checked={remPush} onChange={(e) => setRemPush(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer shrink-0" />
                    </label>
                    <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${remChat ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200 bg-white'}`}>
                      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><MessageSquare className="w-4 h-4 text-slate-500" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-900">In-chat message</span>
                        <span className="block text-[10px] text-slate-500">Sent as the facility</span>
                      </span>
                      <input type="checkbox" checked={remChat} onChange={(e) => setRemChat(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer shrink-0" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">The in-chat message is posted into the student's chat in the facility's name, never as the admin.</p>
                </div>

                {/* In-chat message */}
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">In-chat message</p>
                  <p className="text-[10px] text-slate-400 mt-1">Sample preview, filled in automatically:</p>
                  <div className="mt-1.5 max-w-[88%] bg-slate-100 rounded-xl rounded-bl-sm px-3.5 py-2.5">
                    <p className="text-[10px] font-black text-slate-900 mb-1">{centreName || 'The facility'}</p>
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                      {renderChatTemplate(remTemplate, { student_name: 'Sample Student', facility_name: centreName || 'the facility', outstanding_balance: `${settings.currencySymbol}25,000`, next_payment_due: '28 August' })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form id="tos-channel-settings-form" onSubmit={handleSaveChannelSettings} className="py-4 space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-blue-900 font-bold">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Facility Official Bank Account Details</span>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    These account details will be presented to students when making tuition payments via bank transfer or card.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Bank Name *</label>
                      <input
                        type="text"
                        required
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. Access Bank Plc"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Number *</label>
                      <input
                        type="text"
                        required
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        placeholder="e.g. 0123456789"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Name *</label>
                      <input
                        type="text"
                        required
                        value={bankAccountName}
                        onChange={(e) => setBankAccountName(e.target.value)}
                        placeholder="e.g. your facility's registered name"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-950 font-bold">
                    <Banknote className="w-4 h-4 text-amber-600" />
                    <span>Cash Payment Info Guide for Students</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Provide instructions for students who select cash: tell them who to pay cash to (e.g. Accounts Bursar at Admin Office), office location, and reminder to collect stamped paper receipt.
                  </p>
                  <div>
                    <textarea
                      rows={3}
                      required
                      value={cashPaymentGuide}
                      onChange={(e) => setCashPaymentGuide(e.target.value)}
                      placeholder="e.g. Please proceed in person to the Facility Accounts Bursar, Mr. Adeleke, at the Admin Office (Reception Block A, 1st Floor). Always collect an official stamped paper receipt upon payment."
                      className="w-full bg-white border border-amber-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

              </form>
            )}

            {/* Modal Footer: pinned per-tab actions, never scrolling away */}
            {tariffModalTab === 'reminders' ? (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  disabled={remBusy}
                  onClick={handleRunReminders}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 rounded-lg border border-slate-200 cursor-pointer"
                >
                  {remBusy ? 'Running…' : 'Run reminders now'}
                </button>
                <button
                  type="button"
                  disabled={remSaving}
                  onClick={handleSaveReminders}
                  className="px-4 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer"
                >
                  {remSaving ? 'Saving…' : 'Save reminder settings'}
                </button>
              </div>
            ) : tariffModalTab === 'channels' ? (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500">
                  Session: <strong className="text-slate-800">{settings.academicSession}</strong>
                </span>
                <button
                  type="submit"
                  form="tos-channel-settings-form"
                  className="px-4 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-lg shadow-sm cursor-pointer"
                >
                  Save Channel Details & Cash Guide
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowTariffModal(false);
                    setEditingProgrammeId(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-lg shadow-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Review Modal: evidence, details, window, then confirm or decline */}
      {reviewPayment && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Review Student Payment</h3>
                <p className="text-xs text-slate-500">Check the proof and details before confirming or declining</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewPayment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 overflow-y-auto flex-1 min-h-0 pr-1 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{reviewPayment.studentName}</span>
                  <span className="font-black text-slate-900">
                    {settings.currencySymbol}{(reviewPayment.amountPaid || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Payment mode: <strong className="text-slate-800">{reviewPayment.method}</strong></span>
                  <span>Submitted: {formatDateLong(reviewPayment.date)}</span>
                </div>
                {reviewPayment.note && (
                  <p className="text-slate-600 italic">"{reviewPayment.note}"</p>
                )}
                {reviewPayment.evidenceUrl ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setViewEvidenceModal({ url: reviewPayment.evidenceUrl!, title: `${reviewPayment.studentName} - Payment Evidence` })}
                      className="text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-1 cursor-pointer mb-1"
                    >
                      <Eye className="w-3 h-3" /> Tap to enlarge
                    </button>
                    <img
                      src={reviewPayment.evidenceUrl}
                      alt="Payment evidence"
                      className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-white cursor-pointer"
                      onClick={() => setViewEvidenceModal({ url: reviewPayment.evidenceUrl!, title: `${reviewPayment.studentName} - Payment Evidence` })}
                    />
                  </div>
                ) : (
                  <p className="text-amber-700 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> No proof attached to this payment.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Window (when this payment takes effect and expires)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500 mb-1">Takes effect from</span>
                    <input
                      type="date"
                      value={reviewFrom}
                      onChange={(e) => setReviewFrom(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500 mb-1">Expires on</span>
                    <input
                      type="date"
                      value={reviewTo}
                      onChange={(e) => setReviewTo(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">The expiry date becomes the student's next payment due date.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for declining (optional, shown to the student)
                </label>
                <textarea
                  rows={2}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="e.g. Amount does not match the transfer record"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                disabled={reviewBusy}
                onClick={handleReviewReject}
                className="px-4 py-2 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50 rounded-lg border border-rose-200 cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={handleReviewConfirm}
                className="px-4 py-2 text-xs font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer"
              >
                {reviewBusy ? 'Working...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Full Preview Modal */}
      {viewEvidenceModal && (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm truncate">{viewEvidenceModal.title}</h4>
              <button
                onClick={() => setViewEvidenceModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-3 flex-1 overflow-auto flex items-center justify-center bg-slate-950/5 rounded-xl mt-2">
              <img
                src={viewEvidenceModal.url}
                alt="Payment Evidence Proof"
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
