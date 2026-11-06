import React from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor } from '../../../types';
import { 
  Calendar, 
  Users, 
  Clock, 
  Award, 
  BookOpen, 
  TrendingUp, 
  ChevronRight,
  Bell,
  Star
} from 'lucide-react';

interface HomeTabProps {
  tutor: Tutor;
  onNavigateTab: (tab: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ tutor, onNavigateTab }) => {
  const { students, settings, timetable, centreName } = useApp();

  // Filter classes for this tutor
  const myClasses = timetable.filter(slot => 
    slot.tutorId === tutor.id || 
    slot.tutorName.toLowerCase() === tutor.name.toLowerCase()
  );

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

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

  const formatTimeAMPM = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="space-y-4 px-4 py-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Tutorial Name on Top */}
      <div className="text-center pb-1">
        <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          {centreName}
        </h1>
      </div>

      {/* 1. Tutor Profile Greeting Card (Redesigned) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#EA580C] text-white p-6 shadow-xl shadow-orange-200">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white font-black text-2xl shadow-lg">
              {tutor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="flex items-center space-x-1.5 opacity-90">
                <span className="text-[10px] font-bold uppercase tracking-wider">Tutor Portal</span>
              </div>
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
          {/* Notification bell will be moved to header, so hiding it here for now or keeping it as user might prefer it in header instead of card */}
        </div>
      </div>

      {/* 2. Quick Stat Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-all">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-orange-500/10 rounded-full blur-xl" />
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-orange-400" />
            </div>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-3xl font-black tracking-tighter">{students.length}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Total Students</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs group hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          </div>
          <p className="text-3xl font-black tracking-tighter text-slate-900">{tutor.rating?.toFixed(1) || '0.0'}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Tutor Rating</p>
        </div>
      </div>

      {/* 3. Dynamic Classes Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">{classSectionTitle}</h3>
          <button 
            onClick={() => onNavigateTab('classes')}
            className="text-[11px] font-bold text-orange-600 hover:underline"
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
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-orange-400 transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-105 transition-transform">
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
                          <span className="text-[10px] font-black text-orange-600 uppercase">
                            {new Date(cls.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Assessment (Replacing Instructor Toolkit) */}
      <div className="space-y-4">
        <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider px-1">Upcoming Assessment</h3>
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={() => onNavigateTab('grading')}
            className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 hover:border-orange-300 shadow-xs transition-all group"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0">
                <Award className="w-6 h-6 text-orange-500" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Grading</p>
                <p className="text-sm font-black text-slate-900">Weekly Performance Test</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Due in 2 days • 24 Students Pending</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </div>
    </div>
  );
};
