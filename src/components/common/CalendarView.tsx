import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, MapPin, GraduationCap } from 'lucide-react';
import { TimetableSlot } from '../../types';
import { useScrollLock } from '../../hooks/useScrollLock';

interface CalendarViewProps {
  isOpen: boolean;
  onClose: () => void;
  slots: TimetableSlot[];
  title?: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ isOpen, onClose, slots, title = "Timetable Calendar" }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month); // 0 (Sun) to 6 (Sat)
  
  // Adjust startDay to match Monday-start if desired, but 0-indexed Sunday is standard.
  // The user didn't specify start day, I'll stick to standard Sunday start.

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthName = currentMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' });

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Map slots to days
  const slotsByDate: Record<string, TimetableSlot[]> = {};
  slots.forEach(slot => {
    const dateKey = slot.date; // YYYY-MM-DD
    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
    slotsByDate[dateKey].push(slot);
  });

  const renderDays = () => {
    const calendarDays = [];
    const prevMonthDays = daysInMonth(year, month - 1);

    // Empty days from prev month
    for (let i = startDay - 1; i >= 0; i--) {
      calendarDays.push(
        <div key={`prev-${i}`} className="min-h-[100px] bg-slate-50/50 p-2 border border-slate-100 opacity-30">
          <span className="text-[10px] font-bold text-slate-400">{prevMonthDays - i}</span>
        </div>
      );
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySlots = slotsByDate[dateStr] || [];
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      calendarDays.push(
        <div key={d} className={`min-h-[100px] p-2 border border-slate-100 hover:bg-slate-50 transition-colors ${isToday ? 'bg-orange-50/30 ring-1 ring-orange-200 ring-inset' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold ${isToday ? 'bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-slate-400'}`}>{d}</span>
          </div>
          <div className="space-y-1">
            {daySlots.slice(0, 3).map((slot) => (
              <div key={slot.id} className={`p-1 rounded text-[8px] font-bold truncate border ${
                slot.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                slot.status === 'pending_tutor_consent' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                {slot.startTime || slot.time.split('-')[0].trim()} - {slot.subject}
              </div>
            ))}
            {daySlots.length > 3 && (
              <div className="text-[7px] font-black text-slate-400 text-center uppercase tracking-tighter">
                + {daySlots.length - 3} more periods
              </div>
            )}
          </div>
        </div>
      );
    }

    return calendarDays;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Interactive Monthly Schedule</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-slate-100 rounded-xl p-1">
              <button onClick={prevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-4 text-xs font-black text-slate-900 min-w-[140px] text-center uppercase">{monthName}</span>
              <button onClick={nextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-600">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <button onClick={onClose} className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          <div className="grid grid-cols-7 gap-px">
            {dayLabels.map(day => (
              <div key={day} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-2">
                {day}
              </div>
            ))}
            {renderDays()}
          </div>
        </div>

        {/* Legend */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-center space-x-6 text-[10px] font-black uppercase tracking-widest shrink-0">
           <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <span className="text-slate-500">Active</span>
           </div>
           <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <span className="text-slate-500">Pending Consent</span>
           </div>
           <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
              <span className="text-slate-500">Cancelled / Postponed</span>
           </div>
        </div>
      </div>
    </div>
  );
};
