import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminUser } from '../../types';
import {
  Shield,
  Users,
  UserCheck,
  Plus,
  Search,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Edit2,
  Trash2,
  X,
  Check,
  GraduationCap,
  Briefcase,
  KeyRound,
  Building,
  ShieldAlert,
  Pencil,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { ModernSelect } from '../ui/ModernSelect';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { PaySetupFields, emptyPaySetup, formatPayInfo, PaySetupState } from './PaySetupFields';
import { EditStaffDetailsModal } from './EditStaffDetails';

export type StaffRole = AdminUser['role'];

const ROLE_PERMISSIONS: Record<
  StaffRole,
  {
    badgeColor: string;
    description: string;
    permissions: string[];
  }
> = {
  'Super Admin': {
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Full administrative authority across branches, finance, staff and settings.',
    permissions: [
      'Manage Staff & User Permissions',
      'Finance & Fee Collection Audits',
      'All Programmes & Academic Tariffs',
      'Facility Settings & Website Page',
      'Approve Tutor Topics & Timetables',
    ],
  },
  'Facility Admin': {
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Facility coordinator overseeing daily academic schedules, tutor topics, and student progress.',
    permissions: [
      'Approve Tutor Topic Proposals',
      'Manage Master Timetable & Classrooms',
      'Admissions Review & Candidate Screening',
      'Attendance & Roll Call Surveillance',
      'CBT & Mock Results Compilation',
    ],
  },
  'Admin Secretary': {
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Administrative desk officer handling admissions intake, daily roll calls, and receipting.',
    permissions: [
      'Student Registration & Profile Intake',
      'Record Fee Payments & Issue Receipts',
      'Daily Check-in / Checkout Logs',
      'SMS Absent Alert Dispatch',
      'Front Desk Parent Queries',
    ],
  },
  'Tutor': {
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
    description: 'Subject specialist delivering lectures, submitting syllabus topics, and grading tests.',
    permissions: [
      'Submit Subject Topics for Facility Consent',
      'View Assigned Timetable & Classrooms',
      'Mark Classroom Attendance',
      'Upload Continuous Assessment Scores',
      'Track Cohort Performance Analytics',
    ],
  },
  'Finance Admin': {
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Financial officer responsible for fee reconciliation, payroll, and expense tracking.',
    permissions: [
      'Record & Verify Payments',
      'Generate Financial Reports',
      'Manage Staff Payroll',
      'Track Facility Expenses',
    ],
  },
};

const getRoleInfo = (role: string) => {
  return (
    ROLE_PERMISSIONS[role as StaffRole] || 
    ROLE_PERMISSIONS['Tutor']
  );
};

export const StaffRolesManager: React.FC = () => {
  const { addToast, admins, deleteAdmin, toggleAdminSuspend, activeUser, activeCentreId } = useApp();

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingStaff, setViewingStaff] = useState<AdminUser | null>(null);

  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [payEdit, setPayEdit] = useState<AdminUser | null>(null);

  // New staff form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Tutor' as StaffRole,
    pay: { ...emptyPaySetup } as PaySetupState,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
  });

  const filteredStaff = (admins || []).filter((s) => {
    const matchesRole = selectedRoleFilter === 'All' || s.role === selectedRoleFilter;
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.role.toLowerCase().includes(search.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    setIsInviting(true);
    const cleanEmail = formData.email.trim().toLowerCase();

    try {
      // The server generates the temporary password and emails it; nobody
      // here sees or stores a password.
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          centreId: activeCentreId,
          name: formData.name,
          email: cleanEmail,
          phone: formData.phone,
          role: formData.role,
          payFrequency: formData.pay.frequency,
          payDay: formData.pay.day,
          ratePerPeriod: formData.pay.ratePerPeriod,
          payAmount: formData.pay.payAmount,
          bankName: formData.bankName,
          bankAccountName: formData.bankAccountName,
          bankAccountNumber: formData.bankAccountNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not send the invitation.');

      setShowAddModal(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: 'Tutor',
        pay: { ...emptyPaySetup } as PaySetupState,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
      });
      addToast({
        type: 'success',
        title: 'Invite Sent',
        description: `${formData.name} will receive their login details by email.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Invitation Failed',
        description: err?.message || 'Could not send the invitation.',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleToggleStatus = (staffId: string) => {
    toggleAdminSuspend(staffId);
  };

  return (
    <div id="staff-roles-management-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Staff & Roles
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
              Role-Based Access
            </span>
          </div>
          <p className="text-sm sm:text-[15px] font-bold text-slate-900 mt-1">
            Configure staff members and permissions across Tutor, Manager, Secretary, and Super Admin roles.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowRolesModal(true)}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all flex items-center justify-center space-x-2 shrink-0"
          >
            <Shield className="w-4 h-4 text-orange-500" />
            <span>Roles & Powers</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Staff Directory Table & Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Role Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedRoleFilter('All')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                selectedRoleFilter === 'All'
                  ? 'bg-orange-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Staff ({(admins || []).length})
            </button>
            {(['Super Admin', 'Facility Admin', 'Admin Secretary', 'Finance Admin', 'Tutor'] as StaffRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRoleFilter(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  selectedRoleFilter === r
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff by name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Designated Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                    No staff records match criteria.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                          {staff.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{staff.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{staff.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getRoleInfo(staff.role).badgeColor}`}
                      >
                        {staff.role}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          staff.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : staff.status === 'Invited'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {staff.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setViewingStaff(staff)}
                        className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-base text-slate-900">Add Staff Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Babatunde Lawal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="staff@yourfacility.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+234 800 000 0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Designated Role *
                  </label>
                  <ModernSelect
                    label="Designated Role *"
                    value={formData.role}
                    onChange={(val) => setFormData({ ...formData, role: val as StaffRole })}
                    options={[
                      { value: 'Tutor', label: 'Tutor' },
                      { value: 'Facility Admin', label: 'Facility Admin' },
                      { value: 'Admin Secretary', label: 'Admin Secretary' },
                      { value: 'Finance Admin', label: 'Finance Admin' },
                      { value: 'Super Admin', label: 'Super Admin' },
                    ]}
                  />
                </div>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <p className="font-bold text-slate-800 mb-2">Pay Setup</p>
                <PaySetupFields
                  pay={formData.pay}
                  setPay={(p) => setFormData({ ...formData, pay: p })}
                  showRatePerClass={formData.role === 'Tutor'}
                />
              </div>

              <div className="pt-1 border-t border-slate-100">
                <p className="font-bold text-slate-800 mb-1">Bank Account Details</p>
                <p className="text-[10px] text-slate-400 mb-2">Where their pay goes when you transfer it.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                    <input type="text" placeholder="e.g. GTBank" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Name</label>
                      <input type="text" placeholder="e.g. John Okafor" value={formData.bankAccountName} onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Number</label>
                      <input type="text" inputMode="numeric" placeholder="e.g. 0123456789" value={formData.bankAccountNumber} onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Explicit Mandatory Message Required by User */}
              <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-[11px] text-orange-900 space-y-1">
                <p className="font-bold flex items-center space-x-1 text-orange-600">
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>Onboarding & Password Provisioning:</span>
                </p>
                <p className="leading-relaxed">
                  "The administrator receives their login email and a temporary password by email, and will be asked to set a new password the first time they sign in."
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isInviting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Invite Staff Member</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Details Modal */}
      {viewingStaff && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Staff Credentials & Role</h3>
              <button
                onClick={() => setViewingStaff(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 font-black text-base flex items-center justify-center">
                  {viewingStaff.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{viewingStaff.name}</h4>
                  <p className="text-slate-500 font-mono text-[11px]">{viewingStaff.email}</p>
                  <span
                    className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getRoleInfo(viewingStaff.role).badgeColor}`}
                  >
                    {viewingStaff.role}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-medium text-slate-800">{viewingStaff.phone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Department:</span>
                  <span className="font-medium text-slate-800">{viewingStaff.department}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-slate-800">{viewingStaff.status}</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="min-w-0">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Pay</span>
                  <p className="font-semibold text-slate-800 truncate">{formatPayInfo(viewingStaff, viewingStaff.role === 'Tutor')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPayEdit(viewingStaff)}
                  className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-wider inline-flex items-center space-x-1.5 shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit Details</span>
                </button>
              </div>

              <div>
                <p className="font-bold text-slate-800 mb-1">Granted Role Permissions:</p>
                <ul className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {getRoleInfo(viewingStaff.role).permissions.map((perm, i) => (
                    <li key={i} className="flex items-center space-x-1.5 text-slate-700 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{perm}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-6 border-t border-slate-100 gap-4">
                <button
                  onClick={() => setViewingStaff(null)}
                  className="px-6 py-2.5 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-[10px] uppercase tracking-widest order-last sm:order-first"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      toggleAdminSuspend(viewingStaff.id);
                      setViewingStaff(prev => prev ? { ...prev, status: prev.status === 'Suspended' ? 'Active' : 'Suspended' } : null);
                    }}
                    className={`px-4 py-2.5 font-bold rounded-xl transition-all flex items-center space-x-2 text-[10px] uppercase tracking-widest border ${
                      viewingStaff.status === 'Suspended'
                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                        : 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200'
                    }`}
                  >
                    {viewingStaff.status === 'Suspended' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                    <span>{viewingStaff.status === 'Suspended' ? 'Activate' : 'Suspend'}</span>
                  </button>
                  
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2.5 font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center space-x-2 text-[10px] uppercase tracking-widest"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          if (viewingStaff) {
            await deleteAdmin(viewingStaff.id);
            setViewingStaff(null);
            setShowDeleteConfirm(false);
          }
        }}
        title="Remove Staff?"
        message={`Are you sure you want to remove ${viewingStaff?.name} from the system? This action is irreversible.`}
        confirmText="Remove Permanently"
        type="danger"
      />

            {payEdit && (
        <EditStaffDetailsModal
          staffDoc={payEdit}
          collection={payEdit.role === 'Tutor' ? 'tutors' : 'admins'}
          centreId={activeCentreId || ''}
          isTutor={payEdit.role === 'Tutor'}
          onClose={() => setPayEdit(null)}
        />
      )}

{/* Roles & Powers Modal */}
      {showRolesModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Roles & Access Privileges</h3>
                  <p className="text-[13px] text-slate-700">Overview of what each administrative level can see and do</p>
                </div>
              </div>
              <button
                onClick={() => setShowRolesModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {(['Super Admin', 'Facility Admin', 'Admin Secretary', 'Finance Admin', 'Tutor'] as StaffRole[]).map((role) => {
                const info = ROLE_PERMISSIONS[role];
                return (
                  <div key={role} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${info.badgeColor}`}>
                        {role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {info.description}
                    </p>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permissions</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {info.permissions.map((perm, idx) => (
                          <div key={idx} className="flex items-center space-x-2 text-[11px] text-slate-700 font-semibold">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{perm}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-slate-100">
              <button
                onClick={() => setShowRolesModal(false)}
                className="px-6 py-2.5 font-bold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-xl shadow-sm transition-all"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
