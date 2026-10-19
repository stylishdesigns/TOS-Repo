import React from 'react';
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
  MessageSquare,
  ArrowRight,
  TrendingUp,
  MapPin,
  Flame,
  Award,
  BookOpen,
  GraduationCap,
  Bell,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

import { CalendarView } from '../../common/CalendarView';

interface HomeTabProps {
  student: Student;
  onNavigateTab: (tab: 'home' | 'timetable' | 'cbt' | 'results' | 'more' | 'profile') => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ student, onNavigateTab }) => {
  // Attendance & Clock logic
  const { settings, timetable, announcements, results, attendanceSettings, attendanceLogs, clockIn, clockOut } = useApp();
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
  const targetExamDate = new Date('2026-04-19T08:00:00');
  const diffTime = targetExamDate.getTime() - now.getTime();
  const daysLeft = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

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

  const MALE_NIGERIAN_AVATAR =
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';
  const FEMALE_NIGERIAN_AVATAR =
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=500&q=80';

  const studentAvatar =
    studentHeroAvatar ||
    (student.avatar &&
    !student.avatar.includes('photo-1534528741775') &&
    !student.avatar.includes('photo-1517841905240')
      ? student.avatar
      : student.gender === 'Female'
      ? FEMALE_NIGERIAN_AVATAR
      : MALE_NIGERIAN_AVATAR);

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

  // Progress percentage (from resumption to closing)
  const getProgress = () => {
    const totalMinutes = closingMinutes - resumptionMinutes;
    if (totalMinutes <= 0) return 0;
    
    const elapsed = Math.max(0, currentMinutes - resumptionMinutes);
    return Math.min(100, (elapsed / totalMinutes) * 100);
  };

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

      {/* Attendance Clock In/Out Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-xl transition-colors ${student.attendancePercent > 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Attendance Check</h4>
          </div>
          <button 
            onClick={() => setShowAttendanceInfo(!showAttendanceInfo)}
            className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-orange-500 transition-colors relative"
          >
            <Clock className="w-4 h-4" />
            {showAttendanceInfo && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 text-white p-3 rounded-xl shadow-xl z-50 text-[10px] text-left animate-in fade-in zoom-in-95">
                <p className="font-black uppercase tracking-widest text-orange-400 mb-1.5">Centre Hours</p>
                <ul className="space-y-1.5 opacity-90 font-medium">
                  <li>• Resumption: {attendanceSettings.resumptionTime}</li>
                  <li>• Late Gate: {attendanceSettings.lateArrivalTime}</li>
                  <li>• Closing: {attendanceSettings.closingTime}</li>
                </ul>
              </div>
            )}
          </button>
        </div>

        {/* Compact Controls */}
        <div className="relative flex items-center justify-between px-2 py-2">
            {/* Progress Connecting Line (Improved Visuals) */}
            <div className="absolute top-[33px] left-[45px] right-[45px] h-[6px] bg-slate-200 rounded-full z-0 overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-[#EA580C] rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(234,88,12,0.5)]" 
                style={{ width: `${getProgress()}%` }}
              />
            </div>

            {/* Clock In Button */}
            <div className="flex flex-col items-center z-10">
              <button 
                onClick={handleClockInAction}
                disabled={!!clockedInAt}
                className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-md active:scale-95 transition-all border-4 border-white ${
                  clockedInAt 
                    ? 'bg-slate-700 text-white' 
                    : 'bg-[#475569] text-white'
                } disabled:cursor-not-allowed`}
              >
                <ChevronUp className="w-4 h-4" />
                <span className="text-[10px] font-black">IN</span>
                <span className="text-[7px] font-bold opacity-80 uppercase tracking-tighter">{attendanceSettings.resumptionTime || '8:00 AM'}</span>
              </button>
              <div className="mt-1 h-3 flex items-center justify-center">
                {isLate && clockedInAt && (
                  <span className="text-[7px] font-black uppercase text-amber-600">Late Arrival</span>
                )}
              </div>
            </div>

            {/* Current Time Indicator (Compact) */}
            <div className="flex flex-col items-center justify-center z-10">
              <div className="w-12 h-12 rounded-full border-4 border-white bg-slate-50 flex flex-col items-center justify-center shadow-md ring-1 ring-slate-100">
                <span className="text-slate-900 text-[9px] font-black">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <div className="w-6 h-0.5 bg-orange-500 rounded-full mt-0.5" />
              </div>
            </div>

            {/* Clock Out Button */}
            <div className="flex flex-col items-center z-10">
              <button 
                onClick={handleClockOutAction}
                disabled={!clockedInAt || clockedOutAt || !isClosingTime}
                className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-md active:scale-95 transition-all border-4 border-white ${
                  clockedOutAt
                    ? 'bg-emerald-600 text-white'
                    : clockedInAt && isClosingTime
                    ? 'bg-[#E11D48] text-white' 
                    : 'bg-[#E11D48]/30 text-white/50'
                }`}
              >
                <ChevronDown className="w-4 h-4" />
                <span className="text-[10px] font-black">OUT</span>
                <span className="text-[7px] font-bold opacity-80 uppercase tracking-tighter">{attendanceSettings.closingTime || '03:30 PM'}</span>
              </button>
              <div className="mt-1 h-3 flex items-center justify-center">
                {clockedInAt && !isClosingTime && !clockedOutAt && (
                  <span className="text-[7px] font-bold text-slate-400 uppercase italic">On-going</span>
                )}
              </div>
            </div>
        </div>
      </div>

      {/* 2. Target Exam Countdown Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 opacity-15">
          <Flame className="w-28 h-28" />
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold tracking-wider uppercase opacity-90">
              Target Examination Milestone
            </span>
            <h3 className="text-base font-black">JAMB UTME 2026</h3>
            <p className="text-xs text-orange-100">Intensive cohort syllabus is 74% complete</p>
          </div>
          <div className="text-center bg-black/20 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/20">
            <span className="text-2xl font-black block leading-none">{daysLeft}</span>
            <span className="text-[9px] uppercase tracking-wider font-bold text-orange-100">Days Left</span>
          </div>
        </div>
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
            <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-lg">
              34/37
            </span>
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
          className="text-left bg-white p-4 sm:p-4.5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-[#EA580C] hover:shadow-md transition-all active:scale-98 flex flex-col justify-between min-h-[112px] group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-[#EA580C] group-hover:scale-105 transition-transform">
              <Calendar className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 bg-orange-100 text-[#C2410C] rounded-lg">
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
              <Laptop className="w-5 h-5 text-[#EA580C]" />
              <span>Launch CBT</span>
            </div>
            <p className="text-xs text-orange-800/80 font-medium">Timed exam simulations</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[#EA580C] group-hover:translate-x-1 transition-transform shrink-0 ml-1" />
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
            <Clock className="w-4 h-4 text-[#EA580C]" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Today's Lectures ({todayClasses.length})
            </h4>
          </div>
          <button
            onClick={() => onNavigateTab('classes')}
            className="text-[11px] font-bold text-[#EA580C] hover:underline"
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
              Centre Notice • {urgentAnnouncements[0].date}
            </span>
            <h5 className="text-xs font-bold text-slate-900">{urgentAnnouncements[0].title}</h5>
            <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
              {urgentAnnouncements[0].content}
            </p>
          </div>
        </div>
      )}

      {/* 7. WhatsApp Campus Coordinator */}
      <a
        href={`https://wa.me/${(settings.whatsappNumber || settings.whatsapp || '+2348056765455').replace(/\D/g, '')}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 hover:bg-emerald-100/80 transition-all shadow-2xs"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold">Have a Question for Tutor / Coordinator?</div>
            <div className="text-[10px] text-emerald-700">Chat with Academic Support Desk on WhatsApp</div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-emerald-700" />
      </a>

      {/* Academic Calendar Planner Modal */}
      <CalendarView
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        slots={activeTimetable}
        title="Academic Schedule Planner"
      />
    </div>
  );
};
