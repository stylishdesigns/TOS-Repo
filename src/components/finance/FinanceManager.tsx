import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PaymentRecord, isConfirmedPayment } from '../../types';
import { ModernSelect } from '../ui/ModernSelect';
import {
  CreditCard,
  Search,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  Receipt,
  X,
  Building2,
  DollarSign,
  TrendingUp,
  Settings,
  Edit2,
  Check,
  Image as ImageIcon,
  FileText,
  Eye,
  CreditCard as CardIcon,
  Banknote,
  Copy,
} from 'lucide-react';

export const FinanceManager: React.FC = () => {
  const {
    payments,
    students,
    programmes,
    settings,
    recordPayment,
    confirmPayment,
    updateProgramme,
    updateSettings,
    addToast,
    centreName,
  } = useApp();

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('All');
  const [examTypeFilter, setExamTypeFilter] = useState<string>('All');
  const [monthRangeStart, setMonthRangeStart] = useState<string>('');
  const [monthRangeEnd, setMonthRangeEnd] = useState<string>('');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);

  // Exam Program Fee & Channel Settings Modal State
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [tariffModalTab, setTariffModalTab] = useState<'fees' | 'channels'>('fees');
  const [editingProgrammeId, setEditingProgrammeId] = useState<string | null>(null);
  const [tempFeeValue, setTempFeeValue] = useState<string>('');

  // Center Account & Cash Guide settings state
  const [bankName, setBankName] = useState(settings.bankName || 'Access Bank Plc');
  const [bankAccountNumber, setBankAccountNumber] = useState(settings.bankAccountNumber || '0123456789');
  const [bankAccountName, setBankAccountName] = useState(settings.bankAccountName || centreName);
  const [cashPaymentGuide, setCashPaymentGuide] = useState(
    settings.cashPaymentGuide ||
      'Please proceed in person to the Centre Accounts Bursar, Mr. Adeleke, at the Admin Office (Reception Block A, 1st Floor). Always collect an official stamped paper receipt upon payment.'
  );

  // Preview evidence modal
  const [viewEvidenceModal, setViewEvidenceModal] = useState<{ url: string; title: string } | null>(null);

  // New payment form
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Card' | 'Cash'>('Bank Transfer');
  const [adminNote, setAdminNote] = useState('');

  // Only confirmed payments count as money collected.
  const totalCollected = payments
    .filter(isConfirmedPayment)
    .reduce((sum, p) => sum + (p.amountPaid || 0), 0);
  const pendingPayments = payments.filter((p) => p.status === 'Pending');
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);

  const handleConfirmPayment = async (pay: PaymentRecord) => {
    const ok = window.confirm(
      `Confirm ${settings.currencySymbol}${(pay.amountPaid || 0).toLocaleString()} from ${pay.studentName}?\n\nOnly confirm after you have checked the proof or your bank statement. This updates the student's balance.`
    );
    if (!ok) return;
    setBusyPaymentId(pay.id);
    try {
      await confirmPayment(pay.id, 'confirm');
    } finally {
      setBusyPaymentId(null);
    }
  };

  const handleRejectPayment = async (pay: PaymentRecord) => {
    const reason = window.prompt(
      `Reject ${settings.currencySymbol}${(pay.amountPaid || 0).toLocaleString()} from ${pay.studentName}?\nOptional reason (shown to the student):`,
      ''
    );
    if (reason === null) return;
    setBusyPaymentId(pay.id);
    try {
      await confirmPayment(pay.id, 'reject', reason);
    } finally {
      setBusyPaymentId(null);
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
    });
    addToast({
      type: 'success',
      title: 'Payment Settings Saved',
      description: 'Centre bank account details and cash payment instructions updated.',
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

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      !search ||
      p.studentName.toLowerCase().includes(search.toLowerCase()) ||
      (p.receiptNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      p.programmeName.toLowerCase().includes(search.toLowerCase());

    const matchesMethod = methodFilter === 'All' || p.method === methodFilter;

    // Filter: Full vs Partial
    const matchesStatus =
      paymentStatusFilter === 'All' || p.status === paymentStatusFilter;

    // Filter: Exam Type
    const matchesExamType =
      examTypeFilter === 'All' ||
      p.programmeName.toUpperCase().includes(examTypeFilter.toUpperCase()) ||
      programmes.some(
        (prog) =>
          prog.name.toLowerCase() === p.programmeName.toLowerCase() &&
          prog.category.toUpperCase().includes(examTypeFilter.toUpperCase())
      );

    // Filter: Month selector range
    let matchesMonth = true;
    if (p.date) {
      // p.date format is typically YYYY-MM-DD
      const paymentMonth = p.date.substring(0, 7); // "YYYY-MM"
      if (monthRangeStart && paymentMonth < monthRangeStart) {
        matchesMonth = false;
      }
      if (monthRangeEnd && paymentMonth > monthRangeEnd) {
        matchesMonth = false;
      }
    }

    return matchesSearch && matchesMethod && matchesStatus && matchesExamType && matchesMonth;
  });

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.id === selectedStudentId);
    if (!st) return;

    const amount = Number(amountPaid);
    if (!amount || amount <= 0) return;

    const result = await recordPayment({
      studentId: st.id,
      amountPaid: amount,
      method: paymentMethod,
      note: adminNote.trim() || undefined,
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
              onClick={() => setShowRecordModal(true)}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all inline-flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
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
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-orange-50 hover:text-[#EA580C] hover:border-orange-300 border border-slate-200 rounded-xl shadow-xs transition-all group cursor-pointer"
            title="Configure Exam Program Fees, Bank Details & Cash Guide"
          >
            <Settings className="w-4 h-4 text-slate-400 group-hover:text-[#EA580C] group-hover:rotate-90 transition-transform duration-500" />
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
        {/* Responsive Multi-filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
            {/* Full / Partial payment filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Payment Status
              </label>
              <ModernSelect
                value={paymentStatusFilter}
                onChange={(val) => setPaymentStatusFilter(val)}
                options={[
                  { value: 'All', label: 'All Statuses' },
                  { value: 'Paid', label: 'Full Payment (Paid)' },
                  { value: 'Partial', label: 'Partial Payment' },
                  { value: 'Pending', label: 'Awaiting Confirmation' },
                  { value: 'Rejected', label: 'Rejected' }
                ]}
              />
            </div>

            {/* Exam Type filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Exam Type
              </label>
              <ModernSelect
                value={examTypeFilter}
                onChange={(val) => setExamTypeFilter(val)}
                options={[
                  { value: 'All', label: 'All Exam Types' },
                  { value: 'JAMB', label: 'JAMB / UTME' },
                  { value: 'WAEC', label: 'WAEC / WASSCE' },
                  { value: 'NECO', label: 'NECO SSCE' },
                  { value: 'A-Levels', label: 'Cambridge A-Levels' },
                  { value: 'SAT', label: 'SAT / International' }
                ]}
              />
            </div>

            {/* Payment Channel filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Channel
              </label>
              <ModernSelect
                value={methodFilter}
                onChange={(val) => setMethodFilter(val)}
                options={[
                  { value: 'All', label: 'All Channels' },
                  { value: 'Bank Transfer', label: 'Bank Transfer' },
                  { value: 'Card', label: 'POS / Card' },
                  { value: 'Cash', label: 'Cash' }
                ]}
              />
            </div>

            {/* Month Range Quick Picker */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Month Range
              </label>
              <div className="flex items-center space-x-1">
                <input
                  type="month"
                  value={monthRangeStart}
                  onChange={(e) => setMonthRangeStart(e.target.value)}
                  placeholder="From"
                  className="w-1/2 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 font-medium focus:border-orange-500 outline-none shadow-2xs"
                  title="From Month"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="month"
                  value={monthRangeEnd}
                  onChange={(e) => setMonthRangeEnd(e.target.value)}
                  placeholder="To"
                  className="w-1/2 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 font-medium focus:border-orange-500 outline-none shadow-2xs"
                  title="To Month"
                />
              </div>
            </div>
          </div>

          {/* Search + Clear filters */}
          <div className="flex items-center space-x-2 w-full lg:w-72 mt-2 lg:mt-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search receipt # or student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
              />
            </div>
            {(paymentStatusFilter !== 'All' ||
              examTypeFilter !== 'All' ||
              methodFilter !== 'All' ||
              monthRangeStart ||
              monthRangeEnd ||
              search) && (
              <button
                onClick={() => {
                  setPaymentStatusFilter('All');
                  setExamTypeFilter('All');
                  setMethodFilter('All');
                  setMonthRangeStart('');
                  setMonthRangeEnd('');
                  setSearch('');
                }}
                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {pendingPayments.length > 0 && (
          <div className="flex items-center justify-between gap-3 p-3 mt-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
            <span className="font-semibold">
              {pendingPayments.length} student payment{pendingPayments.length === 1 ? '' : 's'} awaiting your confirmation. Balances only change once you confirm.
            </span>
            <button
              type="button"
              onClick={() => setPaymentStatusFilter('Pending')}
              className="px-2.5 py-1 font-bold rounded-md bg-white border border-blue-200 hover:bg-blue-100 cursor-pointer shrink-0"
            >
              Review
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-100 mt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Programme</th>
                <th className="py-3 px-4">Outstanding Balance</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    No payment records match query.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{pay.studentName}</span>
                        {pay.submittedBy === 'Student' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            Student Portal
                          </span>
                        )}
                      </div>
                      {pay.note && (
                        <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                          "{pay.note}"
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {pay.programmeName}
                    </td>
                    <td className="py-3 px-4 font-black text-amber-700">
                      {settings.currencySymbol}
                      {(pay.balance || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span>{pay.method}</span>
                        {pay.status === 'Pending' && !pay.evidenceUrl && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            No proof
                          </span>
                        )}
                        {pay.evidenceUrl && (
                          <button
                            type="button"
                            onClick={() => setViewEvidenceModal({ url: pay.evidenceUrl!, title: `${pay.studentName} - Payment Evidence` })}
                            className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer"
                            title="View Payment Evidence"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          pay.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : pay.status === 'Pending'
                            ? 'bg-blue-100 text-blue-800'
                            : pay.status === 'Rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {pay.status === 'Pending' ? 'Awaiting' : pay.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {pay.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busyPaymentId === pay.id}
                            onClick={() => handleConfirmPayment(pay)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={busyPaymentId === pay.id}
                            onClick={() => handleRejectPayment(pay)}
                            className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50 rounded-md border border-rose-200 cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : pay.status === 'Rejected' ? (
                        <span className="text-[10px] text-slate-400 italic" title={pay.rejectionReason || ''}>
                          {pay.rejectionReason ? 'Rejected: ' + pay.rejectionReason : 'Rejected'}
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedReceipt(pay)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md border border-slate-200 flex items-center space-x-1 ml-auto cursor-pointer"
                        >
                          <Receipt className="w-3 h-3 text-[#EA580C]" />
                          <span>View Detail</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">Record Tuition Payment</h3>
              <button
                onClick={() => setShowRecordModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="py-4 space-y-3.5 text-xs">
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
                  { value: 'Card', label: 'Debit Card / POS Terminal' },
                  { value: 'Cash', label: 'Cash Receipt at Bursary Desk' }
                ]}
              />

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
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
                >
                  Post Payment & Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Transaction Details</h3>
                <p className="text-xs text-slate-500">Student payment history and profile identification</p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
              {/* Left Column: Student Profile & History */}
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedReceipt.studentName}`} 
                      alt={selectedReceipt.studentName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{selectedReceipt.studentName}</h4>
                    <p className="text-[11px] text-slate-500 font-medium">{selectedReceipt.programmeName}</p>
                    <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedReceipt.status === 'Paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {selectedReceipt.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment History</h5>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <div>
                          <p className="text-[11px] font-bold text-slate-800">{selectedReceipt.date || 'Sep 12, 2026'}</p>
                          <p className="text-[9px] text-slate-500">{selectedReceipt.method}</p>
                        </div>
                      </div>
                      <p className="text-[11px] font-black text-slate-900">
                        {settings.currencySymbol}{(selectedReceipt.amountPaid || 0).toLocaleString()}
                      </p>
                    </div>
                    {/* Placeholder for previous installments */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-100/50 opacity-60">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <div>
                          <p className="text-[11px] font-bold text-slate-400">Aug 28, 2026</p>
                          <p className="text-[9px] text-slate-300">Bank Transfer</p>
                        </div>
                      </div>
                      <p className="text-[11px] font-black text-slate-400">
                        {settings.currencySymbol}15,000
                      </p>
                    </div>
                  </div>
                </div>
                {selectedReceipt.evidenceUrl && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Payment Evidence Uploaded
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setViewEvidenceModal({
                            url: selectedReceipt.evidenceUrl!,
                            title: `${selectedReceipt.studentName} - Payment Evidence`,
                          })
                        }
                        className="text-[10px] font-bold text-[#EA580C] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Enlarge</span>
                      </button>
                    </div>
                    <img
                      src={selectedReceipt.evidenceUrl}
                      alt="Uploaded Payment Evidence"
                      className="w-full max-h-44 object-contain rounded-lg border border-slate-200 bg-white cursor-pointer hover:opacity-95"
                      onClick={() =>
                        setViewEvidenceModal({
                          url: selectedReceipt.evidenceUrl!,
                          title: `${selectedReceipt.studentName} - Payment Evidence`,
                        })
                      }
                    />
                  </div>
                )}

                {selectedReceipt.note && (
                  <div className="p-3 bg-orange-50/60 rounded-xl border border-orange-200 text-xs text-orange-950">
                    <span className="text-[10px] font-bold text-orange-800 uppercase block mb-1">
                      {selectedReceipt.method === 'Cash'
                        ? 'Bursary Cash Statement / Note'
                        : 'Payment Short Note / Statement'}
                    </span>
                    <p className="font-medium italic">"{selectedReceipt.note}"</p>
                  </div>
                )}
              </div>

              {/* Right Column: Balance Summary */}
              <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial Summary</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-400">Total Course Fee</p>
                      <p className="text-xl font-black">{settings.currencySymbol}{(selectedReceipt.totalFee || 0).toLocaleString()}</p>
                    </div>
                    
                    <div className="h-px bg-slate-800 w-full" />
                    
                    <div>
                      <p className="text-xs text-slate-400">Total Amount Paid</p>
                      <p className="text-xl font-black text-emerald-400">
                        {settings.currencySymbol}{((selectedReceipt.totalFee || 0) - (selectedReceipt.balance || 0)).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-800">
                  <p className="text-xs text-amber-400 font-bold mb-1">Outstanding Balance</p>
                  <p className="text-3xl font-black text-white">
                    {settings.currencySymbol}{(selectedReceipt.balance || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-6 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exam Program Fee & Payment Settings Modal */}
      {showTariffModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#EA580C]">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">Exam Program Fee & Payment Settings</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#EA580C]">
                      {settings.academicSession}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Set up approved tuition fees, centre account details, and cash payment guidelines
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
                    ? 'border-[#EA580C] text-[#EA580C]'
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
                    ? 'border-[#EA580C] text-[#EA580C]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Center Account & Cash Guide
              </button>
            </div>

            {/* Modal Body */}
            {tariffModalTab === 'fees' ? (
              <div className="py-4 space-y-3 overflow-y-auto flex-1 pr-1">
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
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
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
            ) : (
              <form onSubmit={handleSaveChannelSettings} className="py-4 space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-blue-900 font-bold">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Centre Official Bank Account Details</span>
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
                        placeholder="e.g. your centre's registered name"
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
                      placeholder="e.g. Please proceed in person to the Centre Accounts Bursar, Mr. Adeleke, at the Admin Office (Reception Block A, 1st Floor). Always collect an official stamped paper receipt upon payment."
                      className="w-full bg-white border border-amber-300 rounded-lg p-2.5 text-xs text-slate-900 font-medium focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Channel Details & Cash Guide</span>
                  </button>
                </div>
              </form>
            )}

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Session: <strong className="text-slate-800">{settings.academicSession}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowTariffModal(false);
                  setEditingProgrammeId(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Done
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
