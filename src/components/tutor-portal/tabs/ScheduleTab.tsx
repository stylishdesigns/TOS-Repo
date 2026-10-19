import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users,
  Search,
  ChevronRight,
  ChevronDown,
  Info,
  LayoutGrid,
  X,
  User,
  GraduationCap,
  Bell,
  History
} from 'lucide-react';
import { CalendarView } from '../../common/CalendarView';
import { ModernSelect } from '../../ui/ModernSelect';
import { TimetableSlot, Tutor, Student } from '../../../types';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { TutorHistoryView } from './TutorHistoryView';

interface ScheduleTabProps {
  tutor: Tutor;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ tutor }) => {
  const { timetable, programmes, settings, consentToTimetableSlot, updateTimetableSlot, students } = useApp();
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPastClasses, setShowPastClasses] = useState(false);
  const [selectedDay, setSelectedDay] = useState<'All' | string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  
  const [viewingSession, setViewingSession] = useState<TimetableSlot | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [tutorTopic, setTutorTopic] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionType, setActionType] = useState<'none' | 'postpone'>('none');

  useScrollLock(!!viewingSession || showCalendar);

  // Current week range (Monday to Sunday)
  const currentWeekRange = React.useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  }, []);

  const getWeekDateForDay = (targetDay: string) => {
    const dayIndexMap: Record<string, number> = {
      Monday: 0,
      Tuesday: 1,
      Wednesday: 2,
      Thursday: 3,
      Friday: 4,
      Saturday: 5,
      Sunday: 6,
    };
    const offset = dayIndexMap[targetDay] ?? 0;
    const targetDate = new Date(currentWeekRange.monday);
    targetDate.setDate(currentWeekRange.monday.getDate() + offset);
    return targetDate.getDate();
  };

  // Filter timetable for this tutor only and only for the CURRENT WEEK (sync with Admin)
  let myClasses = (timetable || []).filter(slot => {
    const isMySlot = slot.tutorId === tutor.id || 
      (slot.tutorName && slot.tutorName.toLowerCase() === tutor.name.toLowerCase());
    if (!isMySlot) return false;

    if (slot.date) {
      const slotDate = new Date(slot.date + 'T00:00:00');
      return slotDate >= currentWeekRange.monday && slotDate <= currentWeekRange.sunday;
    }
    return true;
  });

  // Apply Status & Day Filters
  if (selectedStatus !== 'All') myClasses = myClasses.filter(s => s.status === selectedStatus || (!s.status && selectedStatus === 'active'));
  if (selectedDay !== 'All') myClasses = myClasses.filter(s => s.day === selectedDay);

  const pendingClasses = myClasses.filter(c => c.status === 'pending_tutor_consent');
  const activeClasses = myClasses.filter(c => c.status === 'active' || !c.status || c.status === 'postponed');

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const formatTimeAMPM = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatTimeRangeAMPM = (range: string) => {
    if (!range || !range.includes(' - ')) return range;
    const [start, end] = range.split(' - ');
    return `${formatTimeAMPM(start)} - ${formatTimeAMPM(end)}`;
  };

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

  const [isProcessing, setIsProcessing] = useState(false);

  const handleConsent = async () => {
    if (!viewingSession || !hasConsented) return;
    setIsProcessing(true);
    try {
      await consentToTimetableSlot(viewingSession.id, tutorTopic.trim() || undefined);
      setViewingSession(null);
      setTutorTopic('');
      setHasConsented(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusAction = async () => {
    if (!viewingSession || !actionReason.trim() || actionType === 'none') return;
    setIsProcessing(true);
    try {
      await updateTimetableSlot(viewingSession.id, { status: 'postponed', postponedNote: actionReason });
      setViewingSession(null);
      setActionReason('');
      setActionType('none');
    } finally {
      setIsProcessing(false);
    }
  };

  if (showPastClasses) {
    return <TutorHistoryView tutor={tutor} onBack={() => setShowPastClasses(false)} />;
  }

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-200 shrink-0">
          <Calendar className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight truncate">My Classes</h2>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{settings.academicSession} Schedule</p>
        </div>
        
        {/* Past Classes Button (Upper right corner) */}
        <button
          type="button"
          onClick={() => setShowPastClasses(true)}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
          title="View Past Classes and Ratings History"
        >
          <History className="w-4 h-4 text-[#F97316]" />
          <span>Past Classes</span>
        </button>

        <button 
          onClick={() => setShowCalendar(true)} 
          className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-orange-500 transition-all shadow-xs cursor-pointer shrink-0"
          aria-label="View Calendar Schedule"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
      </div>

      {/* Status Filter Pills (All Exam filter removed per user instructions) */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between overflow-hidden">
        <div className="flex flex-nowrap overflow-x-auto gap-1 scrollbar-none w-full">
          {[{ id: 'All', label: 'All Classes' }, { id: 'active', label: 'Approved' }, { id: 'pending_tutor_consent', label: 'Pending Consent' }, { id: 'postponed', label: 'Postponed' }].map((status) => (
            <button
              key={status.id}
              onClick={() => setSelectedStatus(status.id)}
              className={`flex-1 min-w-[76px] px-2.5 py-2 text-[9px] font-black uppercase tracking-wider rounded-xl border transition-all text-center whitespace-nowrap cursor-pointer ${
                selectedStatus === status.id
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Week Selector Strip with Dates for the Tutor */}
      <div className="space-y-4">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedDay('All')}
            className={`px-3 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-wider whitespace-nowrap border-2 cursor-pointer flex flex-col items-center justify-center min-w-[68px] ${
              selectedDay === 'All'
                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
            }`}
          >
            <span>All</span>
            <span className={`text-[9px] font-bold mt-0.5 ${selectedDay === 'All' ? 'text-slate-300' : 'text-slate-400'}`}>
              Week
            </span>
          </button>
          {daysList.map((day) => {
            const daySessionsCount = activeClasses.filter(s => s.day === day).length;
            const dateNum = getWeekDateForDay(day);
            const isSelected = selectedDay === day;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-2.5 py-2 rounded-xl transition-all border-2 cursor-pointer flex flex-col items-center justify-between min-w-[62px] ${
                  isSelected
                    ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-100'
                    : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                }`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                  {day.slice(0, 3)}
                </span>
                <span className={`text-sm font-black font-mono my-0.5 ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                  {dateNum}
                </span>
                <span className={`text-[8px] font-extrabold uppercase ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                  {daySessionsCount} {daySessionsCount === 1 ? 'Period' : 'Periods'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <CalendarView isOpen={showCalendar} onClose={() => setShowCalendar(false)} slots={myClasses} title="My Teaching Schedule" />

      {pendingClasses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Approval Pending</h3>
             </div>
             <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">{pendingClasses.length} Action Required</span>
          </div>
          <div className="space-y-3">
            {pendingClasses.map((cls) => (
              <div key={cls.id} onClick={() => { setViewingSession(cls); setTutorTopic(cls.topic || ''); setActionType('none'); setHasConsented(false); }} className="bg-amber-50/50 rounded-2xl border border-amber-100 p-5 relative overflow-hidden group hover:bg-amber-50 transition-all cursor-pointer shadow-sm active:scale-[0.99]">
                 <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                       <div className="flex items-center space-x-2 mb-1.5">
                          <span className="text-[10px] font-black text-amber-700 uppercase">{cls.day}, {new Date(cls.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                          <span className="text-[10px] text-slate-400 font-bold">•</span>
                          <span className="text-[10px] font-black text-slate-500 uppercase">{formatTimeRangeAMPM(cls.time)}</span>
                       </div>
                       <h4 className="text-sm font-black text-slate-900 leading-tight">{cls.subject}</h4>
                       <div className="flex items-center space-x-2 mt-3">
                          <span className="text-[9px] font-black text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-lg uppercase tracking-widest">Awaiting Consent</span>
                       </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-amber-200 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
                       <ChevronRight className="w-5 h-5" />
                    </div>
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myClasses.length === 0 ? (
        <div className="py-12 px-6 bg-orange-50 rounded-3xl border border-orange-100 text-center space-y-3">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Info className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="font-black text-slate-900">No Classes Found</h3>
          <p className="text-xs text-slate-500 font-medium max-w-[240px] mx-auto leading-relaxed">You haven't been assigned to any classes yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {daysList.filter((day) => selectedDay === 'All' || selectedDay === day).map((day) => {
            const daySessions = activeClasses.filter(s => s.day === day);
            if (daySessions.length === 0) return null;
            return (
              <div key={day} className="space-y-3">
                <div className="flex items-center space-x-2 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{day}</h3>
                </div>
                <div className="space-y-4">
                  {daySessions.map((cls) => {
                    const finished = isFinished(cls.time, cls.date);
                    const inSession = isInSession(cls.time, cls.date);
                    const isRequested = cls.status === 'postponed';

                    return (
                      <React.Fragment key={cls.id}>
                        {daySessions.indexOf(cls) > 0 && (
                          <div className="relative py-8">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                              <div className="w-full border-t-8 border-slate-200" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-slate-900 px-6 text-[10px] font-black text-white uppercase tracking-[0.2em] rounded-full py-1.5 shadow-sm">Next Period</span>
                            </div>
                          </div>
                        )}
                        <div key={cls.id} onClick={() => { setViewingSession(cls); setTutorTopic(cls.topic || ''); setActionType('none'); }} className="relative bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden group active:scale-[0.98] transition-all cursor-pointer">
                          {/* Top Right Status Tags (Tutor Only) */}
                          {!finished && (inSession || isNextUp(cls.time, cls.date)) && (
                            <div className="absolute top-4 right-4 flex items-center space-x-1">
                              {cls.status === 'active' && (
                                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-xs">
                                  Approval
                                </span>
                              )}
                              {cls.status === 'pending_tutor_consent' && (
                                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 shadow-xs">
                                  Pending
                                </span>
                              )}
                              {isRequested && (
                                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-orange-100 text-orange-700 border border-orange-200 shadow-xs">
                                  Postpone
                                </span>
                              )}
                            </div>
                          )}

                          <div className="p-5 flex flex-col space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                {inSession ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-white shadow-sm animate-pulse border-2 border-emerald-400">
                                    ● In-Session
                                  </span>
                                ) : finished ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-400 text-white border-2 border-slate-300">
                                    Completed
                                  </span>
                                ) : isNextUp(cls.time, cls.date) ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-600 text-white border-2 border-blue-500 shadow-sm">
                                    Next Up
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          <div>
                            <div className="flex items-center space-x-2 mb-1.5 px-0.5">
                              <span className={`text-[10px] font-black uppercase ${finished ? 'text-slate-400' : 'text-orange-600'}`}>{new Date(cls.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                            <h4 className={`text-lg font-black tracking-tight leading-tight ${finished ? 'text-slate-400' : 'text-slate-900'}`}>{cls.subject}</h4>
                            <div className="flex flex-wrap items-center gap-4 mt-3">
                              <div className={`flex items-center space-x-2 ${finished ? 'text-slate-400' : 'text-slate-600'}`}>
                                <Clock className={`w-3.5 h-3.5 ${finished ? 'text-slate-300' : 'text-orange-500'}`} />
                                <span className="text-xs font-black">{formatTimeRangeAMPM(cls.time)}</span>
                              </div>
                              <div className={`flex items-center space-x-2 ${finished ? 'text-slate-400' : 'text-slate-600'}`}>
                                <MapPin className={`w-3.5 h-3.5 ${finished ? 'text-slate-300' : 'text-blue-500'}`} />
                                <span className="text-xs font-black">{cls.room}</span>
                              </div>
                            </div>
                          </div>
                          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                            <button className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-colors">View Details</button>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewingSession && (() => {
        const finished = isFinished(viewingSession.time, viewingSession.date);
        const inSession = isInSession(viewingSession.time, viewingSession.date);

        return (
          <div className="fixed inset-0 z-[110] overflow-y-auto p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col relative">
               <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-3">
                     <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                        <Clock className="w-5 h-5" />
                     </div>
                     <div>
                        <h3 className="text-lg font-black text-slate-900 leading-tight">Class Details</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{viewingSession.day}, {new Date(viewingSession.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                     </div>
                  </div>
                  <button onClick={() => setViewingSession(null)} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                     <X className="w-5 h-5 text-slate-400" />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                     <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subject</span>
                        <p className="text-sm font-black text-slate-900">{viewingSession.subject}</p>
                     </div>
                     {viewingSession.status === 'pending_tutor_consent' && !viewingSession.topic ? (
                        <div>
                           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Lesson Topic <span className="text-rose-500 font-black">* MANDATORY</span></label>
                           <input type="text" value={tutorTopic} onChange={(e) => setTutorTopic(e.target.value)} placeholder="What will you be teaching?" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-orange-500" />
                        </div>
                     ) : (
                        <div>
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Topic</span>
                           <p className="text-xs font-bold text-slate-700 bg-white/50 border border-slate-100 rounded-xl px-3 py-2 italic">{viewingSession.topic || tutorTopic || 'No topic specified.'}</p>
                        </div>
                     )}
                     <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-2">
                           <Clock className="w-3.5 h-3.5 text-orange-500" />
                           <span className="text-xs font-black text-slate-700">{formatTimeRangeAMPM(viewingSession.time)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                           <MapPin className="w-3.5 h-3.5 text-blue-500" />
                           <span className="text-xs font-black text-slate-700">{viewingSession.room || 'No Room'}</span>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="pt-4 border-t border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Schedule Status</span>
                         <div className={`p-3 rounded-xl border-2 flex items-center justify-between shadow-sm ${
                            inSession ? 'bg-emerald-600 border-emerald-500 text-white' : 
                            finished ? 'bg-slate-400 border-slate-300 text-white' : 
                            isNextUp(viewingSession.time, viewingSession.date) ? 'bg-blue-600 border-blue-500 text-white' : 
                            viewingSession.status === 'pending_tutor_consent' ? 'bg-amber-500 border-amber-400 text-white' : 
                            'bg-orange-600 border-orange-500 text-white'
                         }`}>
                            <div className="flex items-center space-x-2">
                               <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-xs ${
                                  (inSession || viewingSession.status === 'pending_tutor_consent') ? 'animate-pulse' : ''
                               }`} />
                               <span className="text-[11px] font-black uppercase">
                                 {inSession ? 'In-Session' : 
                                  finished ? 'Completed' : 
                                  isNextUp(viewingSession.time, viewingSession.date) ? 'Next Up' : 
                                  viewingSession.status === 'pending_tutor_consent' ? 'Pending Consent' : 
                                  'Postponed'}
                               </span>
                            </div>
                         </div>
                     </div>

                     {!isFinished(viewingSession.time, viewingSession.date) && actionType === 'none' && (
                        <div className="space-y-4">
                           {viewingSession.status === 'pending_tutor_consent' && (
                             <label className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                                <input type="checkbox" checked={hasConsented} onChange={(e) => setHasConsented(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                                <span className="text-[11px] font-black text-slate-700 uppercase">I consent to this schedule</span>
                             </label>
                           )}
                           
                           {hasConsented && viewingSession.status === 'pending_tutor_consent' ? (
                              <button disabled={isProcessing || (!viewingSession.topic && !tutorTopic.trim())} onClick={handleConsent} className="w-full py-4 bg-[#EA580C] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-orange-200 disabled:opacity-50">
                                {isProcessing ? 'Processing...' : 'Approve Class'}
                              </button>
                           ) : (
                              <button disabled={isProcessing} onClick={() => setActionType('postpone')} className="w-full py-3 bg-amber-50 border border-amber-200 text-amber-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-amber-100 transition-all">Request for a postponement</button>
                           )}
                        </div>
                     )}
                     {actionType !== 'none' && (
                        <div className="space-y-4 animate-in slide-in-from-top-2">
                           <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Reason for postponement <span className="text-rose-500">*</span></label>
                              <textarea value={actionReason || ''} onChange={(e) => setActionReason(e.target.value)} placeholder="Why are you requesting for a postponement?" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-orange-500 h-24" />
                           </div>
                           <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => setActionType('none')} className="py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest">Back</button>
                              <button disabled={isProcessing || !actionReason.trim()} onClick={handleStatusAction} className="py-3 rounded-xl text-white font-black text-[10px] uppercase tracking-widest shadow-md bg-amber-500 shadow-amber-100 disabled:opacity-50">
                                {isProcessing ? 'Processing...' : 'Confirm Request'}
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      );
    })()}
    </div>
  );
};
