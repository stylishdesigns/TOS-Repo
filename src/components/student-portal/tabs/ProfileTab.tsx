import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Student } from '../../../types';
import studentHeroAvatar from '../../../assets/images/regenerated_image_1789369642757.jpg';
import { ModernSelect } from '../../ui/ModernSelect';
import {
  Award,
  CreditCard,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  MapPin,
  QrCode,
  Shield,
  RotateCcw,
  Users,
  ChevronRight,
} from 'lucide-react';

interface ProfileTabProps {
  student: Student;
  onSelectStudent: (id: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ student, onSelectStudent }) => {
  const { students, settings, payments, addPayment, addToast } = useApp();

  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(
    student.outstandingBalance > 0 ? student.outstandingBalance : 10000
  );

  // Student payments
  const studentPayments = payments.filter((p) => p.studentId === student.id);

  const MALE_NIGERIAN_AVATAR =
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';
  const FEMALE_NIGERIAN_AVATAR =
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=500&q=80';

  const resolvedAvatar =
    studentHeroAvatar ||
    (student.avatar &&
    !student.avatar.includes('photo-1534528741775') &&
    !student.avatar.includes('photo-1517841905240')
      ? student.avatar
      : student.gender === 'Female'
      ? FEMALE_NIGERIAN_AVATAR
      : MALE_NIGERIAN_AVATAR);

  // Simulate payment
  const handleCompletePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0) return;

    const receiptNum = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    addPayment({
      receiptNumber: receiptNum,
      studentId: student.id,
      studentName: student.name,
      programmeName: student.programmeName,
      amountPaid: payAmount,
      totalFee: student.totalFee,
      balance: Math.max(0, student.outstandingBalance - payAmount),
      status: student.outstandingBalance - payAmount <= 0 ? 'Paid' : 'Partial',
      method: 'Card',
      date: new Date().toISOString().split('T')[0],
    });

    // Update student's paidAmount
    student.paidAmount += payAmount;
    student.outstandingBalance = Math.max(0, student.totalFee - student.paidAmount);

    setShowPayModal(false);
    addToast({
      type: 'success',
      title: 'Payment Successful',
      description: `Payment of ${settings.currencySymbol}${(payAmount || 0).toLocaleString()} confirmed. Receipt ${receiptNum} issued.`,
    });
  };

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-[#EA580C] tracking-wider">
            Student Identification
          </span>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">
            Digital ID & Account
          </h2>
        </div>

        {/* Quick Student Switcher */}
        <div className="flex items-center space-x-1.5 min-w-[140px]">
          <ModernSelect
            value={student.id}
            onChange={(val) => onSelectStudent(val)}
            options={students.map((s) => ({
              value: s.id,
              label: s.name
            }))}
            className="w-full text-xs"
          />
        </div>
      </div>

      {/* 1. Digital Student ID Card (PVC Card simulation) */}
      <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-700 bg-gradient-to-br from-slate-950 via-[#070F1E] to-slate-900 text-white p-5 space-y-4">
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 relative z-10">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-[#EA580C] text-white flex items-center justify-center font-black text-xs">
              EX
            </div>
            <div>
              <span className="text-xs font-black tracking-wider uppercase block leading-none">
                {settings.centreName}
              </span>
              <span className="text-[9px] text-orange-400 font-semibold tracking-wider uppercase">
                Official Student Identity Card
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Active 2026
          </span>
        </div>

        {/* Card Body with Passport Photo & Details */}
        <div className="flex items-start gap-4 relative z-10">
          <div className="relative shrink-0">
            <img
              src={resolvedAvatar}
              alt={student.name}
              className="w-20 h-24 rounded-2xl object-cover border-2 border-orange-500/60 shadow-lg"
            />
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 bg-slate-900 text-orange-300 font-mono text-[8px] font-bold rounded border border-orange-500/40">
              ID PASS
            </span>
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <div>
              <span className="text-[9px] text-slate-400 uppercase font-semibold block">Full Name</span>
              <h3 className="text-sm font-black text-white truncate">{student.name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[9px] text-slate-400 uppercase font-semibold block">Campus</span>
                <span className="font-semibold text-slate-200 text-[11px]">Ikeja Main</span>
              </div>
            </div>

            <div>
              <span className="text-[9px] text-slate-400 uppercase font-semibold block">Cohort Programme</span>
              <span className="text-[11px] font-medium text-slate-300 line-clamp-1">
                {student.programmeName}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer with Gate Access Barcode */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between relative z-10">
          <div className="space-y-0.5">
            <span className="text-[8px] text-slate-400 uppercase font-mono tracking-wider block">
              Gate Barcode Check-in
            </span>
            {/* Simulated Barcode */}
            <div className="flex items-center space-x-0.5 h-6 opacity-85">
              {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2].map((w, i) => (
                <span
                  key={i}
                  style={{ width: `${w}px` }}
                  className="h-full bg-slate-200 inline-block"
                />
              ))}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[9px] font-mono text-slate-400 block">Valid Academic Session</span>
            <span className="text-[10px] font-bold text-white">{settings.academicSession}</span>
          </div>
        </div>
      </div>

      {/* 2. Tuition Account & Payments */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-[#EA580C]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Tuition & Programme Fees
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              student.outstandingBalance > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {student.outstandingBalance > 0 ? 'Balance Due' : 'Fully Cleared'}
          </span>
        </div>

        {/* Fee Statistics */}
        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200/70">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Tuition</span>
            <span className="text-xs font-bold text-slate-900">
              {settings.currencySymbol}
              {(student.totalFee || 0).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Paid</span>
            <span className="text-xs font-bold text-emerald-700">
              {settings.currencySymbol}
              {(student.paidAmount || 0).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Outstanding</span>
            <span className="text-xs font-bold text-rose-700">
              {settings.currencySymbol}
              {(student.outstandingBalance || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Pay Button if balance exists */}
        {student.outstandingBalance > 0 ? (
          <button
            onClick={() => setShowPayModal(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#C2410C] hover:to-amber-700 text-white font-bold text-xs shadow-xs active:scale-98 transition-all flex items-center justify-center space-x-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              Pay Outstanding Balance ({settings.currencySymbol}
              {(student.outstandingBalance || 0).toLocaleString()})
            </span>
          </button>
        ) : (
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-center space-x-2 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>All Tuition Fees Cleared for Current Session</span>
          </div>
        )}

        {/* Payment History List */}
        {studentPayments.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Payment Receipts ({studentPayments.length})
            </span>
            {studentPayments.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-800">
                    {settings.currencySymbol}
                    {(p.amountPaid || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {p.receiptNumber} • {p.date}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {p.receiptNumber} • {p.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Attendance Log Summary */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Attendance Summary
            </h3>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            {student.attendancePercent}% Present
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-semibold">Classes</span>
            <span className="font-bold text-slate-900 text-sm">37</span>
          </div>
          <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
            <span className="text-[10px] text-emerald-600 block font-semibold">Present</span>
            <span className="font-bold text-emerald-800 text-sm">34</span>
          </div>
          <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
            <span className="text-[10px] text-amber-600 block font-semibold">Late</span>
            <span className="font-bold text-amber-800 text-sm">2</span>
          </div>
          <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
            <span className="text-[10px] text-rose-600 block font-semibold">Excused</span>
            <span className="font-bold text-rose-800 text-sm">1</span>
          </div>
        </div>
      </div>

      {/* 4. Campus Contact & Support */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          Campus Coordination & Help Desk
        </h3>

        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-[#EA580C] shrink-0" />
            <span>{settings.address}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{settings.phone}</span>
          </div>
        </div>

        <a
          href={`https://wa.me/${(settings.whatsappNumber || settings.whatsapp || '+2348056765455').replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-xs"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat with Ikeja Coordinator on WhatsApp</span>
        </a>
      </div>

      {/* Payment Gateway Modal (Simulation) */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-extrabold uppercase text-[#EA580C]">
                  Direct Payment Gateway
                </span>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCompletePayment} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tuition Fee Payment Amount ({settings.currencySymbol})
                </label>
                <input
                  type="number"
                  min="1000"
                  max={student.outstandingBalance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Outstanding balance: {settings.currencySymbol}
                  {(student.outstandingBalance || 0).toLocaleString()}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1 text-slate-600 border border-slate-200/80">
                <div className="flex justify-between">
                  <span>Student:</span>
                  <span className="font-bold text-slate-800">{student.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Channel:</span>
                  <span className="font-bold text-emerald-700">Online Card / Transfer</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
