import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  X,
  User,
  Phone,
  Mail,
  School,
  Building2,
  Calendar,
  CheckCircle,
  CreditCard,
  Clock,
  Edit2,
  Save,
} from 'lucide-react';

export const StudentDetailModal: React.FC = () => {
  const {
    selectedStudent,
    setSelectedStudent,
    settings,
    updateStudent,
    recordPayment,
    payments,
  } = useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Card' | 'Cash'>('Bank Transfer');

  if (!selectedStudent) return null;

  const studentPayments = payments.filter((p) => p.studentId === selectedStudent.id);

  const handleRecordInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;

    recordPayment({
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      programmeName: selectedStudent.programmeName,
      amountPaid: amount,
      totalFee: selectedStudent.totalFee,
      balance: Math.max(0, selectedStudent.outstandingBalance - amount),
      status: amount >= selectedStudent.outstandingBalance ? 'Paid' : 'Partial',
      method: paymentMethod,
    });

    setShowPaymentForm(false);
    setPaymentAmount('');
  };

  return (
    <div
      id="student-detail-modal-backdrop"
      className="fixed inset-0 bg-black/60 z-50 flex items-facility justify-facility p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-facility space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 font-extrabold text-base flex items-facility justify-facility">
              {selectedStudent.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
            </div>
            <div>
              <div className="flex items-facility space-x-2">
                <h3 className="text-lg font-extrabold text-slate-900">
                  {selectedStudent.name}
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                  {selectedStudent.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {selectedStudent.programmeName} • {selectedStudent.branchName}
              </p>
            </div>
          </div>

          <button
            id="close-student-detail-btn"
            onClick={() => setSelectedStudent(null)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-6">
          {/* Key Metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Attendance Rate
              </span>
              <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">
                {selectedStudent.attendancePercent}%
              </span>
              <span className="text-[10px] text-emerald-600 font-bold">Good Standing</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 block">Total Tuition</span>
              <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">
                {settings.currencySymbol}
                {(selectedStudent.totalFee || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                Paid: {settings.currencySymbol}{(selectedStudent.paidAmount || 0).toLocaleString()}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Outstanding Balance
              </span>
              <span
                className={`text-xl font-extrabold mt-0.5 block ${
                  (selectedStudent.outstandingBalance || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {settings.currencySymbol}
                {(selectedStudent.outstandingBalance || 0).toLocaleString()}
              </span>
              {(selectedStudent.outstandingBalance || 0) > 0 ? (
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="text-[10px] text-amber-700 font-bold underline hover:text-amber-800"
                >
                  + Record Payment
                </button>
              ) : (
                <span className="text-[10px] text-emerald-600 font-bold">Cleared</span>
              )}
            </div>
          </div>

          {/* Payment Form (if triggered) */}
          {showPaymentForm && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
              <div className="flex items-facility justify-between">
                <h4 className="text-xs font-bold text-amber-900">
                  Record Fee Payment for {selectedStudent.name}
                </h4>
                <button
                  onClick={() => setShowPaymentForm(false)}
                  className="text-xs text-amber-700 hover:text-amber-900"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleRecordInstallment} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Amount ({settings.currencySymbol})
                  </label>
                  <input
                    type="number"
                    required
                    max={selectedStudent.outstandingBalance}
                    placeholder={`Max ${selectedStudent.outstandingBalance}`}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <ModernSelect
                    label="Payment Method"
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(val as any)}
                    options={[
                      { value: 'Bank Transfer', label: 'Bank Transfer' },
                      { value: 'Card', label: 'POS / Debit Card' },
                      { value: 'Cash', label: 'Cash at Counter' }
                    ]}
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
                  >
                    Generate Receipt
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Student Profile Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-100 space-y-2.5">
              <h4 className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider">
                Candidate Details
              </h4>
              <div className="flex items-facility justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Phone:</span>
                <span className="font-semibold text-slate-800">{selectedStudent.phone}</span>
              </div>
              <div className="flex items-facility justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Email:</span>
                <span className="font-semibold text-slate-800">{selectedStudent.email}</span>
              </div>
              <div className="flex items-facility justify-between py-1">
                <span className="text-slate-500">Residential Address:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                  {selectedStudent.address}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-100 space-y-2.5">
              <h4 className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider">
                Parent / Guardian Contact
              </h4>
              <div className="flex items-facility justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Parent Name:</span>
                <span className="font-semibold text-slate-800">{selectedStudent.parentName}</span>
              </div>
              <div className="flex items-facility justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Parent WhatsApp:</span>
                <span className="font-semibold text-slate-800">{selectedStudent.parentWhatsApp}</span>
              </div>
              <div className="flex items-facility justify-between py-1">
                <span className="text-slate-500">Enrolment Date:</span>
                <span className="font-semibold text-slate-800">
                  {selectedStudent.registrationDate}
                </span>
              </div>
            </div>
          </div>

        </div>

        <div className="pt-4 border-t border-slate-100 flex items-facility justify-end">
          <button
            onClick={() => setSelectedStudent(null)}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
