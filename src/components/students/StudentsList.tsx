import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { resolveStudentFee } from '../../lib/fees';
import { Student } from '../../types';
import { ModernSelect } from '../ui/ModernSelect';
import { COURSES, NIGERIAN_STATES, UNIVERSITIES } from '../../data/academicLists';
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
} from 'lucide-react';
import { SeatsManagementPanel } from './SeatsManagementPanel';
import { SeatPaymentsHistoryPanel } from './SeatPaymentsHistoryPanel';

export const StudentsList: React.FC = () => {
  const { students, programmes, branches, subjects, addStudent, seatsSummary, refreshSeatsSummary, activeCentreId, setSelectedStudent, addToast } = useApp();


  const [activeViewTab, setActiveViewTab] = useState<'directory' | 'seats' | 'payments'>('directory');
  const [programmeFilter, setProgrammeFilter] = useState('All Programmes');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(7);
  const [showAddModal, setShowAddModal] = useState(false);


  // Form states for new student. The fields mirror the facility's public
  // sign-up form one for one, so an admin-enrolled record carries exactly
  // what a self-enrolled record carries (same field names, same rules).
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    dob: '',
    gender: 'Male' as 'Male' | 'Female',
    state: '',
    phone: '',
    email: '',
    address: '',
    parentName: '',
    parentWhatsApp: '',
    programmeId: programmes[0]?.id || '',
    branchId: branches[0]?.id || 'branch-1',
    department: 'Science' as 'Science' | 'Commercial' | 'Arts',
    subjects: [] as string[],
    courseOfStudy: '',
    universityChoice: '',
  });

  // Username mirrors the sign-up form: suggested from the student's name,
  // editable, and checked live against the same availability endpoint.
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const suggestUsername = (first: string, last: string) =>
    `${first}${last}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
  useEffect(() => {
    const u = formData.username.trim().toLowerCase();
    if (u.length < 3) { setUsernameStatus('idle'); return; }
    let dead = false;
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/username-check?u=${encodeURIComponent(u)}`);
        const d = await r.json().catch(() => ({}));
        if (!dead) setUsernameStatus(d && d.available === false ? 'taken' : 'ok');
      } catch { if (!dead) setUsernameStatus('idle'); }
    }, 500);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.username]);

  // The access switch reflects the live seat pool, so refresh it on entry.
  useEffect(() => {
    refreshSeatsSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCentreId]);

  const filteredStudents = (students || []).filter((s) => {
    const matchesProgramme = programmeFilter === 'All Programmes' || s.programmeName === programmeFilter;
    const matchesStatus = statusFilter === 'All Status' || s.status === statusFilter;
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase());
    return matchesProgramme && matchesStatus && matchesSearch;
  });

  const avgAttendance = (students || []).length
    ? Math.round((students || []).reduce((sum, s) => sum + (s.attendancePercent || 0), 0) / (students || []).length)
    : 0;
  // The subject list mirrors the sign-up form: only the facility's own
  // registered subjects, filtered to the chosen department (General subjects
  // always show). Falls back to programme subjects when none are recorded.
  const subjectsFor = (dept: string) =>
    (subjects || [])
      .filter((s: any) => s?.department === 'General' || (!!dept && s?.department === dept))
      .map((s: any) => String(s?.name || ''))
      .filter(Boolean)
      .sort();
  const selectableSubjects = subjectsFor(formData.department);
  const subjectOptions = selectableSubjects.length > 0
    ? selectableSubjects
    : Array.from(new Set((programmes || []).flatMap((p: any) => p.subjects || []).map(String))).sort();
  const toggleSubject = (sub: string) =>
    setFormData((f) => ({
      ...f,
      subjects: f.subjects.includes(sub) ? f.subjects.filter((x) => x !== sub) : [...f.subjects, sub],
    }));
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Access state comes from the live seat pool when it is loaded; the legacy
  // student status is the fallback.
  const isAccessOn = (st: Student) => {
    const accessUid = st.uid || st.id;
    const accessData = seatsSummary?.studentAccess?.[accessUid];
    return accessData ? accessData.status === 'active' : st.status !== 'Suspended';
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fail = (description: string) => addToast({ type: 'error', title: 'Missing details', description });
    if (!formData.firstName.trim() || !formData.lastName.trim()) { fail("Enter the student's first and last name."); return; }
    if (usernameStatus === 'taken') { fail('That username is already taken. Choose another one.'); return; }
    if (usernameStatus === 'checking') { fail('Still checking that username. Try again in a second.'); return; }
    if (!formData.dob) { fail("Enter the student's date of birth."); return; }
    if (!formData.state) { fail("Choose the student's state."); return; }
    if (formData.phone.replace(/\D/g, '').length !== 11) { fail('The phone number must be exactly 11 digits.'); return; }
    if (!formData.parentName.trim()) { fail('Enter the parent or guardian name.'); return; }
    if (formData.parentWhatsApp.replace(/\D/g, '').length !== 11) { fail("The parent's WhatsApp number must be exactly 11 digits."); return; }
    if (!formData.programmeId) { fail('Choose the exam programme.'); return; }
    if (formData.subjects.length === 0) { fail('Pick at least one subject to register.'); return; }
    if (!formData.courseOfStudy) { fail('Choose the intended course.'); return; }

    const prog = programmes.find((p) => p.id === formData.programmeId) || programmes[0];
    const branch = branches.find((b) => b.id === formData.branchId) || branches[0];

    // Same field names the sign-up flow's saveRecord writes, so the two
    // enrollment paths produce identical records in the students collection.
    addStudent({
      ...formData,
      name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(),
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      username: formData.username.trim().toLowerCase(),
      dob: formData.dob,
      state: formData.state,
      email: formData.email.trim(),
      parentEmail: formData.email.trim(),
      programmeName: prog?.name || 'JAMB Intensive',
      examToRegister: prog?.name || '',
      branchName: branch?.name || 'Main Campus',
      studentId: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
      emailVerified: false,
      avatar: '',
      attendancePercent: 0,
      totalFee: prog?.fee || 50000,
      amountPaid: 0,
      outstandingBalance: prog?.fee || 50000,
      paymentStatus: 'Pending',
      status: 'Active',
    });

    setShowAddModal(false);
    setFormData({
      firstName: '',
      lastName: '',
      username: '',
      dob: '',
      gender: 'Male',
      state: '',
      phone: '',
      email: '',
      address: '',
      parentName: '',
      parentWhatsApp: '',
      programmeId: programmes[0]?.id || '',
      branchId: branches[0]?.id || 'branch-1',
      department: 'Science',
      subjects: [] as string[],
      courseOfStudy: '',
      universityChoice: '',
    });
    setUsernameTouched(false);
    setUsernameStatus('idle');

    addToast({
      type: 'success',
      title: 'Student Enrolled',
      description: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim() + ' successfully registered.',
    });
  };

  return (
    <div id="students-management-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Students</h2>
          <p className="text-sm sm:text-[15px] font-bold text-slate-900 mt-1">
            Complete student directory with parent contacts, assigned cohort, attendance and fee balances.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-all flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Enroll New Student</span>
          </button>
        </div>
      </div>

      {/* Stat cards: enrollment, attendance and fees sit above the switcher and its filter */}
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
          <div className="flex items-center space-x-2 text-indigo-600">
            <Percent className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-indigo-600">Avg Attendance</span>
          </div>
          <p className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2">
            {avgAttendance}%
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
          <div className="flex items-center space-x-2 text-amber-600">
            <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-amber-600">Fee Balance</span>
          </div>
          <p className="text-base sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 sm:mt-2 truncate">
            ₦{(students || []).reduce((sum, s) => sum + (s.outstandingBalance || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>
      {/* Filter toolbar: shown above the switcher in the directory view */}
      {activeViewTab === 'directory' && (
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
              { value: 'Suspended', label: 'Inactive' },
              { value: 'Idle', label: 'Idle' },
              { value: 'Graduated', label: 'Graduated' }
            ]}
            className="w-full sm:w-40"
          />
        </div>
      </div>

      )}

      {/* Sub-header View Switcher: Directory vs Seats Panel vs Seat Payment
          History. The white thumb slides to the active side so it reads as a
          toggle at a glance. */}
      <div className="relative grid grid-cols-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-full" role="tablist">
        <span
          aria-hidden="true"
          className={`absolute top-1 bottom-1 left-1 w-[calc(33.333%-0.333rem)] rounded-xl bg-white dark:bg-slate-700 shadow-sm transition-transform duration-300 ease-out ${
            activeViewTab === 'seats'
              ? 'translate-x-full'
              : activeViewTab === 'payments'
                ? 'translate-x-[200%]'
                : 'translate-x-0'
          }`}
        />
        <button
          type="button"
          role="tab"
          aria-selected={activeViewTab === 'directory'}
          onClick={() => setActiveViewTab('directory')}
          className={`relative z-10 px-3 py-2.5 rounded-xl text-base sm:text-lg font-bold text-center transition-colors cursor-pointer ${
            activeViewTab === 'directory'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Students Directory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeViewTab === 'seats'}
          onClick={() => setActiveViewTab('seats')}
          className={`relative z-10 px-3 py-2.5 rounded-xl text-base sm:text-lg font-bold text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            activeViewTab === 'seats'
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Seats &amp; Access Limits</span>
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeViewTab === 'payments'}
          onClick={() => setActiveViewTab('payments')}
          className={`relative z-10 px-3 py-2.5 rounded-xl text-base sm:text-lg font-bold text-center transition-colors cursor-pointer ${
            activeViewTab === 'payments'
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Seat Payment History
        </button>
      </div>

      {activeViewTab === 'seats' ? (
        <SeatsManagementPanel students={students || []} />
      ) : activeViewTab === 'payments' ? (
        <SeatPaymentsHistoryPanel />
      ) : (
        <>
      {/* Students Data Table (matches video 00:23 - 00:26) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs">
        <div className="overflow-x-auto rounded-t-xl">
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
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center shrink-0 border border-orange-200/60">
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
                      {(() => {
                        const fee = resolveStudentFee(st, programmes);
                        const paid = st.paidAmount || 0;
                        const bal = st.outstandingBalance || 0;
                        if (fee <= 0) {
                          return (
                            <span className="inline-flex items-center space-x-1 text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                              <span>No fee set</span>
                            </span>
                          );
                        }
                        if (bal === 0) {
                          return (
                            <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                              <span>Paid Full</span>
                            </span>
                          );
                        }
                        return (
                          <div>
                            <span className="text-amber-700 font-bold">
                              ₦{bal.toLocaleString()}
                            </span>
                            <span className="text-slate-400 text-[10px] block">
                              {paid > 0
                                ? `paid ₦${paid.toLocaleString()} of ₦${fee.toLocaleString()}`
                                : `unpaid of ₦${fee.toLocaleString()}`}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      {/* Batch 30: the directory status is seat-based. A student
                          holding a seat reads Active; a student without one reads
                          Inactive, never "Suspended", which read as a punishment. */}
                      {!isAccessOn(st) ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>Inactive</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Active</span>
                        </span>
                      )}
                    </td>

                    {/* Action column: details only. The access switch lives on
                        the seat, in the Seats & Access Limits panel. */}
                    <td className="py-3.5 px-5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(st)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center space-x-1.5"
                          title="View student profile details"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>View Details</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls (outside the clipping wrappers so the dropdown shows fully) */}
        <div className="p-4 border-t border-slate-100 rounded-b-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
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
                    ? 'bg-orange-600 text-white shadow-xs'
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
              {/* Field-for-field match of the facility sign-up form, so the two
                  enrollment paths collect and save exactly the same details. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Oluwaseun"
                    value={formData.firstName}
                    onChange={(e) => { const v = e.target.value; setFormData((f) => ({ ...f, firstName: v, username: usernameTouched ? f.username : suggestUsername(v, f.lastName) })); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Adeleke"
                    value={formData.lastName}
                    onChange={(e) => { const v = e.target.value; setFormData((f) => ({ ...f, lastName: v, username: usernameTouched ? f.username : suggestUsername(f.firstName, v) })); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username * (their sign-in name, like the online form)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. oluwaseunadeleke"
                  value={formData.username}
                  onChange={(e) => { setUsernameTouched(true); setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
                {usernameStatus === 'checking' && <p className="text-[10px] text-slate-400 mt-1">Checking that username.</p>}
                {usernameStatus === 'ok' && <p className="text-[10px] text-emerald-600 font-semibold mt-1">That username is free.</p>}
                {usernameStatus === 'taken' && <p className="text-[10px] text-rose-600 font-semibold mt-1">That username is taken. Choose another.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender *</label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'Male' | 'Female' })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">State *</label>
                <select
                  required
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                >
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number (11 digits)</label>
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="08030001122"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  placeholder="Street, area, city"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

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
                  <label className="block font-semibold text-slate-700 mb-1">Parent WhatsApp (11 digits) *</label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    placeholder="08023456789"
                    value={formData.parentWhatsApp}
                    onChange={(e) => setFormData({ ...formData, parentWhatsApp: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <ModernSelect
                label="Target Exam Programme *"
                value={formData.programmeId}
                onChange={(val) => setFormData((f) => ({ ...f, programmeId: val }))}
                options={programmes.map(p => ({
                  value: p.id,
                  label: `${p.name} (\u20A6${(p.fee || 0).toLocaleString()})`
                }))}
              />

              <ModernSelect
                label="Department *"
                value={formData.department}
                onChange={(val) => setFormData((f) => ({ ...f, department: val as 'Science' | 'Commercial' | 'Arts', subjects: f.subjects.filter((sub) => subjectsFor(val).includes(sub)) }))}
                options={[
                  { value: 'Science', label: 'Science' },
                  { value: 'Commercial', label: 'Commercial' },
                  { value: 'Arts', label: 'Arts' }
                ]}
              />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subjects to Register *</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                  {subjectOptions.map((sub) => (
                    <label key={sub} className="flex items-center space-x-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.subjects.includes(sub)}
                        onChange={() => toggleSubject(sub)}
                        className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-xs text-slate-700 group-hover:text-slate-900">{sub}</span>
                    </label>
                  ))}
                  {subjectOptions.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic">No exam subjects registered yet. Add them in the Subjects section first.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ModernSelect
                  label="Intended Course *"
                  value={formData.courseOfStudy}
                  onChange={(val) => setFormData((f) => ({ ...f, courseOfStudy: val }))}
                  options={COURSES.map((c) => ({ value: c, label: c }))}
                />
                <ModernSelect
                  label="Target University (optional)"
                  value={formData.universityChoice}
                  onChange={(val) => setFormData((f) => ({ ...f, universityChoice: val }))}
                  options={[{ value: '', label: 'Not decided yet' }, ...UNIVERSITIES.map((u) => ({ value: u, label: u }))]}
                />
              </div>

              <ModernSelect
                label="Preferred Campus / Branch *"
                value={formData.branchId}
                onChange={(val) => setFormData((f) => ({ ...f, branchId: val }))}
                options={branches.map(b => ({
                  value: b.id,
                  label: `${b.name} (${b.city})`
                }))}
              />

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
                  className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
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
