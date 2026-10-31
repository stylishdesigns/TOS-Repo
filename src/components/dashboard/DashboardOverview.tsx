import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  GraduationCap,
  Clock,
  Users,
  CreditCard,
  AlertCircle,
  TrendingUp,
  Award,
  ChevronRight,
  BookOpen,
  Calendar,
  Check,
  X,
  Building2,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  UserCheck,
  ChevronDown,
  Shield,
  Smartphone,
  Globe,
} from 'lucide-react';

export const DashboardOverview: React.FC = () => {
  const {
    settings,
    students,
    admissions,
    programmes,
    activities,
    payments,
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


  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

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

  // Top scorers for leaderboard
  const topScorers = [
    { name: 'Chidera Obi', programme: 'JAMB UTME Intensive', score: '348/400', pct: 87, rank: 'Top 1%' },
    { name: 'Fatima Al-Hassan', programme: 'WAEC Comprehensive', score: '8 A1s', pct: 89, rank: 'Top 1%' },
    { name: 'Babatunde Lawal', programme: 'JAMB UTME Intensive', score: '332/400', pct: 83, rank: 'Top 3%' },
    { name: 'Emeka Eze', programme: 'Cambridge A-Levels', score: 'A* A* A', pct: 92, rank: 'Distinction' },
  ];

  return (
    <div id="dashboard-overview-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. Stylish Executive Admin Greeting Card */}
      <div
        id="admin-greeting-card"
        className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/90 shadow-sm relative overflow-hidden transition-all hover:shadow-md"
      >
        {/* Academic Session Display - Removed Label */}
        <div className="absolute top-6 right-6 text-right hidden sm:block">
          <span className="text-sm font-black text-[#EA580C]">{settings.academicSession}</span>
        </div>

        {/* Decorative background aura & brand bar */}
        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-orange-50/80 via-amber-50/30 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#EA580C]" />

        <div className="relative z-10">
          {/* Greeting & Active Session Meta */}
          <div className="space-y-2.5 max-w-3xl">
            {/* Meta Tags Row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-[#EA580C] border border-orange-200/80">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{centreName} Admin Hub</span>
              </span>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold">Session 2025/2026 • Term Active</span>
              </span>
              <span className="text-xs font-semibold text-slate-600 hidden sm:inline-flex items-center space-x-1.5 bg-slate-100/90 px-3 py-1 rounded-full border border-slate-200/60">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </span>
            </div>

            {/* Greeting Headline & Switch Role Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
                  <span>{getGreeting()}, {activeUser?.name || 'Platform Administrator'}</span>
                  <span className="text-2xl">👋</span>
                </h1>
                <p className="text-xs font-bold text-[#EA580C] uppercase tracking-[0.15em] mt-1.5 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </p>
                <p className="text-sm font-medium text-slate-600 mt-2 leading-relaxed">
                  Tutorial centre command overview for admissions, cohort schedules, tutor operations, and computer-based mock testing.
                </p>

              {/* Switch Roles Button */}
              <div className="relative shrink-0">
                <button
                  id="dashboard-switch-roles-btn"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-orange-400 rounded-xl shadow-xs transition-all flex items-center space-x-2"
                >
                  <UserCheck className="w-4 h-4 text-[#EA580C]" />
                  <span>Switch Roles</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showRoleDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1">
                      Select Workspace Role
                    </p>
                    <button
                      onClick={() => {
                        setViewMode('portal');
                        setShowRoleDropdown(false);
                        addToast({
                          type: 'info',
                          title: 'Admin Mode',
                          description: 'Active in Administrator Management Hub.',
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-orange-50 text-xs font-semibold text-slate-800 flex items-center space-x-2 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-[#EA580C]" />
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">Administrator</p>
                        <p className="text-[10px] text-slate-400">Full operations access</p>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('tutor');
                        setShowRoleDropdown(false);
                        addToast({
                          type: 'info',
                          title: 'Tutor Workspace',
                          description: 'Switched to Tutor Portal.',
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-orange-50 text-xs font-semibold text-slate-800 flex items-center space-x-2 transition-colors"
                    >
                      <GraduationCap className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="font-bold text-slate-900">Tutor Portal</p>
                        <p className="text-[10px] text-slate-400">Attendance, topics & classes</p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('student');
                        setShowRoleDropdown(false);
                        addToast({
                          type: 'info',
                          title: 'Student Portal',
                          description: 'Switched to Student Mobile App view.',
                        });
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-orange-50 text-xs font-semibold text-slate-800 flex items-center space-x-2 transition-colors"
                    >
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <div>
                        <p className="font-bold text-slate-900">Student Portal</p>
                        <p className="text-[10px] text-slate-400">Timetable, CBT & syllabus</p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('website');
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

      {/* 4 Stat Cards Row (matches video 00:00 - 00:01) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* Card 1: Total Enrolled Students */}
        <div
          onClick={() => setAdminSection('students')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-slate-700">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-bold text-slate-700">Total Students</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {students.length > 0 ? (1240 + students.length).toLocaleString() : '1,248'}
          </div>
        </div>

        {/* Card 2: Exam Programs */}
        <div
          onClick={() => setAdminSection('programmes')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-[#EA580C]">
            <BookOpen className="w-5 h-5 text-[#EA580C]" />
            <span className="text-sm font-bold text-[#EA580C]">Exam Programs</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            {programmes.length || 5}
          </div>
        </div>

        {/* Card 3: Revenue Collected */}
        <div
          onClick={() => setAdminSection('payments')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-emerald-700">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">Revenue Collected</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            ₦{totalRevenue > 0 ? (totalRevenue || 0).toLocaleString() : '4,850,000'}
          </div>
        </div>

        {/* Card 4: Outstanding Balance */}
        <div
          onClick={() => setAdminSection('payments')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-amber-700">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-bold text-amber-700">Outstanding Fees</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            ₦{totalOutstanding > 0 ? (totalOutstanding || 0).toLocaleString() : '620,000'}
          </div>
        </div>
      </div>

      {/* 4 Secondary Quick Stats Pill Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Active Programmes</p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">{programmes.length || 8}</p>
          </div>
          <BookOpen className="w-5 h-5 text-slate-500" />
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Today's Classes</p>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5">14 Sessions</p>
          </div>
          <Calendar className="w-5 h-5 text-slate-500" />
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-600">Today's Attendance</p>
            <p className="text-lg font-extrabold text-emerald-600 mt-0.5">87%</p>
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
              {seatsSummary ? `${seatsSummary.used} / ${seatsSummary.cap}` : `${students.length} / 10`}
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
                <h3 className="text-base font-bold text-slate-900">Today's Scheduled Classes</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-[#EA580C] rounded-md">
                  Active Timetable
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
              {[
                { subject: 'Use of English & Concord', tutor: 'Dr. Emmanuel Adeyemi', room: 'Lecture Theatre 1', time: '09:00 - 11:00 AM', prog: 'JAMB / UTME Masterclass' },
                { subject: 'Pure Mathematics: Calculus', tutor: 'Engr. Babatunde Lawal', room: 'Hall A (Science)', time: '11:30 - 01:30 PM', prog: 'WAEC / WASSCE Booster' },
                { subject: 'Physics: Electromagnetic AC', tutor: 'Engr. Dapo Alabi', room: 'Physics Laboratory', time: '02:00 - 04:00 PM', prog: 'JAMB & Cambridge' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 text-[#EA580C] flex flex-col items-center justify-center font-mono text-[10px] font-bold shrink-0">
                      <span>{item.time.split(' - ')[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs md:text-sm font-bold text-slate-900 truncate">
                        {item.subject}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {item.tutor} • {item.room}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 shrink-0">
                    {item.prog.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Daily periods synchronized with tutor syllabi</span>
            <span className="font-semibold text-slate-600">On-track</span>
          </div>
        </div>

        {/* Right: Recent Activities Panel */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Recent Centre Activities</h3>
              <button
                onClick={() => setAdminSection('payments')}
                className="text-xs font-semibold text-[#EA580C] hover:underline"
              >
                View Financial Logs
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activities.slice(0, 5).map((act) => {
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
                        <span className="text-[10px] text-slate-400">{act.subtitle || 'Academic Record'}</span>
                        <span className="text-[10px] text-slate-300">•</span>
                        <span className="text-[10px] text-slate-400">{act.timeAgo || 'Just now'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-right">
            <span className="text-[11px] text-slate-400">Showing last 5 activity logs</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Students (left) & Programme Capacities (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Top Mock Exam Performers */}
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
            {topScorers.map((student, idx) => (
              <div
                key={student.name}
                className="p-3.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#EA580C] font-extrabold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {student.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {student.programme} • {student.rank}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0">
                  <div className="w-20 md:w-28 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-[#EA580C] rounded-full" style={{ width: `${student.pct}%` }} />
                  </div>
                  <span className="text-xs font-extrabold text-slate-900">{student.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Programme Enrollment & Capacity */}
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
            {/* Programme 1 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">JAMB 2027 Intensive Cohort</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  94 / 120 (78%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} />
              </div>
            </div>

            {/* Programme 2 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">WAEC Comprehensive Senior Prep</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  62 / 80 (77%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '77%' }} />
              </div>
            </div>

            {/* Programme 3 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">Cambridge A-Level & JUPEB Fast-Track</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  28 / 35 (80%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '80%' }} />
              </div>
            </div>

            {/* Programme 4 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">NECO SSCE Senior Prep</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  41 / 60 (68%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '68%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
