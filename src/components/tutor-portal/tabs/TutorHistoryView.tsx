import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor, TimetableSlot } from '../../../types';
import { ArrowLeft, Star, TrendingUp, Info } from 'lucide-react';
import { ModernSelect } from '../../ui/ModernSelect';

interface TutorHistoryViewProps {
  tutor: Tutor;
  onBack: () => void;
}

export const TutorHistoryView: React.FC<TutorHistoryViewProps> = ({ tutor, onBack }) => {
  const { timetable, programmes, getTutorRatingStats, getClassRatingStats } = useApp();

  // Generate weeks dynamically
  const generateWeeks = () => {
    const weeksList: string[] = [];
    const now = new Date();
    let current = new Date(now);
    current.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - 28);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 90);

    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekStart.getDate() + 6);
      const range = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      weeksList.push(range);
      current.setDate(current.getDate() + 7);
    }
    return weeksList;
  };

  const weeks = useMemo(() => generateWeeks(), []);
  const [selectedWeek, setSelectedWeek] = useState<string>('');

  useEffect(() => {
    if (!selectedWeek && weeks.length > 0) {
      const now = new Date();
      const ws = new Date(now);
      ws.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const currentRange = `${ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      const todayRange = weeks.find(w => w.startsWith(currentRange.split(' - ')[0]));
      setSelectedWeek(todayRange || weeks[4] || weeks[0]);
    }
  }, [weeks, selectedWeek]);

  // Real ratings aggregated for this tutor
  const stats = useMemo(() => {
    return getTutorRatingStats(tutor.id);
  }, [tutor.id, getTutorRatingStats]);

  // Filter tutor's timetable slots
  const tutorSlots = useMemo(() => {
    return (timetable || []).filter(
      (slot) => slot.tutorId === tutor.id || slot.tutorName?.toLowerCase() === tutor.name.toLowerCase()
    );
  }, [timetable, tutor.id, tutor.name]);

  // Parse week dates to filter slots for the selected week
  const weekSlots = useMemo(() => {
    if (!selectedWeek || !selectedWeek.includes(' - ')) return tutorSlots;

    const [startStr, endStr] = selectedWeek.split(' - ');
    const now = new Date();
    const currentYear = now.getFullYear();

    const parseRangeDate = (datePart: string) => {
      const parts = datePart.trim().split(' ');
      const d = parseInt(parts[0], 10);
      const mRaw = (parts[1] || '').replace(/[^a-z]/gi, '').toLowerCase();
      const monthMap: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
      };
      const monthIndex = monthMap[mRaw] ?? 0;

      let year = currentYear;
      if (now.getMonth() === 0 && monthIndex === 11) year--;
      if (now.getMonth() === 11 && monthIndex === 0) year++;

      return new Date(year, monthIndex, d);
    };

    const startDate = parseRangeDate(startStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = parseRangeDate(endStr);
    endDate.setHours(23, 59, 59, 999);

    return tutorSlots.filter((s) => {
      const slotDate = new Date(s.date);
      slotDate.setHours(0, 0, 0, 0);
      return slotDate >= startDate && slotDate <= endDate;
    });
  }, [tutorSlots, selectedWeek]);

  // Format date display: e.g. "Mon 12 Oct"
  const formatSlotDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      }
    } catch {}
    return dateStr;
  };

  // Format time display: e.g. "10:00"
  const formatStartTime = (timeRange: string) => {
    if (!timeRange) return '';
    return timeRange.split(' - ')[0] || timeRange;
  };

  const primarySubject = tutor.subjects?.[0] || 'Subject Specialist';

  return (
    <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-200 pb-20">
      {/* Header with Back Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-2xs transition-all cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Active Classes</span>
        </button>

        <span className="text-[10px] font-black uppercase text-slate-400 font-mono">
          Tutor Portal
        </span>
      </div>

      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#C2410C]">
          {tutor.name} · {primarySubject}
        </div>
        <h1 className="text-2xl font-black text-[#0F172A] tracking-tight mt-0.5">
          Timetable history
        </h1>
      </div>

      {/* 1. Overall Student Rating Card (Matching TutorHistory.dc.html) */}
      <section
        aria-label="Overall rating"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0B1224 100%)',
          boxShadow: '0 8px 24px rgba(2, 6, 23, 0.18)',
        }}
        className="rounded-[20px] p-5 border border-[#334155] text-white"
      >
        <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#CBD5E1]">
          Overall student rating
        </div>

        <div className="flex items-end gap-3 mt-1">
          <div className="flex items-baseline leading-none">
            <span className="text-[56px] font-extrabold tracking-[-0.03em] font-mono tabular-nums">
              {stats.totalRatings > 0 ? stats.averageRating.toFixed(1) : '—'}
            </span>
            <span className="text-xl font-extrabold text-[#FCD34D] ml-1">
              / 5
            </span>
          </div>

          <div className="pb-2 flex flex-col gap-1.5">
            <div className="flex gap-0.5 text-[#FBBF24]" aria-label={`${stats.averageRating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-4 h-4 ${
                    stats.totalRatings > 0 && s <= Math.round(stats.averageRating)
                      ? 'fill-[#FBBF24] text-[#FBBF24]'
                      : 'fill-[#475569] text-[#475569]'
                  }`}
                />
              ))}
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/18 text-[#6EE7B7] border border-emerald-500/30">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.changeVsLastMonth} vs last month</span>
            </span>
          </div>
        </div>

        <div className="mt-1.5 text-[11px] font-semibold text-[#94A3B8]">
          {stats.totalRatings > 0
            ? `From ${stats.totalRatings} ${stats.totalRatings === 1 ? 'rating' : 'ratings'} across ${stats.totalClassesRated} ${stats.totalClassesRated === 1 ? 'class' : 'classes'}`
            : 'No student ratings submitted yet'}
        </div>

        {/* Rating Breakdown Bars (5 to 1) */}
        <div className="flex flex-col gap-1.5 mt-3.5 pt-3 border-t border-white/10">
          {([5, 4, 3, 2, 1] as const).map((starNum) => {
            const row = stats.distribution[starNum];
            return (
              <div key={starNum} className="flex items-center gap-2 text-[11px] font-bold text-[#CBD5E1]">
                <span className="w-5 text-left">{starNum}</span>
                <span className="flex-1 h-1.5 rounded-full bg-white/12 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-[#FBBF24] transition-all duration-300"
                    style={{ width: `${row?.percent || 0}%` }}
                  />
                </span>
                <span className="w-8 text-right font-mono tabular-nums text-slate-300">
                  {row?.percent || 0}%
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Weekly Calendar Dropdown (Moved here below average rating card) */}
      <div className="pt-1">
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1.5">
          Select Academic Week
        </label>
        <ModernSelect
          value={selectedWeek}
          onChange={setSelectedWeek}
          options={weeks.map((w) => ({ value: w, label: w }))}
          className="w-full"
        />
      </div>

      {/* 3. Past Classes Header */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-extrabold tracking-[0.08em] uppercase text-[#0F172A]">
          Past classes ({weekSlots.length})
        </span>
        <span className="text-[11px] font-bold text-[#64748B]">
          Average rating
        </span>
      </div>

      {/* 4. Past Classes List */}
      <div className="flex flex-col gap-2.5">
        {weekSlots.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80 space-y-2">
            <Info className="w-8 h-8 text-slate-300 mx-auto" />
            <h4 className="text-xs font-extrabold text-slate-700">No classes found in this week</h4>
            <p className="text-[11px] text-slate-400">Select another academic week to view your schedule history.</p>
          </div>
        ) : (
          weekSlots.map((cls) => {
            const classRating = getClassRatingStats(cls.id);
            const programme = programmes.find((p) => p.id === cls.programmeId);
            const programmeName = cls.programmeName || programme?.name || 'Prep Class';
            const isDashed = !classRating.hasEnoughRatings && classRating.totalRatings > 0;

            return (
              <div
                key={cls.id}
                className={`w-full text-left p-4 bg-white rounded-2xl transition-all space-y-3 ${
                  isDashed
                    ? 'border border-dashed border-[#CBD5E1]'
                    : 'border border-[#E2E8F0] shadow-2xs hover:border-slate-300'
                }`}
              >
                {/* Top: Subject, topic, date, time and programme */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[15px] font-extrabold text-[#0F172A] truncate">
                      {cls.subject} {cls.topic ? `· ${cls.topic}` : ''}
                    </h4>
                    <p className="text-xs text-[#64748B] mt-0.5 truncate font-medium">
                      {formatSlotDate(cls.date)} · {formatStartTime(cls.time)} · {programmeName}
                    </p>
                  </div>
                  {cls.room && (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200/60 shrink-0">
                      {cls.room}
                    </span>
                  )}
                </div>

                {/* Bottom: Student ratings given to the tutor */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Student Rating
                  </span>

                  {classRating.hasEnoughRatings ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-sm font-extrabold font-mono text-[#0F172A] tabular-nums">
                        <Star className="w-4 h-4 fill-[#F59E0B] text-[#F59E0B]" />
                        <span>{classRating.averageRating.toFixed(1)}</span>
                        <span className="text-slate-400 font-semibold text-xs">/ 5.0</span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        ({classRating.totalRatings} {classRating.totalRatings === 1 ? 'rating' : 'ratings'})
                      </span>
                    </div>
                  ) : classRating.totalRatings > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Not enough yet
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        ({classRating.totalRatings} {classRating.totalRatings === 1 ? 'rating' : 'ratings'})
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <Star className="w-3.5 h-3.5 text-slate-300" />
                      <span>No ratings yet</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Privacy / Aggregation Policy Notice */}
      <p className="text-[11px] leading-relaxed text-[#64748B] pt-1">
        You see averages only. An average appears once a class has 3 or more ratings, so no single student can be identified.
      </p>
    </div>
  );
};
