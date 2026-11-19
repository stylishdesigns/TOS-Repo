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
} from 'lucide-react';

import { CalendarView } from '../../common/CalendarView';
import { slotsToActivities } from '../../../lib/planner';

interface HomeTabProps {
  student: Student;
  onNavigateTab: (tab: 'home' | 'timetable' | 'cbt' | 'results' | 'more' | 'profile') => void;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 74;

export const HomeTab: React.FC<HomeTabProps> = ({ student, onNavigateTab }) => {
  // Attendance & Clock logic
  const { settings, timetable, announcements, results, attendanceSettings, attendanceLogs, clockIn, clockOut, plannerReminders, addPlannerReminder, removePlannerReminder } = useApp();
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
  const todayStr = new Date().toISOString().split('T')[0];
  
  const activeTimetable = timetable.filter(s => s.status === 'active' || !s.status);

  // Academic planner: timetable classes plus this member's own reminders.
  const plannerActivities = React.useMemo(
    () => [...slotsToActivities(activeTimetable), ...plannerReminders],
    [activeTimetable, plannerReminders]
  );
  const todayKey = new Date().toLocaleDateString('en-CA');
  const todayHasActivities = plannerActivities.some((a) => a.date === todayKey);
  const todayClasses = activeTimetable.filter(
    (slot) => slot.day === todayName && slot.date === todayStr
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
  const urgentAnnouncements = announcements.filter((a) => a.priority === 'Urgent' || a.target !== 'Parents');

  const studentAvatar =
    (student.avatar &&
    !student.avatar.includes('photo-1534528741775') &&
    !student.avatar.includes('photo-1517841905240')
      ? student.avatar
      : initialsAvatar(student.name));

  const todayLog = attendanceLogs.find(l => l.studentId === student.id && l.date === todayStr);

  const clockedInAt = todayLog?.clockInAt ? new Date(todayLog.clockInAt) : null;
  const clockedOutAt = todayLog?.clockOutAt ? new Date(todayLog.clockOutAt) : null;

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

  // Closing time as today's date, for the check-in ring
  const closingToday = (() => {
    const d = new Date(currentTime);
    d.setHours(Math.floor(closingMinutes / 60), closingMinutes % 60, 0, 0);
    return d;
  })();

  const elapsedMillis = clockedInAt ? Math.max(0, currentTime.getTime() - clockedInAt.getTime()) : 0;
  const ringProgress = clockedInAt
    ? Math.min(1, Math.max(0, (currentTime.getTime() - clockedInAt.getTime()) / Math.max(60000, closingToday.getTime() - clockedInAt.getTime())))
    : 0;
  const totalMillis = clockedInAt && clockedOutAt ? Math.max(0, clockedOutAt.getTime() - clockedInAt.getTime()) : 0;

  const formatDuration = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  const fmtClock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const clockInLabel = clockedInAt ? fmtClock(clockedInAt) : '';
  const clockOutLabel = clockedOutAt ? fmtClock(clockedOutAt) : '';

  const isClosingTime = currentMinutes >= closingMinutes;
  const isLate = clockedInAt && (clockedInAt.getHours() * 60 + clockedInAt.getMinutes()) > lateMinutesThreshold;

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
          <div className="mb-4 p-3 rounded-xl bg-slate-900 text-white text-left">
            <p className="font-black uppercase tracking-widest text-orange-400 mb-1.5 text-[10px]">Facility Hours</p>
            <ul className="space-y-1.5 opacity-90 font-medium text-[10px]">
              <li>• Resumption: {attendanceSettings.resumptionTime}</li>
              <li>• Late Gate: {attendanceSettings.lateArrivalTime}</li>
              <li>• Closing: {attendanceSettings.closingTime}</li>
            </ul>
          </div>
        )}

