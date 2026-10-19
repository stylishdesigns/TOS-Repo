import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { Student, TimetableSlot } from '../../../types';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  X,
  Star,
  Sparkles,
  ArrowRight,
  BookOpen,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { StudyMaterialsSection } from './classes/StudyMaterialsSection';
import { ClassRatingSheet } from './classes/ClassRatingSheet';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';

interface TimetableTabProps {
  student: Student;
}

const DAYS: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const TimetableTab: React.FC<TimetableTabProps> = ({ student }) => {
  const { timetable, classRatings } = useApp();
  const [activeSection, setActiveSection] = useState<'timetable' | 'materials'>('timetable');

  const [viewingSession, setViewingSession] = useState<TimetableSlot | null>(null);
  const [ratingSlot, setRatingSlot] = useState<TimetableSlot | null>(null);

  // Find today's day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[new Date().getDay()] as any;
  const initialDay = DAYS.includes(todayName) ? todayName : 'Monday';

  const [selectedDay, setSelectedDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>(initialDay);
  const [subjectFilter, setSubjectFilter] = useState<string>('All');

  // Compute current week range (Monday 00:00:00 to Sunday 23:59:59.999)
  const currentWeekRange = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  }, []);

  // Filter timetable for CURRENT WEEK only and only active classes (syncs with Admin view)
  const activeTimetable = useMemo(() => {
    return (timetable || []).filter((s) => {
      const isActive = s.status === 'active' || !s.status;
      if (!isActive) return false;
      if (s.date) {
        const slotDate = new Date(s.date + 'T00:00:00');
        return slotDate >= currentWeekRange.monday && slotDate <= currentWeekRange.sunday;
      }
      return true;
    });
  }, [timetable, currentWeekRange]);

  const daySlots = useMemo(() => {
    return activeTimetable.filter((slot) => slot.day === selectedDay);
  }, [activeTimetable, selectedDay]);

  // Reactive class ratings for this student directly from AppContext Firestore listener
  const studentId = student.id || student.uid;
  const ratingsMap = useMemo(() => {
    const map: Record<string, number> = {};
    (classRatings || []).forEach((r) => {
      if (r.studentId === studentId && r.slotId && typeof r.stars === 'number') {
        map[r.slotId] = r.stars;
      }
    });
    return map;
  }, [classRatings, studentId]);

  // Time conversion and comparison helpers
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
    return `${formatTimeAMPM(start)} – ${formatTimeAMPM(end)}`;
  };

  const parseTo24H = (timeStr: string) => {
    if (!timeStr) return '00:00';
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

  // Compute date number for each day of the current week (Monday - Saturday)
  const getWeekDateForDay = (targetDay: string): number => {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

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
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + offset);
    return targetDate.getDate();
  };

  // Find "Next class" today (Live now, or next upcoming today)
  const nextClassToday = useMemo(() => {
    const todaySlots = activeTimetable.filter((s) => s.day === todayName);
    const live = todaySlots.find((s) => isInSession(s.time, s.date));
    if (live) {
      return { slot: live, isLive: true, minutesUntilStart: 0 };
    }

    const upcoming = todaySlots
      .filter((s) => isNextUp(s.time, s.date))
      .sort((a, b) => {
        const aTime = parseTo24H(a.time.split(' - ')[0]);
        const bTime = parseTo24H(b.time.split(' - ')[0]);
        return aTime.localeCompare(bTime);
      });

    if (upcoming.length > 0) {
      const nextOne = upcoming[0];
      const start24 = parseTo24H(nextOne.time.split(' - ')[0]);
      const startDateTime = getLocalDateTime(nextOne.date, start24);
      const diffMs = startDateTime.getTime() - Date.now();
      const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
      return { slot: nextOne, isLive: false, minutesUntilStart: diffMinutes };
    }

    return null;
  }, [activeTimetable, todayName]);

  // Available subjects for filtering on selected day
  const allSubjects = Array.from(new Set(daySlots.map((s) => s.subject)));

  const filteredSlots = daySlots.filter((slot) => {
    if (subjectFilter === 'All') return true;
    return slot.subject === subjectFilter;
  });

  return (
    <div className="space-y-4 px-4 py-3 max-w-lg mx-auto pb-20 animate-in fade-in duration-300">
      {/* 1. Switch at top: "Timetable | Study Materials" */}
      <div className="bg-white rounded-[14px] p-1 border border-[#E2E8F0] shadow-2xs grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setActiveSection('timetable')}
          className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
            activeSection === 'timetable'
              ? 'bg-[#0F172A] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          Timetable
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('materials')}
          className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
            activeSection === 'materials'
              ? 'bg-[#0F172A] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          Study Materials
        </button>
      </div>

      {activeSection === 'materials' ? (
        <StudyMaterialsSection
          student={student}
          onSwitchToTimetable={() => setActiveSection('timetable')}
        />
      ) : (
        <>
          {/* Header Banner */}
          <div className="pt-1">
            <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-wider block">
              {student.name} · {student.programmeName || 'Academic Schedule'}
            </span>
            <h2 className="text-xl font-black text-[#0F172A] tracking-tight">
              Classes & Lectures
            </h2>
          </div>

          {/* 2. Week Strip: 7 days Mon - Sun */}
          <div className="grid grid-cols-7 gap-1.5 pb-1">
            {DAYS.map((day) => {
              const isSelected = selectedDay === day;
              const dateNumber = getWeekDateForDay(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setSubjectFilter('All');
                  }}
                  className={`py-2 px-1 rounded-[20px] text-center transition-all border cursor-pointer flex flex-col items-center justify-between min-h-[64px] active:scale-95 ${
                    isSelected
                      ? 'bg-[#C2410C] text-white border-[#C2410C] shadow-sm'
                      : 'bg-white text-slate-800 border-[#E2E8F0] hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`text-[11px] block font-bold ${
                      isSelected ? 'text-orange-100' : 'text-slate-500'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </span>
                  <span
                    className={`text-base block font-black font-mono tabular-nums mt-0.5 ${
                      isSelected ? 'text-white' : 'text-[#0F172A]'
                    }`}
                  >
                    {dateNumber}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3. Next Class Card (Dark Aesthetic Card below the days) - Only shown on current day */}
          {selectedDay === todayName && nextClassToday && (
            <div
              className="rounded-[24px] p-5 bg-[#0F172A] border border-[#334155] text-white space-y-3.5 shadow-xl animate-in fade-in duration-300"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-300">
                  NEXT CLASS
                </span>

                {nextClassToday.isLive ? (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Live now</span>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold font-mono bg-[#3E2319] border border-[#8C3A16] text-[#FB923C] tabular-nums">
                    Starts in {nextClassToday.minutesUntilStart} min
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-2xl font-black text-white tracking-tight leading-snug">
                  {nextClassToday.slot.subject}
                  {nextClassToday.slot.topic ? ` · ${nextClassToday.slot.topic}` : ''}
                </h3>
                <p className="text-xs text-slate-300 font-medium mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono tabular-nums">
                    {formatTimeRangeAMPM(nextClassToday.slot.time)}
                  </span>
                  {nextClassToday.slot.room && (
                    <>
                      <span className="text-slate-500">·</span>
                      <span>{nextClassToday.slot.room}</span>
                    </>
                  )}
                  {nextClassToday.slot.tutorName && (
                    <>
                      <span className="text-slate-500">·</span>
                      <span>{nextClassToday.slot.tutorName}</span>
                    </>
                  )}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setViewingSession(nextClassToday.slot)}
                  className="w-full h-11 rounded-2xl bg-white hover:bg-slate-100 active:scale-98 text-[#0F172A] font-extrabold text-sm transition-all flex items-center justify-center cursor-pointer shadow-sm"
                >
                  Class details
                </button>
              </div>
            </div>
          )}

          {/* Section Header with Day Name & Periods count */}
          <div className="flex items-center justify-between px-0.5 pt-1">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#0F172A]">
              {selectedDay === todayName ? 'TODAY' : selectedDay.toUpperCase()}
            </h3>
            <span className="text-[11px] font-extrabold text-[#C2410C] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              {filteredSlots.length} {filteredSlots.length === 1 ? 'Period' : 'Periods'}
            </span>
          </div>

          {/* Subject Filter Carousel (if more than 1 subject on this day) */}
          {allSubjects.length > 1 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSubjectFilter('All')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  subjectFilter === 'All'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({daySlots.length})
              </button>
              {allSubjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubjectFilter(sub)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    subjectFilter === sub
                      ? 'bg-[#EA580C] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* 4. Timetable Session Cards (Bigger, refined & aesthetic) */}
          <div className="space-y-3.5">
            {filteredSlots.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-2">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Lectures Scheduled</h4>
                <p className="text-xs text-slate-500">
                  No classes scheduled for {selectedDay}. Enjoy your study and revision session!
                </p>
              </div>
            ) : (
              filteredSlots.map((slot) => {
                const finished = isFinished(slot.time, slot.date);
                const nextUp = isNextUp(slot.time, slot.date);
                const rating = ratingsMap[slot.id];
                const parts = slot.time ? slot.time.split(' - ') : ['', ''];
                const startTimeOnly = formatTimeAMPM(parseTo24H(parts[0])).replace(' ', '');
                const endTimeOnly = parts[1] ? formatTimeAMPM(parseTo24H(parts[1])).replace(' ', '') : '';

                return (
                  <div
                    key={slot.id}
                    onClick={() => setViewingSession(slot)}
                    className={`bg-white rounded-[22px] p-4.5 sm:p-5 min-h-[82px] transition-all relative overflow-hidden cursor-pointer active:scale-[0.99] flex items-center justify-between gap-4 ${
                      nextUp
                        ? 'border-2 border-[#C2410C] shadow-md shadow-orange-500/5'
                        : 'border border-[#E2E8F0] shadow-2xs hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Time on left */}
                    <div className="w-16 shrink-0 flex flex-col justify-center">
                      <span
                        className={`text-base font-black font-mono tabular-nums leading-none ${
                          nextUp ? 'text-[#C2410C]' : 'text-slate-900'
                        }`}
                      >
                        {startTimeOnly}
                      </span>
                      {endTimeOnly && (
                        <span className="text-[11px] font-bold font-mono text-slate-400 mt-1">
                          to {endTimeOnly}
                        </span>
                      )}
                    </div>

                    {/* Middle: Subject, topic, room and tutor */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="text-[15px] font-extrabold text-[#0F172A] truncate tracking-tight">
                        {slot.subject}
                        {slot.topic ? ` · ${slot.topic}` : ''}
                      </h4>

                      <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium truncate">
                        {slot.room && (
                          <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/60 text-slate-600 text-[11px] font-medium">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{slot.room}</span>
                          </span>
                        )}
                        {slot.tutorName && (
                          <span className="inline-flex items-center gap-1 text-slate-500 text-[11px] font-medium truncate">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{slot.tutorName}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Tag on Right */}
                    <div className="shrink-0">
                      {finished ? (
                        typeof rating === 'number' ? (
                          <span className="px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-2xs">
                            <Star className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                            <span>Done</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRatingSlot(slot);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[#FFF7ED] border border-[#FFEDD5] text-[#C2410C] font-extrabold text-xs flex items-center gap-1.5 hover:bg-orange-100 transition-colors shadow-2xs cursor-pointer active:scale-95"
                          >
                            <Star className="w-4 h-4 fill-[#C2410C] text-[#C2410C]" />
                            <span>Rate class</span>
                          </button>
                        )
                      ) : nextUp ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-black font-mono bg-orange-50 text-[#C2410C] border border-orange-200 shadow-2xs">
                          Next
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                          Later
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 5. Study Materials Nudge Card under the list */}
          <div
            onClick={() => {
              setActiveSection('materials');
            }}
            className="bg-[#FFF7ED] border border-[#FED7AA] rounded-[20px] p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-orange-100/70 transition-all shadow-2xs group mt-2"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#FFEDD5] flex items-center justify-center text-[#C2410C] shrink-0">
              <BookOpen className="w-5 h-5 text-[#C2410C]" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-extrabold text-[#0F172A] truncate">
                Prepare for {nextClassToday?.slot.subject || 'your upcoming classes'}
              </h4>
              <p className="text-[11px] font-semibold text-[#C2410C] truncate mt-0.5">
                Review lecture notes & handouts uploaded by your tutors
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#C2410C] shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </>
      )}

      {/* Existing Class Details Modal (kept intact) */}
      {viewingSession && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 overflow-y-auto p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">
                    Class Info
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {viewingSession.day},{' '}
                    {new Date(viewingSession.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingSession(null)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="pt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  Schedule Status
                </span>
                {(() => {
                  const finished = isFinished(viewingSession.time, viewingSession.date);
                  const inSession = isInSession(viewingSession.time, viewingSession.date);

                  return (
                    <div
                      className={`p-3 rounded-xl border-2 flex items-center justify-between shadow-sm ${
                        inSession
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : finished
                          ? 'bg-slate-400 border-slate-300 text-white'
                          : 'bg-blue-600 border-blue-500 text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <div
                          className={`w-2.5 h-2.5 rounded-full bg-white shadow-xs ${
                            inSession ? 'animate-pulse' : ''
                          }`}
                        />
                        <span className="text-[11px] font-black uppercase">
                          {inSession ? 'In-Session' : finished ? 'Completed' : 'Next Up'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Subject
                  </span>
                  <p className="text-sm font-black text-slate-900">
                    {viewingSession.subject}
                  </p>
                </div>
                {viewingSession.topic && (
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Topic
                    </span>
                    <p className="text-xs font-bold text-slate-700 bg-white/50 border border-slate-100 rounded-xl px-3 py-2 italic">
                      {viewingSession.topic}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Time
                    </span>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-black text-slate-800">
                        {formatTimeRangeAMPM(viewingSession.time)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Room
                    </span>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-black text-slate-800">
                        {viewingSession.room || 'No Room'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Tutor
                  </span>
                  <p className="text-sm font-black text-slate-900">
                    {viewingSession.tutorName}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <User className="w-5 h-5" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingSession(null)}
                className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-100 mt-4 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part 3: Class Rating Sheet */}
      {ratingSlot && (
        <ClassRatingSheet
          slot={ratingSlot}
          studentId={student.id || student.uid || ''}
          onClose={() => setRatingSlot(null)}
          onRatingSaved={() => {
            // Handled reactively via AppContext real-time classRatings listener
          }}
        />
      )}
    </div>
  );
};
