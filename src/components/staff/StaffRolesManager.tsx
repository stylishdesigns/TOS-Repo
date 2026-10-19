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
} from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { ConfirmationModal } from '../common/ConfirmationModal';

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
      'System Settings & Centre Profile',
      'Approve Tutor Topics & Timetables',
    ],
  },
  'Center Admin': {
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Centre coordinator overseeing daily academic schedules, tutor topics, and student progress.',
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
      'Submit Subject Topics for Centre Consent',
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
      'Track Centre Expenses',
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
  const { addToast, admins, addAdmin, deleteAdmin, toggleAdminSuspend, activeUser } = useApp();

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingStaff, setViewingStaff] = useState<AdminUser | null>(null);

  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // New staff form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Tutor' as StaffRole,
    tempPassword: '',
  });

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + numbers + special;
    
    let pass = '';
    pass += upper.charAt(Math.floor(Math.random() * upper.length));
    pass += lower.charAt(Math.floor(Math.random() * lower.length));
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
    pass += special.charAt(Math.floor(Math.random() * special.length));
    
    for (let i = 0; i < 6; i++) {
      pass += all.charAt(Math.floor(Math.random() * all.length));
    }
    
    // Shuffle
    const shuffled = pass.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, tempPassword: shuffled }));
  };

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
    if (!formData.name || !formData.email || !formData.tempPassword) {
      if (!formData.tempPassword) {
        addToast({ type: 'error', title: 'Missing Password', description: 'Please generate a temporary password first.' });
      }
      return;
    }

    setIsInviting(true);
    const cleanEmail = formData.email.trim().toLowerCase();

    try {
      // Use AppContext's addAdmin for persistence
      await addAdmin({
        name: formData.name,
        email: cleanEmail,
        phone: formData.phone || '+234 800 000 0000',
        role: formData.role,
        status: 'Invited',
        department: 'General',
        jobTitle: formData.role,
        temporaryPassword: formData.tempPassword,
        hasChangedPassword: false,
      });

      setShowAddModal(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: 'Tutor',
        tempPassword: '',
      });
    } catch (err) {
      console.error(err);
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
          <p className="text-xs text-slate-500 mt-1">
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
            className="px-4 py-2.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 shrink-0"
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
                  ? 'bg-[#EA580C] text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Staff ({(admins || []).length})
            </button>
            {(['Super Admin', 'Center Admin', 'Admin Secretary', 'Finance Admin', 'Tutor'] as StaffRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRoleFilter(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  selectedRoleFilter === r
                    ? 'bg-[#EA580C] text-white shadow-2xs'
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
                <Briefcase className="w-5 h-5 text-[#EA580C]" />
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
                    placeholder="staff@excellencetutorials.ng"
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
                      { value: 'Center Admin', label: 'Center Admin' },
                      { value: 'Admin Secretary', label: 'Admin Secretary' },
                      { value: 'Finance Admin', label: 'Finance Admin' },
                      { value: 'Super Admin', label: 'Super Admin' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Temporary Password *</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={formData.tempPassword}
                    placeholder="Click generate"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center space-x-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              {/* Explicit Mandatory Message Required by User */}
              <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-[11px] text-orange-900 space-y-1">
                <p className="font-bold flex items-center space-x-1 text-[#EA580C]">
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
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
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
                <div className="w-12 h-12 rounded-full bg-orange-100 text-[#EA580C] font-black text-base flex items-center justify-center">
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
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Assigned Cohort:</span>
                  <span className="font-medium text-slate-800">
                    {viewingStaff.assignedCohort || 'All Campuses'}
                  </span>
                </div>
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

      {/* Roles & Powers Modal */}
      {showRolesModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-orange-50 text-[#EA580C] rounded-xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Roles & Access Privileges</h3>
                  <p className="text-xs text-slate-500">Overview of what each administrative level can see and do</p>
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
              {(['Super Admin', 'Center Admin', 'Admin Secretary', 'Finance Admin', 'Tutor'] as StaffRole[]).map((role) => {
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
                className="px-6 py-2.5 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm transition-all"
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
