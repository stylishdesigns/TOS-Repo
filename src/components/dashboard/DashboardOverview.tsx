import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  GraduationCap,
  Users,
  CreditCard,
  AlertCircle,
  BookOpen,
  Calendar,
  Check,
  X,
  UserCheck,
  ChevronDown,
  Shield,
  Globe,
  CalendarDays,
  Trophy,
  Inbox,
} from 'lucide-react';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DashboardOverview: React.FC = () => {
  const {
    settings,
    students,
    admissions,
    programmes,
    activities,
    payments,
    timetable,
    results,
    attendanceLogs,
    activeUser,
    viewMode,
    setViewMode,
    setAdminSection,
    addToast,
    approveAdmission,
    rejectAdmission,
    seatsSummary,
    centreName,
  } = useApp();

  const [showRoleDropdown, setShowRoleDropdown] = React.useState(false);

  const pendingAdmissions = admissions.filter((a) => a.status === 'Pending');
  const activeStudents = students.filter((s) => s.status === 'Active');

  // Only confirmed money counts as revenue; pending or rejected claims do not.
  const totalRevenue = payments
    .filter((p) => p.status === 'Paid' || p.status === 'Partial')
    .reduce((sum, p) => sum + p.amountPaid, 0);
  const totalOutstanding = students.reduce((sum, s) => sum + s.outstandingBalance, 0);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Live "today" for the facility's own clock.
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayName = WEEKDAYS[now.getDay()];

  // Today's timetable: match the slot's exact date, fall back to its weekday.
  const dateSlots = timetable.filter((t) => t.date === todayISO && t.status !== 'cancelled');
  const todaySlots = (dateSlots.length > 0
    ? dateSlots
    : timetable.filter((t) => !t.date && t.day === todayName && t.status !== 'cancelled')
  )
    .slice()
    .sort((a, b) => (a.startTime || a.time).localeCompare(b.startTime || b.time));

  // Today's attendance from the facility's own clock-in logs.
  const todayLogs = attendanceLogs.filter((l) => l.date === todayISO);
  const attendedToday = todayLogs.filter((l) => l.status === 'Present' || l.status === 'Late').length;
  const attendancePct = todayLogs.length > 0 ? Math.round((attendedToday / todayLogs.length) * 100) : null;

  // Top performers straight from recorded results, best average first.
  const topPerformers = results
    .slice()
    .sort((a, b) => b.averagePercent - a.averagePercent)
    .slice(0, 4);
  const maxScoreOf = (r: typeof results[number]) =>
    r.scores && r.scores.length > 0 ? r.scores.reduce((s, x) => s + (x.maxScore || 0), 0) : 0;

  // Real programme fill rates, most filled first.
  const programmeCapacity = programmes
    .filter((p) => p.maxStudents > 0 && p.status !== 'Archived')
    .slice()
    .sort((a, b) => b.enrolledStudents / b.maxStudents - a.enrolledStudents / a.maxStudents)
    .slice(0, 4);

  const money = (n: number) =>
    '₦' + Math.round(n).toLocaleString('en-NG');

  return (
    <div id="dashboard-overview-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. Greeting card */}
      <div
        id="admin-greeting-card"
        className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/90 shadow-sm relative overflow-hidden transition-all hover:shadow-md"
      >
        <div className="absolute top-6 right-6 text-right hidden sm:block">
          <span className="text-sm font-black text-[#EA580C]">{settings.academicSession}</span>
        </div>

        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-orange-50/80 via-amber-50/30 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#EA580C]" />

        <div className="relative z-10">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-[#EA580C] border border-orange-200/80">
                <Shield className="w-3.5 h-3.5" />
                <span>{centreName} Admin Hub</span>
              </span>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold">{settings.academicSession} • Term Active</span>
              </span>
              <span className="text-xs font-semibold text-slate-600 hidden sm:inline-flex items-center space-x-1.5 bg-slate-100/90 px-3 py-1 rounded-full border border-slate-200/60">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  {now.toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
                  <span>{getGreeting()}, {activeUser?.name || 'Administrator'}</span>
                  <span className="text-2xl">👋</span>
                </h1>
                <p className="text-xs font-bold text-[#EA580C] uppercase tracking-[0.15em] mt-1.5 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </p>
                <p className="text-sm font-medium text-slate-600 mt-2 leading-relaxed">
                  A live snapshot of students, tutors, classes and money in {centreName}.
                </p>

              {/* Switch workspace */}
              <div className="relative shrink-0">
                <button
                  id="dashboard-switch-roles-btn"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-orange-400 rounded-xl shadow-xs transition-all flex items-center space-x-2"
                >
                  <UserCheck className="w-4 h-4 text-[#EA580C]" />
                  <span>Switch Workspace</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showRoleDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1">
                      Select Workspace
                    </p>
                    <button
                      onClick={() => {
                        setViewMode('portal');
                        setShowRoleDropdown(false);
                        addToast({
                          type: 'info',
                          title: 'Admin Workspace',
                          description: 'Active in the admin hub.',
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-orange-50 text-xs font-semibold text-slate-800 flex items-center space-x-2 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-[#EA580C]" />
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">Admin Workspace</p>
                        <p className="text-[10px] text-slate-400">Full operations access</p>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('app');
                        setShowRoleDropdown(false);
                        addToast({
                          type: 'info',
                          title: 'Public Website',
                          description: 'Viewing public applicant portal.',
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-orange-50 text-xs font-semibold text-slate-800 flex items-center space-x-2 transition-colors"
                    >
                      <Globe className="w-4 h-4 text-purple-600" />
                      <div>
                        <p className="font-bold text-slate-900">Public Website</p>
                        <p className="text-[10px] text-slate-400">Online registration landing</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards Row, every figure live from facility data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <div
          onClick={() => setAdminSection('students')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-slate-700">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-bold text-slate-700">Total Students</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {students.length.toLocaleString()}
          </div>
          {activeStudents.length !== students.length && (
            <p className="text-[11px] font-semibold text-slate-400 mt-1">{activeStudents.length} active</p>
          )}
        </div>

        <div
          onClick={() => setAdminSection('programmes')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-[#EA580C]">
            <BookOpen className="w-5 h-5 text-[#EA580C]" />
            <span className="text-sm font-bold text-[#EA580C]">Exam Programs</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {programmes.length}
          </div>
        </div>

        <div
          onClick={() => setAdminSection('payments')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-emerald-700">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">Revenue Collected</span>
          </div>
          <div className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {money(totalRevenue)}
          </div>
        </div>

        <div
          onClick={() => setAdminSection('payments')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-amber-700">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-bold text-amber-700">Outstanding Fees</span>
          </div>
          <div className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {money(totalOutstanding)}
          </div>
        </div>
      </div>

      {/* 4 Secondary Quick Stats Pill Row, all live */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Active Programmes</p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">
              {programmes.filter((p) => p.status === 'Active').length}
            </p>
          </div>
          <BookOpen className="w-5 h-5 text-slate-500" />
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Today's Classes</p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">{todaySlots.length}</p>
          </div>
          <CalendarDays className="w-5 h-5 text-slate-500" />
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Today's Attendance</p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">
              {attendancePct === null ? '—' : `${attendancePct}%`}
            </p>
          </div>
          <Users className="w-5 h-5 text-slate-500" />
        </div>
        {/* Student Seats Live Metric (Part D) */}
        <div
          onClick={() => setAdminSection('students')}
          className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between cursor-pointer hover:border-orange-400 transition-all"
        >
          <div>
            <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <span>Student Seats</span>
              {seatsSummary?.isTrial && (
                <span className="text-[10px] text-amber-600 font-semibold px-1.5 py-0.2 bg-amber-50 rounded">Trial</span>
              )}
            </p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">
              {seatsSummary ? `${seatsSummary.used} / ${seatsSummary.cap}` : students.length}
            </p>
          </div>
          <Users className="w-5 h-5 text-orange-500" />
        </div>
      </div>

      {/* Middle Row: Today's Scheduled Classes (left) & Recent Activities (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Today's Scheduled Classes Panel */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">Today's Classes</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-[#EA580C] rounded-md">
                  {todayName}
                </span>
              </div>
              <button
                onClick={() => setAdminSection('timetable')}
                className="text-xs font-semibold text-[#EA580C] hover:underline"
              >
                Open Timetable →
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {todaySlots.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                  <CalendarDays className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500 mt-2">No classes scheduled for today</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Slots added to the timetable will appear here.</p>
                </div>
              ) : (
                todaySlots.slice(0, 5).map((slot) => (
                  <div
                    key={slot.id}
                    className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-mono text-[10px] font-bold shrink-0">
                        <span>{(slot.startTime || slot.time.split(' - ')[0] || '').trim()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs md:text-sm font-bold text-slate-900 truncate">
                          {slot.subject}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {slot.tutorName}{slot.room ? ` • ${slot.room}` : ''}
                        </p>
                      </div>
                    </div>
                    {slot.programmeName && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 shrink-0 truncate max-w-[90px]">
                        {slot.programmeName.split(' ')[0]}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Live from the facility timetable</span>
            <span className="font-semibold text-slate-600">
              {todaySlots.length > 5 ? `+${todaySlots.length - 5} more` : 'On-track'}
            </span>
          </div>
        </div>

        {/* Right: Recent Activities Panel */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Recent Facility Activities</h3>
              <button
                onClick={() => setAdminSection('payments')}
                className="text-xs font-semibold text-[#EA580C] hover:underline"
              >
                View Financial Logs
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activities.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                  <Inbox className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500 mt-2">No activity recorded yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Approvals, payments and updates will show here.</p>
                </div>
              ) : (
                activities.slice(0, 5).map((act) => {
                  const isRejected = act.title.toLowerCase().includes('reject') || act.title.toLowerCase().includes('suspend');
                  return (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-lg hover:bg-slate-50 transition-colors flex items-start space-x-3"
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs mt-0.5 ${
                          isRejected
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {isRejected ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-900 leading-snug truncate">
                          {act.title}
                        </p>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400">{act.subtitle || 'Facility record'}</span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-[10px] text-slate-400">{act.timeAgo || 'Just now'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-right">
            <span className="text-[11px] text-slate-400">Showing last 5 activity logs</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Performers (left) & Programme Capacities (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Top Performers from recorded results */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Top Academic Performers</h3>
            <button
              onClick={() => setAdminSection('results')}
              className="text-xs font-semibold text-[#EA580C] hover:underline"
            >
              Results & Mocks
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {topPerformers.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                <Trophy className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-500 mt-2">No results recorded yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Top scorers appear once results are uploaded.</p>
              </div>
            ) : (
              topPerformers.map((r, idx) => {
                const maxTotal = maxScoreOf(r);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#EA580C] font-extrabold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {r.studentName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {r.examTitle || r.programmeName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      <div className="w-20 md:w-28 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-[#EA580C] rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.averagePercent))}%` }} />
                      </div>
                      <span className="text-xs font-extrabold text-slate-900">
                        {maxTotal > 0 ? `${r.totalScore}/${maxTotal}` : `${r.averagePercent}%`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Programme fill rates from live enrolment */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Programme Capacities</h3>
            <button
              onClick={() => setAdminSection('programmes')}
              className="text-xs font-semibold text-[#EA580C] hover:underline"
            >
              All Programmes
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {programmeCapacity.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                <BookOpen className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-500 mt-2">No programmes with a capacity set</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Add a capacity on a programme to see its fill rate.</p>
              </div>
            ) : (
              programmeCapacity.map((p) => {
                const pct = Math.max(0, Math.min(100, Math.round((p.enrolledStudents / p.maxStudents) * 100)));
                const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-emerald-500' : 'bg-amber-500';
                const chip =
                  pct >= 90
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : pct >= 70
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
                return (
                  <div key={p.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-slate-700 font-medium truncate">{p.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${chip}`}>
                        {p.enrolledStudents} / {p.maxStudents} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