        {!clockedInAt ? (
          /* Before check-in: one full-width check-in button with the arrow icon inside the text */
          <div>
            <button
              onClick={handleClockInAction}
              className="w-full min-h-[48px] px-5 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-black flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all"
            >
              <span>Check In</span>
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
            <p className="text-center text-[10px] font-semibold text-slate-400 mt-2">
              Resumption {attendanceSettings.resumptionTime} • Late after {attendanceSettings.lateArrivalTime}
            </p>
          </div>
        ) : (
          /* Checked in: a circular ring fills from the check-in moment toward closing
             time. Everything sits in normal flow, so nothing overlays a button. */
          <div className="flex flex-col items-center">
            {isLate && !clockedOutAt && (
              <span className="mb-2 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider">Late Arrival</span>
            )}
            <div className="relative">
              <svg width="168" height="168" viewBox="0 0 168 168" className="block">
                <circle cx="84" cy="84" r="74" fill="none" stroke="#E2E8F0" strokeWidth="10" />
                <circle
                  cx="84"
                  cy="84"
                  r="74"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeLinecap="round"
                  className={clockedOutAt ? 'text-emerald-500' : 'text-orange-500'}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringProgress)}
                  transform="rotate(-90 84 84)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              {/* Side markers are state badges only: check-in and check-out happen on
                  the buttons, never by tapping these */}
              <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black border-4 border-white shadow-md">IN</div>
              <div className={`absolute top-1/2 -translate-y-1/2 -right-3 w-9 h-9 rounded-full flex items-center justify-center text-[9px] font-black border-4 border-white shadow-md ${clockedOutAt ? 'bg-emerald-600 text-white' : isClosingTime ? 'bg-[#E11D48] text-white' : 'bg-slate-200 text-slate-400'}`}>OUT</div>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {clockedOutAt ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <span className="text-lg font-black text-slate-900 leading-none mt-1 tabular-nums">{formatDuration(totalMillis)}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">In facility</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-black text-slate-900 leading-none tabular-nums">{formatDuration(elapsedMillis)}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">Since {clockInLabel}</span>
                  </>
                )}
              </div>
            </div>
            {clockedOutAt ? (
              <p className="text-center text-[10px] font-semibold text-slate-400 mt-3">
                Checked in {clockInLabel} • Checked out {clockOutLabel}
              </p>
            ) : (
              <div className="w-full mt-3">
                <button
                  onClick={handleClockOutAction}
                  disabled={!isClosingTime}
                  className={`w-full min-h-[44px] px-5 rounded-2xl text-sm font-black flex items-center justify-center transition-all active:scale-[0.98] ${isClosingTime ? 'bg-[#E11D48] text-white shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                  <span>Check Out</span>
                </button>
                <p className="text-center text-[10px] font-semibold text-slate-400 mt-2">
                  {isClosingTime ? 'Closing time reached — you can check out now' : `On-going • Check out opens at ${attendanceSettings.closingTime}`}
                </p>
              </div>
            )}
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

        {/* Card 2: Attendance Rate */}
        <button
          onClick={() => onNavigateTab('more')}
          className="text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all active:scale-98 flex flex-col justify-between min-h-[112px] group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 leading-snug">
              {student.attendancePercent}%
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Class Attendance</div>
          </div>
        </button>

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

      {/* 6. Important Centre Notice */}
      {urgentAnnouncements.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-2xs flex items-start space-x-3">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
            <Bell className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-amber-900 tracking-wider">
              Facility Notice • {urgentAnnouncements[0].date}
            </span>
            <h5 className="text-xs font-bold text-slate-900">{urgentAnnouncements[0].title}</h5>
            <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
              {urgentAnnouncements[0].content}
            </p>
          </div>
        </div>
      )}

      {/* Academic Calendar Planner Modal */}
      <CalendarView
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        activities={plannerActivities}
        title="Academic Schedule Planner"
        onAddActivity={addPlannerReminder}
        onRemoveActivity={removePlannerReminder}
      />
    </div>
  );
};
