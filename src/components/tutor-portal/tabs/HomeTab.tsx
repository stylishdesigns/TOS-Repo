import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor } from '../../../types';
import {
  Calendar,
  Clock,
  BookOpen,
  ChevronRight,
  Star
} from 'lucide-react';
import { CalendarView } from '../../common/CalendarView';
import { TutorHistoryView } from './TutorHistoryView';
import { slotsToActivities } from '../../../lib/planner';
import { useScrollLock } from '../../../hooks/useScrollLock';

interface HomeTabProps {
  tutor: Tutor;
  onNavigateTab: (tab: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ tutor, onNavigateTab }) => {
  const { timetable, settings, plannerReminders, addPlannerReminder, removePlannerReminder, updatePlannerReminder } = useApp();
  const [showSchedule, setShowSchedule] = useState(false);
  const [showRatings, setShowRatings] = useState(false);
  useScrollLock(showSchedule);
  useScrollLock(showRatings);

  // Filter classes for this tutor
  const myClasses = timetable.filter(slot =>
    slot.tutorId === tutor.id ||
    slot.tutorName.toLowerCase() === tutor.name.toLowerCase()
  );

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Current week range (Monday to Sunday), the same window the Classes tab uses
  const weekRange = (() => {
    const currentDayOfWeek = now.getDay();
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  })();

  // Get today's active classes
  const todayClasses = myClasses
    .filter(c => c.date === todayStr && (c.status === 'active' || !c.status))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  // Get upcoming classes if none today
  const upcomingClasses = myClasses
    .filter(c => c.date > todayStr && (c.status === 'active' || !c.status))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))
    .slice(0, 3);

  const displayClasses = todayClasses.length > 0 ? todayClasses : upcomingClasses;
  const classSectionTitle = todayClasses.length > 0 ? "Today's Classes" : "Upcoming Classes";

  // Real count of this tutor's classes in the current week
  const weekCount = myClasses.filter(c => {
    if (!(c.status === 'active' || !c.status)) return false;
    if (!c.date) return true;
    const d = new Date(c.date + 'T00:00:00');
    return d >= weekRange.monday && d <= weekRange.sunday;
  }).length;

  // The next class still ahead of us today
  const nextClass = todayClasses.find(c => {
    const start = c.startTime || (c.time || '').split(' - ')[0];
    if (!start || !start.includes(':')) return false;
    const [h, m] = start.split(':').map(Number);
    const t = new Date();
    t.setHours(h, m || 0, 0, 0);
    return t.getTime() >= now.getTime() - 5 * 60 * 1000;
  });

  // Classes still awaiting the tutor's consent
  const pendingCount = myClasses.filter(c => c.status === 'pending_tutor_consent').length;

  const formatTimeAMPM = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="space-y-4 px-4 py-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. Tutor Profile Greeting Card: photo, greeting, date */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--brand,#EA580C)] text-[var(--on-brand,#fff)] p-6 shadow-lg shadow-black/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

        <div className="relative z-10 flex items-center space-x-4">
          {tutor.avatar ? (
            <img
              src={tutor.avatar}
              alt={tutor.name}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-white/40 shadow-lg shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
              {tutor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight leading-tight">
              Hello, {tutor.name.split(' ')[0]}!
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-90 mt-1 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              <span>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </p>
            <p className="text-[11px] font-medium opacity-75 mt-1">
              {tutor.department || 'Academics'} • {settings.academicSession}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Quick Stats: real numbers only, no student totals */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigateTab('classes')}
          className="bg-slate-900 rounded-2xl p-5 text-white text-left shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-all"
        >
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl" />
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white/80" />
            </div>
            <Calendar className="w-3.5 h-3.5 text-white/50" />
          </div>
          <p className="text-3xl font-black tracking-tighter">{weekCount}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Classes This Week</p>
        </button>

        <button
          onClick={() => setShowRatings(true)}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs text-left group hover:scale-[1.02] hover:border-amber-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          </div>
          <p className="text-3xl font-black tracking-tighter text-slate-900">{tutor.rating?.toFixed(1) || '0.0'}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Tutor Rating</p>
        </button>
      </div>

      {/* 3. Next Class Banner */}
      {nextClass && (
        <button
          onClick={() => onNavigateTab('classes')}
          className="w-full flex items-center justify-between p-4 bg-slate-900 rounded-2xl text-white shadow-lg group hover:scale-[1.01] transition-all"
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-white/80" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Next Class Today</p>
              <p className="text-sm font-black truncate">
                {nextClass.subject} · {formatTimeAMPM(nextClass.startTime || nextClass.time.split(' - ')[0])}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
        </button>
      )}

      {/* 4. Consent needed banner */}
      {pendingCount > 0 && (
        <button
          onClick={() => onNavigateTab('classes')}
          className="w-full flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl group hover:scale-[1.01] transition-all"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div className="text-left min-w-0">
              <p className="text-sm font-black text-amber-900">{pendingCount} {pendingCount === 1 ? 'class' : 'classes'} awaiting your consent</p>
              <p className="text-[10px] font-bold text-amber-700">Review the schedule and confirm</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-all shrink-0" />
        </button>
      )}

      {/* 5. Dynamic Classes Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">{classSectionTitle}</h3>
          <button
            onClick={() => onNavigateTab('classes')}
            className="text-[11px] font-bold text-[var(--brand,#EA580C)] hover:underline"
          >
            Full Timetable
          </button>
        </div>

        <div className="space-y-3">
          {displayClasses.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center space-y-2">
              <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <Calendar className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-xs font-bold text-slate-400">No scheduled classes found.</p>
            </div>
          ) : (
            displayClasses.map((cls) => (
              <div
                key={cls.id}
                onClick={() => onNavigateTab('classes')}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-[var(--brand,#EA580C)] transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 leading-tight">{cls.subject}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTimeAMPM(cls.startTime || cls.time.split(' - ')[0])}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">•</span>
                      <span className="text-[10px] font-bold text-slate-500">{cls.room || 'No Room'}</span>
                      {cls.date !== todayStr && (
                        <>
                          <span className="text-[10px] font-bold text-slate-400">•</span>
                          <span className="text-[10px] font-black text-[var(--brand,#EA580C)] uppercase">
                            {new Date(cls.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[var(--brand,#EA580C)] group-hover:translate-x-1 transition-all" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. My Schedule: the teaching calendar moved here from the Classes header */}
      <div className="space-y-4">
        <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider px-1">My Schedule</h3>
        <button
          onClick={() => setShowSchedule(true)}
          className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:border-[var(--brand,#EA580C)] shadow-xs transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">Teaching Calendar</p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">Open your full schedule and planner</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[var(--brand,#EA580C)] group-hover:translate-x-1 transition-all" />
        </button>
      </div>

      <CalendarView
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        activities={[...slotsToActivities(myClasses), ...plannerReminders]}
        title="My Teaching Schedule"
        onAddActivity={addPlannerReminder}
        onRemoveActivity={removePlannerReminder}
        onEditActivity={updatePlannerReminder}
      />

      {/* 6. Tutor Ratings splash: the full history opens as a bottom sheet */}
      <style>{`@keyframes tosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}.tos-sheet-up{animation:tosSheetUp .28s cubic-bezier(.22,1,.36,1)}`}</style>
      {showRatings && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowRatings(false)} />
          <div className="absolute bottom-0 left-0 right-0 top-[8vh]">
            <div className="h-full max-w-md mx-auto bg-white rounded-t-[28px] overflow-hidden shadow-2xl tos-sheet-up flex flex-col">
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mt-2.5 shrink-0" />
              <div className="flex-1 overflow-y-auto">
                <TutorHistoryView tutor={tutor} onBack={() => setShowRatings(false)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
