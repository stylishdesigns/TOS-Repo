import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  GraduationCap,
  Users,
  CreditCard,
  AlertCircle,
  BookOpen,
  Calendar,
  PanelLeft,
  Check,
  X,
  UserCheck,
  ChevronDown,
  Shield,
  Globe,
  CalendarDays,
  Trophy,
  Inbox,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { formatPayInfo } from '../staff/PaySetupFields';
import { formatDateLong } from '../../lib/paymentDates';
import { computeNextPayDate, payDueStatus, overdueDays } from '../../lib/staffPay';
import { CalendarView } from '../common/CalendarView';
import { slotsToActivities } from '../../lib/planner';

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
    activeCentreId,
    viewMode,
    setViewMode,
    setAdminSection,
    addToast,
    approveAdmission,
    rejectAdmission,
    seatsSummary,
    centreName,
    plannerReminders,
    addPlannerReminder,
    removePlannerReminder,
  } = useApp();

  // Calendar planner: the same facility master timetable and day planner the
  // timetable page uses, opened straight from the greeting card.
  const [showPlanner, setShowPlanner] = React.useState(false);
  // Mobile sections rail: on phones the dashboard's sections open from a
  // collapsible left panel instead of piling at the bottom of the scroll.
  const [sectionsOpen, setSectionsOpen] = React.useState(false);
  const [secCollapsed, setSecCollapsed] = React.useState<Record<string, boolean>>({});
  const flipSec = (k: string) => setSecCollapsed((sc) => ({ ...sc, [k]: !sc[k] }));

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

  // Every activity carries the real moment it happened, so the card shows the
  // exact clock time and a live "x minutes ago" instead of a frozen stamp.
  const formatActivityTime = (createdAt?: number) => {
    if (!createdAt) return '';
    const d = new Date(createdAt);
    const exact = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const mins = Math.floor((Date.now() - createdAt) / 60000);
    const ago = mins < 1 ? 'Just now'
      : mins < 60 ? `${mins} min ago`
      : mins < 1440 ? `${Math.floor(mins / 60)} hr${Math.floor(mins / 60) === 1 ? '' : 's'} ago`
      : `${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) === 1 ? '' : 's'} ago`;
    return `${exact} • ${ago}`;
  };

  // My Pay: the signed-in staff admin's own pay setup and records. Only
  // shows when the owner has set a pay cycle for them.
  const [myPayOpen, setMyPayOpen] = React.useState(false);
  const [myPayHistory, setMyPayHistory] = React.useState<any[] | null>(null);
  const [myPayLoading, setMyPayLoading] = React.useState(false);

  const openMyPay = async () => {
    setMyPayOpen(true);
    setMyPayLoading(true);
    setMyPayHistory(null);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch(`/api/centre/staff-payments/mine?centreId=${encodeURIComponent(activeCentreId || '')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not load your pay records.');
      setMyPayHistory(data.payments || []);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Load Failed', description: err?.message || 'Could not load your pay records.' });
      setMyPayHistory([]);
    } finally {
      setMyPayLoading(false);
    }
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

  // Live programme enrollment, most enrolled first. Suspended students and
  // students whose seat access is switched off stay out of the count.
  const seatActiveOf = (s: { uid?: string; id: string; status: string }) => {
    const access = seatsSummary?.studentAccess?.[s.uid || s.id];
    return access ? access.status === 'active' : s.status !== 'Suspended';
  };
  const programmeCapacity = programmes
    .filter((p) => p.status !== 'Archived')
    .map((p) => ({
      prog: p,
      enrolled: students.filter((s) =>
        (s.programmeId
          ? s.programmeId === p.id
          : String(s.programmeName || '').trim().toLowerCase() === String(p.name || '').trim().toLowerCase()) &&
        seatActiveOf(s)
      ).length,
    }))
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 4);

  const money = (n: number) =>
    '₦' + Math.round(n).toLocaleString('en-NG');

  return (
    <div id="dashboard-overview-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Mobile sections rail: on phones the dashboard's sections open from a
          collapsible left panel instead of piling at the bottom of the scroll. */}
      <button
        onClick={() => setSectionsOpen(true)}
        className="lg:hidden fixed left-2 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-white border border-slate-200 shadow-lg grid place-items-center text-slate-600 active:scale-95 transition-transform"
        title="Dashboard sections"
        aria-label="Open dashboard sections"
      >
        <PanelLeft className="w-5 h-5" />
      </button>
      {sectionsOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setSectionsOpen(false)} />
          <div className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-60 bg-white border-r border-slate-200 shadow-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
              <p className="text-sm font-black text-slate-900">Sections</p>
              <button onClick={() => setSectionsOpen(false)} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100" aria-label="Close sections"><X className="w-4 h-4" /></button>
            </div>
            {([
              { k: 'classes', label: "Today's Classes", icon: CalendarDays },
              { k: 'activities', label: 'Recent Activities', icon: Inbox },
              { k: 'performers', label: 'Top Performers', icon: Trophy },
              { k: 'programmes', label: 'Programme Capacities', icon: BookOpen },
            ]).map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => {
                  setSectionsOpen(false);
                  window.setTimeout(() => document.getElementById(`dash-sec-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-orange-600" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 1. Greeting card */}
      <div
        id="admin-greeting-card"
        className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/90 shadow-sm relative overflow-hidden transition-all hover:shadow-md"
      >
        <div className="absolute top-6 right-6 text-right hidden sm:block">
          <span className="text-sm font-black text-orange-600">{settings.academicSession}</span>
        </div>

        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-orange-50/80 via-amber-50/30 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-600" />

        <div className="relative z-10">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-600 border border-orange-200/80">
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
                <p className="text-xs font-bold text-orange-600 uppercase tracking-[0.15em] mt-1.5 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </p>
                <p className="text-[15px] font-bold text-slate-700 mt-2 leading-relaxed">
                  A live snapshot of students, tutors, classes and money in {centreName}.
                </p>

              {/* Calendar planner: open the facility day planner from here */}
              <div className="shrink-0">
                <button
                  id="dashboard-planner-btn"
                  onClick={() => setShowPlanner(true)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-orange-400 rounded-xl shadow-xs transition-all flex items-center space-x-2"
                >
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span>Calendar Planner</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My Pay flash: shows only when this signed-in admin has a pay setup */}
      {(() => {
        const me = activeUser as any;
        if (!me?.payFrequency) return null;
        const nextPay = computeNextPayDate(me.payFrequency, me.payDay, me.lastPaidAt);
        if (!nextPay) return null;
        const status = payDueStatus(nextPay);
        const daysLate = status === 'overdue' ? overdueDays(nextPay) : 0;
        return (
          <button
            onClick={openMyPay}
            className={`w-full rounded-2xl p-4 flex items-center justify-between text-left border transition-all active:scale-[0.99] ${
              status === 'overdue'
                ? 'bg-rose-500 border-rose-400 text-white'
                : 'bg-[var(--brand,#EA580C)] border-black/10 text-white'
            }`}
          >
            <div className="flex items-center space-x-3 min-w-0">
              <Wallet className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-90">
                  {status === 'overdue'
                    ? `Pay overdue by ${daysLate} day${daysLate > 1 ? 's' : ''}`
                    : status === 'due'
                      ? 'Pay due today'
                      : 'Next Pay'}
                </p>
                <p className="text-sm font-bold truncate">
                  {formatDateLong(nextPay)} · {formatPayInfo(me, false)}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-90 shrink-0" />
          </button>
        );
      })()}

      {/* My Pay modal for non-tutor admins */}
      {myPayOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs" onClick={() => setMyPayOpen(false)}>
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
                <Wallet className="w-5 h-5 text-orange-600" />
                <span>My Pay</span>
              </h3>
              <button onClick={() => setMyPayOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Pay Setup</p>
                <p className="text-sm font-black text-slate-900 mt-1">{formatPayInfo(activeUser as any, false)}</p>
                {(() => {
                  const me = activeUser as any;
                  const nextPay = computeNextPayDate(me.payFrequency, me.payDay, me.lastPaidAt);
                  if (!nextPay) return null;
                  return (
                    <p className="text-[11px] font-bold text-emerald-700 mt-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Next pay: {formatDateLong(nextPay)}
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment History</p>
                {myPayLoading ? (
                  <p className="text-[13px] text-slate-700 font-bold py-4 text-center">Loading...</p>
                ) : !myPayHistory || myPayHistory.length === 0 ? (
                  <p className="text-[13px] text-slate-700 font-bold py-4 text-center">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {myPayHistory.map((p) => (
                      <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900">₦{Number(p.amount).toLocaleString('en-NG')}</p>
                          <p className="text-xs font-semibold text-slate-500 font-bold">{formatDateLong(p.datePaid)} · {p.mode}</p>
                          {p.note && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.note}</p>}
                        </div>
                        {p.evidenceUrl ? (
                          <a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black text-orange-600 uppercase tracking-wider shrink-0 hover:underline">
                            View Proof
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-xs font-bold text-slate-600 mt-1">{activeStudents.length} active</p>
          )}
        </div>

        <div
          onClick={() => setAdminSection('programmes')}
          className="bg-white p-5 md:p-6 rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 cursor-pointer transition-all"
        >
          <div className="flex items-center space-x-2 text-orange-600">
            <BookOpen className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-bold text-orange-600">Exam Programs</span>
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
              {seatsSummary?.tier === 'lead' && (
                <span className="text-[10px] text-amber-600 font-semibold px-1.5 py-0.2 bg-amber-50 rounded">Lead</span>
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
        <div id="dash-sec-classes" className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 flex flex-col justify-between scroll-mt-24">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <button onClick={() => flipSec('classes')} className="lg:hidden w-7 h-7 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 grid place-items-center" aria-label="Collapse Today's Classes" title="Collapse or expand this section">
                  <ChevronDown className={`w-4 h-4 transition-transform ${secCollapsed.classes ? '-rotate-90' : ''}`} />
                </button>
                <h3 className="text-base font-bold text-slate-900">Today's Classes</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600 rounded-md">
                  {todayName}
                </span>
              </div>
              <button
                onClick={() => setAdminSection('timetable')}
                className="text-xs font-semibold text-orange-600 hover:underline"
              >
                Open Timetable →
              </button>
            </div>

            <div className={`mt-4 space-y-3 ${secCollapsed.classes ? 'hidden' : ''}`}>
              {todaySlots.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                  <CalendarDays className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-2">No classes scheduled for today</p>
                  <p className="text-[13px] font-semibold text-slate-700 mt-0.5">Slots added to the timetable will appear here.</p>
                </div>
              ) : (
                todaySlots.slice(0, 5).map((slot) => (
                  <div
                    key={slot.id}
                    className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-mono text-[10px] font-bold shrink-0">
                        <span>{(slot.startTime || slot.time.split(' - ')[0] || '').trim()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs md:text-sm font-bold text-slate-900 truncate">
                          {slot.subject}
                        </p>
                        <p className="text-[13px] font-semibold text-slate-700 truncate">
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

          <div className={`mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500 ${secCollapsed.classes ? 'hidden' : ''}`}>
            <span>Live from the facility timetable</span>
            <span className="font-semibold text-slate-600">
              {todaySlots.length > 5 ? `+${todaySlots.length - 5} more` : 'On-track'}
            </span>
          </div>
        </div>

        {/* Right: Recent Activities Panel */}
        <div id="dash-sec-activities" className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 flex flex-col justify-between scroll-mt-24">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <button onClick={() => flipSec('activities')} className="lg:hidden w-7 h-7 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 grid place-items-center" aria-label="Collapse Recent activities" title="Collapse or expand this section">
                <ChevronDown className={`w-4 h-4 transition-transform ${secCollapsed.activities ? '-rotate-90' : ''}`} />
              </button>
<h3 className="text-base font-bold text-slate-900">Recent Facility Activities</h3>
            </div>

            <div className={`mt-4 space-y-3 ${secCollapsed.activities ? 'hidden' : ''}`}>
              {activities.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                  <Inbox className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-2">No activity recorded yet</p>
                  <p className="text-[13px] font-semibold text-slate-700 mt-0.5">Approvals, payments and updates will show here.</p>
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
                        <p className="text-sm font-bold text-slate-900 leading-snug truncate">
                          {act.title}
                        </p>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="text-xs font-semibold text-slate-500">{act.actorName ? `${act.actorName} · ${act.subtitle || 'Facility record'}` : (act.subtitle || 'Facility record')}</span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-xs font-semibold text-slate-500">{formatActivityTime(act.createdAt) || 'Earlier'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t border-slate-100 text-right ${secCollapsed.activities ? 'hidden' : ''}`}>
            <span className="text-xs font-semibold text-slate-500">Showing last 5 activity logs</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Performers (left) & Programme Capacities (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Top Performers from recorded results */}
        <div id="dash-sec-performers" className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 scroll-mt-24">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <button onClick={() => flipSec('performers')} className="lg:hidden w-7 h-7 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 grid place-items-center" aria-label="Collapse Top performers" title="Collapse or expand this section">
              <ChevronDown className={`w-4 h-4 transition-transform ${secCollapsed.performers ? '-rotate-90' : ''}`} />
            </button>
<h3 className="text-base font-bold text-slate-900">Top Academic Performers</h3>
            <button
              onClick={() => setAdminSection('results')}
              className="text-xs font-semibold text-orange-600 hover:underline"
            >
              Results & Mocks
            </button>
          </div>

          <div className={`mt-4 space-y-3 ${secCollapsed.performers ? 'hidden' : ''}`}>
            {topPerformers.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                <Trophy className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700 mt-2">No results recorded yet</p>
                <p className="text-[13px] font-semibold text-slate-700 mt-0.5">Top scorers appear once results are uploaded.</p>
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
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {r.studentName}
                        </p>
                        <p className="text-[13px] font-semibold text-slate-700 truncate">
                          {r.examTitle || r.programmeName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      <div className="w-20 md:w-28 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-orange-600 rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.averagePercent))}%` }} />
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
        <div id="dash-sec-programmes" className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 md:p-6 scroll-mt-24">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <button onClick={() => flipSec('programmes')} className="lg:hidden w-7 h-7 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 grid place-items-center" aria-label="Collapse Programme capacities" title="Collapse or expand this section">
              <ChevronDown className={`w-4 h-4 transition-transform ${secCollapsed.programmes ? '-rotate-90' : ''}`} />
            </button>
<h3 className="text-base font-bold text-slate-900">Programme Capacities</h3>
            <button
              onClick={() => setAdminSection('programmes')}
              className="text-xs font-semibold text-orange-600 hover:underline"
            >
              All Programmes
            </button>
          </div>

          <div className={`mt-4 space-y-4 ${secCollapsed.programmes ? 'hidden' : ''}`}>
            {programmeCapacity.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 text-center">
                <BookOpen className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700 mt-2">No exam programmes yet</p>
                <p className="text-[13px] font-semibold text-slate-700 mt-0.5">Add an exam programme and registrations will count here live.</p>
              </div>
            ) : (
              programmeCapacity.map(({ prog: p, enrolled }) => (
                <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-700 font-medium truncate">{p.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-slate-50 text-slate-700 border-slate-200">
                    {enrolled} students
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Calendar planner: the facility master timetable plus the admin's own
          day plan, opened from the greeting card button. */}
      <CalendarView
        isOpen={showPlanner}
        onClose={() => setShowPlanner(false)}
        activities={[...slotsToActivities(timetable), ...plannerReminders]}
        title="Facility Master Timetable"
        onAddActivity={addPlannerReminder}
        onRemoveActivity={removePlannerReminder}
      />
    </div>
  );
};
