import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getAuth } from 'firebase/auth';
import { X, UserCog, Landmark } from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { PaySetupFields, PaySetupState, payFromDoc } from './PaySetupFields';

const inputClass =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none';

const DEPARTMENTS: string[] = ['Science', 'Commercial', 'Arts'];

const ROLES = [
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'Facility Admin', label: 'Facility Admin' },
  { value: 'Admin Secretary', label: 'Admin Secretary' },
  { value: 'Finance Admin', label: 'Finance Admin' },
  { value: 'Tutor', label: 'Tutor' },
];

// Full details editor for a tutor or an admin staff member. Everything is
// editable here; the email is the one field nobody can change.
export const EditStaffDetailsModal: React.FC<{
  staffDoc: any;
  collection: 'tutors' | 'admins';
  centreId: string;
  isTutor: boolean;
  onClose: () => void;
}> = ({ staffDoc, collection, centreId, isTutor, onClose }) => {
  const { addToast, programmes, subjects: allSubjects } = useApp();
  const [name, setName] = useState<string>(staffDoc?.name || '');
  const [phone, setPhone] = useState<string>(staffDoc?.phone || '');
  const [bio, setBio] = useState<string>(staffDoc?.bio || '');
  const [departments, setDepartments] = useState<string[]>(isTutor ? (staffDoc?.departments || ['Science']) : []);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(isTutor ? (staffDoc?.subjects || []) : []);
  const [examType, setExamType] = useState<string>(isTutor ? (staffDoc?.examTypes?.[0] || programmes[0]?.name || '') : '');
  const [department, setDepartment] = useState<string>(!isTutor ? (staffDoc?.department || '') : '');
  const [jobTitle, setJobTitle] = useState<string>(!isTutor ? (staffDoc?.jobTitle || '') : '');
  const [role, setRole] = useState<string>(!isTutor ? (staffDoc?.role || 'Admin Secretary') : '');
  const [pay, setPay] = useState<PaySetupState>(payFromDoc(staffDoc));
  const [bankName, setBankName] = useState<string>(staffDoc?.bankName || '');
  const [bankAccountName, setBankAccountName] = useState<string>(staffDoc?.bankAccountName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>(staffDoc?.bankAccountNumber || '');
  const [saving, setSaving] = useState(false);

  const toggleDepartment = (dept: string) => {
    const exists = departments.includes(dept);
    const next = exists
      ? (departments.length === 1 ? departments : departments.filter((d) => d !== dept))
      : [...departments, dept];
    setDepartments(next);
    const allowed = (allSubjects || []).filter((s: any) => s.department === 'General' || next.includes(s.department));
    setSelectedSubjects((prev) => prev.filter((sub) => allowed.some((s: any) => s.name === sub)));
  };

  const toggleSubject = (subjectName: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subjectName) ? prev.filter((s) => s !== subjectName) : [...prev, subjectName]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast({ type: 'error', title: 'Name Required', description: 'The name cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/staff/details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          centreId,
          collection,
          staffId: staffDoc.id,
          name,
          phone,
          bankName,
          bankAccountName,
          bankAccountNumber,
          payFrequency: pay.frequency,
          payDay: pay.day,
          ratePerPeriod: pay.ratePerPeriod,
          payAmount: pay.payAmount,
          ...(isTutor
            ? { bio, departments, examTypes: examType ? [examType] : [], subjects: selectedSubjects }
            : { department, jobTitle, role }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save the changes.');
      addToast({ type: 'success', title: 'Details Saved', description: `${name}'s details have been updated.` });
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Failed', description: err?.message || 'Could not save the changes.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 p-6 shrink-0">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
              <UserCog className="w-5 h-5 text-orange-600" />
              <span>Edit Details</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{staffDoc?.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 text-xs">
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
              <input type="tel" placeholder="+234 800 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email (read-only)</label>
              <input type="email" value={staffDoc?.email || ''} disabled className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-400 cursor-not-allowed" />
              <p className="text-[10px] text-slate-400 mt-1">The email cannot be changed; it is their sign-in identity.</p>
            </div>
          </div>

          {isTutor ? (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bio</label>
                <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Departments</label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map((dept) => {
                    const active = departments.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => toggleDepartment(dept)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                          active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Subjects They Teach</label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                  {(allSubjects || [])
                    .filter((s: any) => s.department === 'General' || departments.includes(s.department))
                    .map((s: any) => {
                      const active = selectedSubjects.includes(s.name);
                      return (
                        <button
                          key={s.id || s.name}
                          type="button"
                          onClick={() => toggleSubject(s.name)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                            active ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exam Programme</label>
                {programmes && programmes.length > 0 ? (
                  <ModernSelect
                    label="Exam Programme"
                    value={examType}
                    onChange={(val) => setExamType(val)}
                    options={programmes.map((p: any) => ({ value: p.name, label: p.name }))}
                  />
                ) : (
                  <input type="text" placeholder="e.g. JAMB UTME Prep" value={examType} onChange={(e) => setExamType(e.target.value)} className={inputClass} />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input type="text" placeholder="e.g. Finance" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Job Title</label>
                  <input type="text" placeholder="e.g. Bursar" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role</label>
                <ModernSelect label="Role" value={role} onChange={(val) => setRole(val)} options={ROLES} />
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100">
            <p className="font-bold text-slate-800 mb-2">Pay Setup</p>
            <PaySetupFields pay={pay} setPay={setPay} showRatePerClass={isTutor} />
          </div>

          <div className="pt-3 border-t border-slate-100">
            <p className="font-bold text-slate-800 mb-1 flex items-center space-x-1.5">
              <Landmark className="w-4 h-4 text-slate-500" />
              <span>Bank Account Details</span>
            </p>
            <p className="text-[10px] text-slate-400 mb-2">Where their pay goes when you transfer it.</p>
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                <input type="text" placeholder="e.g. GTBank" value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Name</label>
                  <input type="text" placeholder="e.g. John Okafor" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Number</label>
                  <input type="text" inputMode="numeric" placeholder="e.g. 0123456789" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
