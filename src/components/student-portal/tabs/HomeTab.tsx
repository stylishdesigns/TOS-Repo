import React from 'react';
import { initialsAvatar } from '../../../lib/avatar';
import { useApp } from '../../../context/AppContext';
import { Student } from '../../../types';
import { PWAInstallButton } from '../../pwa/PWAInstallButton';
import studentHeroAvatar from '../../../assets/images/regenerated_image_1789369642757.jpg';
import {
  Calendar,
  Clock,
  Laptop,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ArrowRight,
  TrendingUp,
  MapPin,
  Award,
  BookOpen,
  GraduationCap,
  Bell,
  ShieldCheck,
  LogIn,
  LogOut,
} from 'lucide-react';

import { CalendarView } from '../../common/CalendarView';
import { dayNameFromDate, localDateKey, slotsToActivities } from '../../../lib/planner';

interface HomeTabProps {
  student: Student;
  onNavigateTab: (tab: 'home' | 'timetable' | 'cbt' | 'results' | 'more' | 'profile') => void;
}


export const HomeTab: React.FC<HomeTabProps> = ({ student, onNavigateTab }) => {
  // Attendance & Clock logic
  const { settings, timetable, announcements, results, attendanceSettings, attendanceLogs, clockIn, clockOut, plannerReminders, addPlannerReminder, removePlannerReminder, updatePlannerReminder, centreName } = useApp();
  const [showAttendanceInfo, setShowAttendanceInfo] = React.useState(false);
  const [showCalendar, setShowCalendar] = React.useState(false);

  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Greeting based on current local hour
  const currentHour = currentTime.getHours();
  const timeGreeting =
    currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  // Days left to national exams (JAMB UTME 2026 approx April 19)
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Latest mock results for this student
  const currentUid = student.uid || student.id;
  const studentMocks = results.filter(
    (r) => r.studentId === currentUid || r.studentId === student.id
  );
  const latestMock = studentMocks.length > 0 ? studentMocks[studentMocks.length - 1] : null;

  // Today's classes from timetable
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = daysOfWeek[new Date().getDay()];
  const todayStr = localDateKey();
  
  const activeTimetable = timetable.filter(s => s.status === 'active' || !s.status);

  // Academic planner: timetable classes plus this member's own reminders.
  const plannerActivities = React.useMemo(
    () => [...slotsToActivities(activeTimetable), ...plannerReminders],
    [activeTimetable, plannerReminders]
  );
  const todayKey = new Date().toLocaleDateString('en-CA');
  const todayHasActivities = plannerActivities.some((a) => a.date === todayKey);
  const todayClasses = activeTimetable.filter(
    (slot) => slot.date ? slot.date === todayStr : slot.day === todayName
  ).sort((a, b) => a.time.localeCompare(b.time));

  const getLocalDateTime = (dateStr: string, time24: string) => {
    if (!dateStr || !time24) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = time24.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  };

  const isFinished = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const endTime = parseTo24H(parts[1]);
    const endDateTime = getLocalDateTime(date, endTime);
    const now = new Date();
    return now.getTime() > endDateTime.getTime();
  };

  const isInSession = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const startTime = parseTo24H(parts[0]);
    const endTime = parseTo24H(parts[1]);
    const now = new Date();
    const startDateTime = getLocalDateTime(date, startTime);
    const endDateTime = getLocalDateTime(date, endTime);
    return now.getTime() >= startDateTime.getTime() && now.getTime() <= endDateTime.getTime();
  };

  const isNextUp = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const startTime = parseTo24H(parts[0]);
    const startDateTime = getLocalDateTime(date, startTime);
    const now = new Date();
    return now.getTime() < startDateTime.getTime();
  };

  // Urgent announcements

  const studentAvatar =
    (student.avatar &&
    !student.avatar.includes('photo-1534528741775') &&
    !student.avatar.includes('photo-1517841905240')
      ? student.avatar
      : initialsAvatar(student.name));

  const todayLog = attendanceLogs.find(l => l.studentId === student.id && l.date === todayStr);

  const clockedInAt = todayLog?.clockInAt ? new Date(todayLog.clockInAt) : null;
  const clockedOutAt = todayLog?.clockOutAt ? new Date(todayLog.clockOutAt) : null;

  // Live attendance rate (Nov 20): days this student actually checked in vs
  // the centre's class days since they joined. The old stored
  // student.attendancePercent was set once when the account was created and
  // never updated, so the home card now reads the real check-in logs.
  const attendanceRate = React.useMemo(() => {
    const checked = new Set<string>();
    for (const l of attendanceLogs) {
      if (l.studentId !== student.id && l.studentId !== currentUid) continue;
      if (!l.clockInAt || !l.date) continue;
      checked.add(l.date);
    }
    if (checked.size === 0) return null;
    let start: Date | null = student.createdAt ? new Date(student.createdAt) : null;
    if (!start || Number.isNaN(start.getTime())) {
      const earliest = Array.from(checked).sort()[0];
      start = earliest ? new Date(`${earliest}T00:00:00`) : null;
    }
    if (!start || Number.isNaN(start.getTime())) return null;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const classDays = new Set<string>((timetable || []).map((sl: any) => sl.day).filter(Boolean));
    const allowed = classDays.size > 0 ? classDays : new Set<string>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    const startMid = new Date(start); startMid.setHours(0, 0, 0, 0);
    let expected = 0;
    for (const d = new Date(startMid); d < todayMid; d.setDate(d.getDate() + 1)) {
      if (allowed.has(dayNames[d.getDay()])) expected++;
      if (expected > 3000) break;
    }
    if (expected === 0) return null;
    return Math.min(100, Math.round((checked.size / expected) * 100));
  }, [attendanceLogs, student.id, student.createdAt, currentUid, timetable]);

  const parseTo24H = (timeStr: string) => {
    if (!timeStr) return "00:00";
    const cleaned = timeStr.trim().toUpperCase();
    if (!cleaned.includes('AM') && !cleaned.includes('PM')) return cleaned;
    
    const [time, modifier] = cleaned.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Helper to parse AM/PM time to minutes from midnight
  const parseTimeToMinutes = (timeStr: string) => {
    const time24 = parseTo24H(timeStr);
    const [hours, minutes] = time24.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const resumptionMinutes = parseTimeToMinutes(attendanceSettings.resumptionTime || '08:00 AM');
  const closingMinutes = parseTimeToMinutes(attendanceSettings.closingTime || '03:30 PM');
  const lateMinutesThreshold = parseTimeToMinutes(attendanceSettings.lateArrivalTime || '08:30 AM');
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Open days (Nov 23): the facility picks its open days in Attendance
  // Settings; check-in is only required on those days. Until the facility
  // saves a setup, every day counts as open (the old behaviour).
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const operatingDays: string[] = Array.isArray(attendanceSettings.operatingDays) && attendanceSettings.operatingDays.length > 0
    ? attendanceSettings.operatingDays
    : DAY_NAMES;
  const openToday = operatingDays.includes(todayName);
  const openDaysShort = operatingDays.map((d) => d.slice(0, 3)).join(', ');

  // Closing time as today's date, for the check-in ring
  const closingToday = (() => {
    const d = new Date(currentTime);
    d.setHours(Math.floor(closingMinutes / 60), closingMinutes % 60, 0, 0);
    return d;
  })();

  const ringProgress = clockedInAt
    ? Math.min(1, Math.max(0, (currentTime.getTime() - clockedInAt.getTime()) / Math.max(60000, closingToday.getTime() - clockedInAt.getTime())))
    : 0;
  const fmtClock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const clockInLabel = clockedInAt ? fmtClock(clockedInAt) : '';
  const clockOutLabel = clockedOutAt ? fmtClock(clockedOutAt) : '';

  const isClosingTime = currentMinutes >= closingMinutes;
  // Check-in is locked until the facility's sign-in (resumption) time arrives:
  // the button reads closed, not open, before that moment.
  const beforeResumption = !clockedInAt && currentMinutes < resumptionMinutes;
  // The chip on the line shows hour and minutes only; once the student has
  // checked out it freezes at that moment instead of ticking on.
  const chipTime = (clockedOutAt || currentTime).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const isLate = clockedInAt && (clockedInAt.getHours() * 60 + clockedInAt.getMinutes()) > lateMinutesThreshold;
  // The student has not checked in and the late gate has passed: nudge them
  // from inside the Attendance Check card (the old red header pill is gone).
  const isRunningLate = !clockedInAt && !clockedOutAt && currentMinutes > lateMinutesThreshold;


  const handleClockInAction = () => {
    clockIn(student.id);
  };

  const handleClockOutAction = () => {
    clockOut(student.id);
  };

  return (
    <div className="space-y-4 px-4 py-3">
      {/* 1. Student Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#0F172A] text-white p-5 shadow-lg border border-slate-700/60">
        <div className="absolute top-0 right-0 w-36 h-36 bg-orange-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="relative">
              <img
                src={studentAvatar}
                alt={student.name}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-orange-500/70 shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs text-orange-400 font-semibold">{timeGreeting},</span>
              </div>
              <h2 className="text-lg font-black tracking-tight text-white line-clamp-1">
                {student.name}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-orange-400" />
                <span>Day: {dateStr}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('more')}
            className="shrink-0 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
            title="View Student Profile & More"
          >
            <Award className="w-5 h-5 text-orange-400" />
          </button>
        </div>

        {/* Programme Banner Pill */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-semibold">{student.programmeName}</span>
          </div>
        </div>
      </div>

      {/* Attendance Check Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-xl transition-colors ${student.attendancePercent > 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Attendance Check</h4>
          </div>
          <button
            onClick={() => setShowAttendanceInfo(!showAttendanceInfo)}
            className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-orange-500 transition-colors"
          >
            <Clock className="w-4 h-4" />
          </button>
        </div>

        {showAttendanceInfo && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] text-left">
            <p className="font-black uppercase tracking-widest text-orange-400 mb-1.5 text-[10px]">Facility Hours</p>
            <ul className="space-y-1.5 opacity-90 font-medium text-[10px]">
              <li>• Resumption: {attendanceSettings.resumptionTime}</li>
              <li>• Late Gate: {attendanceSettings.lateArrivalTime}</li>
              <li>• Closing: {attendanceSettings.closingTime}</li>
              <li>• Open days: {openDaysShort}</li>
            </ul>
          </div>
        )}

        {openToday && isRunningLate && (
          <button
            type="button"
            onClick={handleClockInAction}
            className="w-full flex items-center gap-3 text-left p-3 rounded-xl bg-amber-50 border border-amber-200 mb-3 cursor-pointer hover:bg-amber-100/70 transition-colors"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-black text-amber-900 leading-tight">You haven't checked in yet</span>
              <span className="block text-[10px] text-amber-700 font-medium leading-snug mt-0.5">
                It's past the late gate, {attendanceSettings.lateArrivalTime || '08:30 AM'}. Tap to check in.
              </span>
            </span>
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200 text-[9px] font-black uppercase tracking-wider text-amber-700">
              Running late
            </span>
          </button>
        )}

        {openToday && isLate && !clockedOutAt && (
          <span className="self-center mb-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider">Late Arrival</span>
        )}

        {openToday ? (
          <>
        {/* Check In on the student's left, Check Out on the right, and a small
            circular time chip sitting centred on the line between them. It
            starts moving the moment the student checks in, rides the
            facility-coloured fill toward closing time, and stops at the end
            of the line when the student checks out. */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex flex-col items-center gap-1 shrink-0 w-[64px]">
            <button
              onClick={handleClockInAction}
              disabled={!!clockedInAt || beforeResumption}
              aria-label="Check In"
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md transition-all ${clockedInAt ? 'bg-emerald-600 opacity-60 cursor-not-allowed' : beforeResumption ? 'bg-emerald-600 opacity-40 cursor-not-allowed' : `bg-emerald-600 hover:brightness-110 active:scale-95 ${isRunningLate ? 'checkin-breathe' : ''}`}`}
            >
              <LogIn className="w-6 h-6" />
            </button>
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Check In</span>
          </div>
          <div className="flex-1 relative h-10 flex items-center min-w-[40px]">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200" />
            {clockedInAt && (
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${Math.round(ringProgress * 100)}%`, background: 'var(--brand, #EA580C)' }}
              />
            )}
            {clockedInAt && (
              <div
                className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-1000 ease-linear"
                style={{ left: `min(max(calc(${Math.round(ringProgress * 100)}% - 18px), 0px), calc(100% - 36px))` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums select-none"
                  style={{
                    background: 'var(--brand, #EA580C)',
                    color: 'var(--on-brand, #fff)',
                    boxShadow: '0 2px 8px rgba(15,23,42,0.28), 0 0 0 4px color-mix(in oklab, var(--brand, #EA580C) 20%, transparent)',
                  }}
                >
                  {chipTime}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0 w-[64px]">
            <button
              onClick={handleClockOutAction}
              disabled={!clockedInAt || !!clockedOutAt || !isClosingTime}
              aria-label="Check Out"
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md transition-all ${!clockedInAt || !!clockedOutAt || !isClosingTime ? 'bg-rose-600 opacity-40 cursor-not-allowed' : `bg-rose-600 hover:brightness-110 active:scale-95 ${isClosingTime ? 'animate-pulse' : ''}`}`}
            >
              <LogOut className="w-6 h-6" />
            </button>
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-600">Check Out</span>
          </div>
        </div>
        <p className="text-center text-[10px] font-semibold text-slate-400 mt-2">
          {!clockedInAt
            ? beforeResumption
              ? `Check-in opens at ${attendanceSettings.resumptionTime} • Late after ${attendanceSettings.lateArrivalTime}`
              : `Tap Check In when you arrive • Resumption ${attendanceSettings.resumptionTime} • Late after ${attendanceSettings.lateArrivalTime}`
            : clockedOutAt
            ? `Checked in ${clockInLabel} • Checked out ${clockOutLabel}`
            : isClosingTime
            ? 'Time complete — you can check out now'
            : `On-going • Check out opens at ${attendanceSettings.closingTime}`}
        </p>
          </>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-black text-slate-800 leading-snug">{centreName || 'Your facility'} does not open today</p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-snug">
                Check-in is only required on open days: {openDaysShort}. See you on your next class day.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Candidate Vitals Row (Enhanced, comfortable button cards) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Mock Exam Performance */}
        <button
          onClick={() => onNavigateTab('results')}
          className="text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-orange-400 hover:shadow-md transition-all active:scale-98 flex flex-col justify-between min-h-[112px] group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
            {latestMock && latestMock.rank > 0 ? (
              <span className="text-[10px] font-black px-2 py-0.5 bg-orange-100/80 text-orange-800 rounded-lg">
                Rank #{latestMock.rank}
              </span>
            ) : (
              <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg">
                Academic
              </span>
            )}
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 leading-snug">
              {latestMock ? `${latestMock.averagePercent}%` : 'No tests yet'}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Performance Score</div>
          </div>
        </button>

        {/* Card 2: Attendance Rate — live from check-in logs, not clickable */}
        <div className="text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between min-h-[112px]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 leading-snug">
              {attendanceRate === null ? '—' : `${attendanceRate}%`}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Days you checked in</div>
          </div>
        </div>

        {/* Card 3: Fee Settlement Status */}
        <button
          onClick={() => onNavigateTab('more')}
          className="text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-blue-400 hover:shadow-md transition-all active:scale-98 flex flex-col justify-between min-h-[112px] group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                student.outstandingBalance > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {student.outstandingBalance > 0 ? 'Balance' : 'Cleared'}
            </span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 truncate leading-snug">
              {student.outstandingBalance > 0
                ? `${settings.currencySymbol}${(student.outstandingBalance || 0).toLocaleString()}`
                : '₦0 (Paid)'}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Tuition Account</div>
          </div>
        </button>

        {/* Card 4: Calendar Planner Scheduling */}
        <button
          onClick={() => setShowCalendar(true)}
          className={`text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-orange-600 hover:shadow-md transition-all active:scale-98 flex flex-col justify-between min-h-[112px] group cursor-pointer ${todayHasActivities ? 'planner-blink' : ''}`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform">
              <Calendar className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 bg-orange-100 text-orange-700 rounded-lg">
              Planner
            </span>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 leading-snug">
              Schedule
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Calendar Planner</div>
          </div>
        </button>
      </div>

      {/* 4. Quick Action Buttons (Enlarged and tactile) */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigateTab('cbt')}
          className="flex items-center justify-between p-4 bg-gradient-to-br from-orange-50 via-amber-50/70 to-orange-50 rounded-2xl border border-orange-200/90 hover:border-orange-400 hover:shadow-md transition-all text-left shadow-2xs group active:scale-98"
        >
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sm font-black text-orange-950">
              <Laptop className="w-5 h-5 text-orange-600" />
              <span>Launch CBT</span>
            </div>
            <p className="text-xs text-orange-800/80 font-medium">Timed exam simulations</p>
          </div>
          <ArrowRight className="w-4 h-4 text-orange-600 group-hover:translate-x-1 transition-transform shrink-0 ml-1" />
        </button>

        <button
          onClick={() => onNavigateTab('classes')}
          className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 via-slate-100/70 to-slate-50 rounded-2xl border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition-all text-left shadow-2xs group active:scale-98"
        >
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sm font-black text-slate-900">
              <Calendar className="w-5 h-5 text-slate-700" />
              <span>Timetable</span>
            </div>
            <p className="text-xs text-slate-600 font-medium">Daily lecture halls</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-600 group-hover:translate-x-1 transition-transform shrink-0 ml-1" />
        </button>
      </div>

      {/* 5. Today's Lectures Widget */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-orange-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Today's Lectures ({todayClasses.length})
            </h4>
          </div>
          <button
            onClick={() => onNavigateTab('classes')}
            className="text-[11px] font-bold text-orange-600 hover:underline"
          >
            Full Week →
          </button>
        </div>

        <div className="space-y-2">
          {todayClasses.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No classes scheduled for today.</p>
          ) : (
            todayClasses.map((slot) => {
              const inSession = isInSession(slot.time, slot.date);
              const finished = isFinished(slot.time, slot.date);
              const upcoming = isNextUp(slot.time, slot.date);
              
              return (
                <div
                  key={slot.id}
                  onClick={() => onNavigateTab('classes')}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    inSession
                      ? 'bg-emerald-50 border-emerald-200 shadow-2xs'
                      : finished ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200/70 hover:border-orange-200'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-slate-900">{slot.subject}</span>
                      {inSession ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-600 text-white border-2 border-emerald-500 shadow-sm animate-pulse">
                          ● In-Session
                        </span>
                      ) : finished ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[9px] font-black uppercase bg-slate-200 text-slate-600 border border-slate-300">
                          Completed
                        </span>
                      ) : isNextUp(slot.time, slot.date) ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[9px] font-black uppercase bg-blue-600 text-white border-2 border-blue-500 shadow-sm">
                          Next Up
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Tutor: <span className="text-slate-700 font-semibold">{slot.tutorName}</span> •{' '}
                      <span className="font-mono text-slate-600">{slot.room}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono font-bold text-slate-700 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-2xs">
                      {slot.time.split('-')[0].trim()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


      {/* Academic Calendar Planner Modal */}
      <CalendarView
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        activities={plannerActivities}
        title="Academic Schedule Planner"
        onAddActivity={addPlannerReminder}
        onRemoveActivity={removePlannerReminder}
        onEditActivity={updatePlannerReminder}
      />
    </div>
  );
};
