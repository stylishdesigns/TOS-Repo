import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Student } from '../../types';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Users,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  GraduationCap,
  Percent,
  CreditCard,
  Building2,
  Calendar,
  Phone,
  Mail,
  UserCheck,
  Eye,
  UserX,
  ShieldAlert,
} from 'lucide-react';
import { SeatsManagementPanel } from './SeatsManagementPanel';

export const StudentsList: React.FC = () => {
  const { settings, students, programmes, branches, addStudent, toggleStudentSuspend, setSelectedStudent, addToast } = useApp();

  const [activeViewTab, setActiveViewTab] = useState<'directory' | 'seats'>('directory');
  const [programmeFilter, setProgrammeFilter] = useState('All Programmes');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(7);
  const [showAddModal, setShowAddModal] = useState(false);


  // Form states for new student
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    gender: 'Male' as 'Male' | 'Female',
    dateOfBirth: '2008-05-14',
    department: 'Science' as 'Science' | 'Commercial' | 'Arts',
    parentName: '',
    parentWhatsApp: '',
    parentEmail: '',
    address: 'Lagos, Nigeria',
    programmeId: programmes[0]?.id || '',
    branchId: branches[0]?.id || 'branch-1',
    subjectsString: 'English, Mathematics, Physics, Chemistry',
    notes: '',
  });

  const filteredStudents = (students || []).filter((s) => {
    const matchesProgramme = programmeFilter === 'All Programmes' || s.programmeName === programmeFilter;
    const matchesStatus = statusFilter === 'All Status' || s.status === statusFilter;
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase());
    return matchesProgramme && matchesStatus && matchesSearch;
  });

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const prog = programmes.find((p) => p.id === formData.programmeId) || programmes[0];
    const branch = branches.find((b) => b.id === formData.branchId) || branches[0];
    const subjects = formData.subjectsString.split(',').map((s) => s.trim()).filter(Boolean);

    addStudent({
      ...formData,
      department: formData.department,
      programmeName: prog?.name || 'JAMB Intensive',
      branchName: branch?.name || 'Main Tutorial Centre',
      subjects: subjects.length > 0 ? subjects : (prog?.subjects || []),
      attendancePercent: 100,
      totalFee: prog?.fee || 50000,
      amountPaid: 0,
      outstandingBalance: prog?.fee || 50000,
      paymentStatus: 'Pending',
      status: 'Active',
      parentWhatsApp: formData.parentWhatsApp,
    });

    setShowAddModal(false);
    setFormData({
      name: '',
      phone: '',
      email: '',
      gender: 'Male',
      dateOfBirth: '2008-05-14',
      department: 'Science',
      parentName: '',
      parentWhatsApp: '',
      parentEmail: '',
      address: 'Lagos, Nigeria',
      programmeId: programmes[0]?.id || '',
      branchId: branches[0]?.id || 'branch-1',
      subjectsString: 'English, Mathematics, Physics, Chemistry',
      notes: '',
    });

    addToast({
      type: 'success',
      title: 'Student Enrolled',
      description: `${formData.name} successfully registered.`,
    });
  };

  return (
    <div id="students-management-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Students</h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete student directory with parent contacts, assigned cohort, attendance and fee balances.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden md:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-none">Academic Session</span>
            <span className="text-sm font-black text-[#EA580C]">{settings.academicSession}</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Enroll New Student</span>
          </button>
        </div>
      </div>

      {/* Sub-header View Switcher: Directory vs Seats Panel (Part D) */}
      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveViewTab('directory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeViewTab === 'directory'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Students Directory
        </button>
        <button
          type="button"
          onClick={() => setActiveViewTab('seats')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeViewTab === 'seats'
              ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Seats & Access Limits</span>
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        </button>
      </div>

      {activeViewTab === 'seats' ? (
        <SeatsManagementPanel students={students || []} />
      ) : (
        <>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <Users className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-slate-600">Total Enrolled</span>
          </div>
          <p className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2">
            {(students || []).length}
          </p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-emerald-600">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-emerald-600">Fees Cleared</span>
          </div>
          <p className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2">
            {(students || []).filter((s) => s.outstandingBalance === 0).length}
          </p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Percent className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-indigo-600">Avg Attendance</span>
          </div>
          <p className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2">
            88.4%
          </p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-amber-600">
            <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-amber-600">Fee Balance</span>
          </div>
          <p className="text-base sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2 truncate">
            ₦{(students || []).reduce((sum, s) => sum + (s.outstandingBalance || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        {/* Search: on mobile appears above the filters */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto sm:order-2">
          <div className="relative flex items-center bg-slate-50/80 border border-slate-200 rounded-lg px-2.5 py-2 flex-1 sm:w-64 focus-within:bg-white focus-within:border-orange-500 transition-all shadow-2xs">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search student..." 
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Dropdown Filters: All Programmes and All Status placed SIDE BY SIDE on mobile */}
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5 sm:order-1">
          {/* Programme filter */}
          <ModernSelect
            value={programmeFilter}
            onChange={(val) => {
              setProgrammeFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'All Programmes', label: 'All Programmes' },
              ...programmes.map(p => ({ value: p.name, label: p.name }))
            ]}
            className="w-full sm:w-48"
          />

          {/* Status filter */}
          <ModernSelect
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'All Status', label: 'All Status' },
              { value: 'Active', label: 'Active' },
              { value: 'Suspended', label: 'Suspended' },
              { value: 'Idle', label: 'Idle' },
              { value: 'Graduated', label: 'Graduated' }
            ]}
            className="w-full sm:w-40"
          />
        </div>
      </div>

      {/* Students Data Table (matches video 00:23 - 00:26) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-5">Student</th>
                <th className="py-3 px-5">Programme</th>
                <th className="py-3 px-5">Department</th>
                <th className="py-3 px-5">Fee Balance</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedStudents.map((st) => {
                const initials = st.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <tr
                    key={st.id}
                    onClick={() => setSelectedStudent(st)}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    {/* Student Info */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#EA580C] font-bold text-xs flex items-center justify-center shrink-0 border border-orange-200/60">
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{st.name}</p>
                        </div>
                      </div>
                    </td>

                    {/* Programme */}
                    <td className="py-3.5 px-5 font-medium text-slate-700">
                      {st.programmeName}
                    </td>

                    {/* Department (replaces Attendance) */}
                    <td className="py-3.5 px-5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          st.department === 'Commercial'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : st.department === 'Arts'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {st.department || 'Science'}
                      </span>
                    </td>

                    {/* Fee Status */}
                    <td className="py-3.5 px-5">
                      {(st.outstandingBalance || 0) === 0 ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                          <span>Paid Full</span>
                        </span>
                      ) : (
                        <div>
                          <span className="text-amber-700 font-bold">
                            ₦{(st.outstandingBalance || 0).toLocaleString()}
                          </span>
                          <span className="text-slate-400 text-[10px] block">
                            of ₦{(st.totalFee || 0).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      {st.status === 'Active' ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Active</span>
                        </span>
                      ) : st.status === 'Suspended' ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span>Suspended</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>{st.status || 'Idle'}</span>
                        </span>
                      )}
                    </td>

                    {/* Action Column with View Details and Suspend Button */}
                    <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(st)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center space-x-1"
                          title="View student profile details"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>View Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleStudentSuspend(st.id)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors inline-flex items-center space-x-1 ${
                            st.status === 'Suspended'
                              ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                              : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                          }`}
                          title={st.status === 'Suspended' ? 'Reactivate student' : 'Suspend student'}
                        >
                          <UserX className="w-3 h-3" />
                          <span>{st.status === 'Suspended' ? 'Reactivate' : 'Suspend'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Page {currentPage} of {totalPages} ({filteredStudents.length} total students)
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                  currentPage === page
                    ? 'bg-[#EA580C] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-1.5">
            <ModernSelect
              value={itemsPerPage}
              onChange={(val) => {
                setItemsPerPage(Number(val));
                setCurrentPage(1);
              }}
              options={[
                { value: 7, label: '7 / page' },
                { value: 15, label: '15 / page' },
                { value: 25, label: '25 / page' },
                { value: 50, label: '50 / page' }
              ]}
              className="w-24"
            />
          </div>
        </div>
      </div>
      </>
      )}

      {/* Modal: Enroll New Student */}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Enroll Student</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Oluwaseun Adeleke"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="0803 000 1122"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="student@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <ModernSelect
                label="Target Exam Programme *"
                value={formData.programmeId}
                onChange={(val) => setFormData({ ...formData, programmeId: val })}
                options={programmes.map(p => ({
                  value: p.id,
                  label: `${p.name} (₦${(p.fee || 0).toLocaleString()})`
                }))}
              />

              <ModernSelect
                label="Department *"
                value={formData.department}
                onChange={(val) => setFormData({ ...formData, department: val })}
                options={[
                  { value: 'Science', label: 'Science' },
                  { value: 'Commercial', label: 'Commercial' },
                  { value: 'Arts', label: 'Arts' }
                ]}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parent / Guardian Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Mr. Adeleke"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parent WhatsApp Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="0802 345 6789"
                    value={formData.parentWhatsApp}
                    onChange={(e) => setFormData({ ...formData, parentWhatsApp: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <ModernSelect
                label="Preferred Campus / Branch *"
                value={formData.branchId}
                onChange={(val) => setFormData({ ...formData, branchId: val })}
                options={branches.map(b => ({
                  value: b.id,
                  label: `${b.name} (${b.city})`
                }))}
              />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exam Subjects (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. English, Mathematics, Physics, Chemistry"
                  value={formData.subjectsString}
                  onChange={(e) => setFormData({ ...formData, subjectsString: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Additional Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional information..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
                >
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
