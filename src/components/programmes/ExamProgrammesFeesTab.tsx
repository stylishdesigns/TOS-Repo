import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Programme } from '../../types';
import {
  DollarSign,
  CreditCard,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Layers,
  X,
  Plus,
} from 'lucide-react';

export const ExamProgrammesFeesTab: React.FC = () => {
  const { programmes, students, updateProgramme, addToast } = useApp();

  const [editingProg, setEditingProg] = useState<Programme | null>(null);
  const [tuitionFee, setTuitionFee] = useState<number>(0);
  const [regFee, setRegFee] = useState<number>(5000);
  const [mockFee, setMockFee] = useState<number>(5000);

  // Compute metrics per programme
  const programmeFeeData = programmes.map((prog) => {
    const progStudents = students.filter((s) => s.programmeId === prog.id);
    const totalEnrolled = progStudents.length;
    const paidFull = progStudents.filter((s) => s.paymentStatus === 'Paid').length;
    const paidPartial = progStudents.filter((s) => s.paymentStatus === 'Partial').length;
    const unpaid = progStudents.filter((s) => s.paymentStatus === 'Pending').length;

    const totalCollected = progStudents.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const expectedTotal = totalEnrolled * prog.fee;
    const outstanding = Math.max(0, expectedTotal - totalCollected);

    return {
      programme: prog,
      totalEnrolled,
      paidFull,
      paidPartial,
      unpaid,
      totalCollected,
      expectedTotal,
      outstanding,
    };
  });

  const totalExpectedRevenue = programmeFeeData.reduce((acc, curr) => acc + curr.expectedTotal, 0);
  const totalCollectedRevenue = programmeFeeData.reduce((acc, curr) => acc + curr.totalCollected, 0);
  const totalArrears = Math.max(0, totalExpectedRevenue - totalCollectedRevenue);

  const handleOpenEdit = (prog: Programme) => {
    setEditingProg(prog);
    setTuitionFee(prog.fee);
    setRegFee(5000);
    setMockFee(5000);
  };

  const handleSaveFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProg) return;

    updateProgramme(editingProg.id, {
      fee: Number(tuitionFee),
    });

    addToast({
      type: 'success',
      title: 'Fee Structure Updated',
      description: `Fees for ${editingProg.name} updated to ₦${(Number(tuitionFee) || 0).toLocaleString()}.`,
    });

    setEditingProg(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Exam Programme Fees Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Exam Programmes Fee Schedule</h3>
            <p className="text-xs text-slate-500">
              Tuition, mock examinations, registration, and instalment payment breakdown
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium px-2.5 py-1 bg-orange-100 text-orange-800 rounded-lg">
              Termly / Session Rates
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Exam Programme</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Tuition Fee</th>
                <th className="py-3 px-4">Registration</th>
                <th className="py-3 px-4">Mock Exam</th>
                <th className="py-3 px-4">Instalment Plan</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programmeFeeData.map(({ programme }) => (
                <tr key={programme.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div>
                      <p className="font-bold text-slate-900">{programme.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{programme.code}</p>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {programme.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    ₦{(programme.fee || 0).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">₦5,000</td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">₦5,000</td>
                  <td className="py-3.5 px-4">
                    <div className="text-[11px]">
                      <span className="text-emerald-700 font-semibold">60%</span> deposit +{' '}
                      <span className="text-slate-600 font-medium">40%</span> in 30 days
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(programme)}
                      className="px-2.5 py-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors inline-flex items-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit Fee</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Fee Modal */}
      {editingProg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Configure Programme Fees</h3>
              <button onClick={() => setEditingProg(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFee} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Programme Name</label>
                <p className="font-bold text-slate-900 text-sm bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {editingProg.name} ({editingProg.code})
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tuition Fee (₦) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  step={1000}
                  value={tuitionFee}
                  onChange={(e) => setTuitionFee(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Registration Fee (₦)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={regFee}
                    onChange={(e) => setRegFee(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-medium focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mock Exam Fee (₦)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={mockFee}
                    onChange={(e) => setMockFee(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-medium focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600">
                <div className="flex justify-between font-bold text-slate-900 text-xs pb-1 border-b border-slate-200">
                  <span>Total Programme Package</span>
                  <span className="text-[#EA580C]">₦{(Number(tuitionFee || 0) + (regFee || 0) + (mockFee || 0)).toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Standard policy: 60% minimum deposit upon registration. Balance due 2 weeks before first mock exam.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProg(null)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
                >
                  Save Fee Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
