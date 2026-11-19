import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Plus, Trash2 } from 'lucide-react';
import { PlannerActivity } from '../../types';
import { useScrollLock } from '../../hooks/useScrollLock';

interface CalendarViewProps {
  isOpen: boolean;
  onClose: () => void;
  activities: PlannerActivity[];
  title?: string;
  onAddActivity?: (input: { date: string; time: string; title: string; kind: 'practice' | 'mock' | 'custom' }) => Promise<boolean>;
  onRemoveActivity?: (id: string) => Promise<boolean>;
}

const KIND_DOT: Record<string, string> = {
  class: 'bg-orange-500',
  mock: 'bg-rose-500',
  practice: 'bg-amber-500',
  custom: 'bg-sky-500',
};

// Compact academic schedule planner (Nov 19 redesign): a monthly grid where
// every day with something on it shows a pulsing dot and its first activity,
// any day opens a popup listing that day's activities, and reminders can be
// added to or removed from any day. The old status legend and per-slot
// status chips are gone: this calendar is for planning, not for slot
// approval states.
export const CalendarView: React.FC<CalendarViewProps> = ({
  isOpen,
  onClose,
  activities,
  title = 'Schedule Planner',
  onAddActivity,
  onRemoveActivity,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('09:00');
  const [formKind, setFormKind] = useState<'practice' | 'mock' | 'custom'>('custom');
  const [confirmDelete, setConfirmDelete] = useState<PlannerActivity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  const monthName = currentMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const byDate: Record<string, PlannerActivity[]> = {};
  activities.forEach((a) => {
    if (!a.date) return;
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  Object.values(byDate).forEach((list) =>
    list.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  );

  const todayKey = new Date().toLocaleDateString('en-CA');

  const resetForm = () => {
    setAdding(false);
    setFormTitle('');
    setFormTime('09:00');
    setFormKind('custom');
    setAddError('');
  };

  // Branded clock (Nov 19): big steppers instead of the browser's native time
  // input, TOS orange, 12-hour with AM/PM. Stored as HH:MM (24h) so existing
  // reminders and the push sender parse unchanged.
  const parsedTime = /^(\d{1,2}):(\d{2})$/.exec(formTime);
  const h24 = parsedTime ? parseInt(parsedTime[1], 10) : 9;
  const mm = parsedTime ? parseInt(parsedTime[2], 10) : 0;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const isPm = h24 >= 12;
  const setTimeParts = (h: number, m: number) => setFormTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  const bumpHour = (d: number) => setTimeParts(((h24 + d) % 24 + 24) % 24, mm);
  const bumpMinute = (d: number) => setTimeParts(h24, ((mm + d * 5) % 60 + 60) % 60);
  const setAmpm = (pm: boolean) => setTimeParts(h24 % 12 + (pm ? 12 : 0), mm);

  const openDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    resetForm();
  };

  const handleSave = async () => {
    if (!onAddActivity || !selectedDate) return;
    if (!formTitle.trim()) {
      setAddError('Give the reminder a name first.');
      return;
    }
    setSaving(true);
    const ok = await onAddActivity({ date: selectedDate, time: formTime, title: formTitle, kind: formKind });
    setSaving(false);
    if (ok) resetForm();
    else setAddError("Couldn't save the reminder. Try again.");
  };

  const dayTitle = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()}`;
  };

  const selectedActivities = selectedDate ? byDate[selectedDate] || [] : [];

  // ------------------------------------------------------------------
  // Day popup: everything happening on the tapped day, with a way to add
  // a reminder to any day (empty ones included).
  // ------------------------------------------------------------------
  if (selectedDate) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          <div className="p-4 flex items-start justify-between shrink-0">
            <button
              onClick={() => {
                setSelectedDate(null);
                resetForm();
              }}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              title="Back to month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors"
              title="Close planner"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="px-6 pb-2 shrink-0">
            <h2 className="text-3xl font-black text-slate-900">{dayTitle(selectedDate)}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
            {selectedActivities.length === 0 && !adding && (
              <p className="text-center text-sm font-semibold text-slate-400 py-6">
                No activities for this day.
              </p>
            )}
            {selectedActivities.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 bg-white border border-slate-200/90 rounded-2xl px-4 py-3 shadow-sm"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${KIND_DOT[a.kind] || 'bg-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-slate-900 truncate">{a.title}</div>
                  {a.time && <div className="text-[11px] font-bold text-slate-400 mt-0.5">{a.time}</div>}
                </div>
                {a.kind !== 'class' && onRemoveActivity && (
                  <button
                    onClick={() => setConfirmDelete(a)}
                    className="p-2 -mr-1 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    title="Remove reminder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {adding && (
              <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50/60">
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Reminder name, e.g. Physics practice"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-bold outline-none focus:border-orange-400"
                />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Reminder time</p>
                  <div className="flex items-stretch gap-2 bg-white border-2 border-orange-200 rounded-2xl p-2.5">
                    <div className="flex-1 flex flex-col items-center rounded-xl bg-orange-50/70 py-1">
                      <button type="button" onClick={() => bumpHour(1)} className="p-1 rounded-md text-orange-600 hover:bg-orange-100 active:scale-90 transition-all" aria-label="Hour up">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="text-[32px] leading-none font-black text-slate-900 tabular-nums py-1">{hour12}</span>
                      <button type="button" onClick={() => bumpHour(-1)} className="p-1 rounded-md text-orange-600 hover:bg-orange-100 active:scale-90 transition-all" aria-label="Hour down">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="self-center text-2xl font-black text-orange-500">:</span>
                    <div className="flex-1 flex flex-col items-center rounded-xl bg-orange-50/70 py-1">
                      <button type="button" onClick={() => bumpMinute(1)} className="p-1 rounded-md text-orange-600 hover:bg-orange-100 active:scale-90 transition-all" aria-label="Minute up">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="text-[32px] leading-none font-black text-slate-900 tabular-nums py-1">{String(mm).padStart(2, '0')}</span>
                      <button type="button" onClick={() => bumpMinute(-1)} className="p-1 rounded-md text-orange-600 hover:bg-orange-100 active:scale-90 transition-all" aria-label="Minute down">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col justify-center gap-1.5 pl-1">
                      <button type="button" onClick={() => setAmpm(false)} className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${!isPm ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-400'}`}>AM</button>
                      <button type="button" onClick={() => setAmpm(true)} className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${isPm ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-400'}`}>PM</button>
                    </div>
                  </div>
                </div>
                {addError && <p className="text-xs font-bold text-rose-600">{addError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl bg-orange-600 text-white text-xs font-black uppercase disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save reminder'}
                  </button>
                </div>
              </div>
            )}
            {!adding && onAddActivity && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl px-4 py-4 text-left hover:border-orange-400 hover:bg-orange-50/40 transition-colors"
              >
                <span className="w-8 h-8 rounded-full border-2 border-orange-500 text-orange-600 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold text-slate-600">Set a reminder</span>
              </button>
            )}
          </div>
          {confirmDelete && (
            <div className="fixed inset-0 z-[110] bg-slate-950/60 flex items-center justify-center p-6" onClick={() => setConfirmDelete(null)}>
              <div className="bg-white w-full max-w-xs rounded-3xl shadow-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
                <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                  <Trash2 className="w-5 h-5" />
                </div>
                <p className="text-sm font-black text-slate-900">Delete this reminder?</p>
                <p className="text-xs text-slate-500 font-medium mt-1 break-words">&quot;{confirmDelete.title}&quot; will stop coming up on {dayTitle(String(confirmDelete.date))}.</p>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      if (!onRemoveActivity || !confirmDelete) return;
                      setDeleting(true);
                      await onRemoveActivity(confirmDelete.id);
                      setDeleting(false);
                      setConfirmDelete(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase disabled:opacity-60"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Month grid: compact cells; a day with activity shows a pulsing dot and
  // its first activity under the date, quiet days stay plain.
  // ------------------------------------------------------------------
  const renderDays = () => {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const cells: React.ReactNode[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push(<div key={`prev-${i}`} className="min-h-[58px] rounded-xl bg-slate-50/70" />);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayActs = byDate[dateStr] || [];
      const first = dayActs[0];
      const isToday = todayKey === dateStr;
      // The dot blinks only while the day still has reminders waiting to
      // fire (today's that have not come due yet, or any future day's).
      // Classes never blink, and once a day's reminders are all removed the
      // day goes still.
      const hasPendingReminder = dayActs.some((a) => {
        if (String(a.kind || '') === 'class') return false;
        if (dateStr > todayKey) return true;
        if (dateStr < todayKey) return false;
        const tm = /^(\d{1,2}):(\d{2})$/.exec(String(a.time || ''));
        const mins = tm ? parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10) : 0;
        return mins >= nowMinutes;
      });
      cells.push(
        <button
          key={d}
          onClick={() => openDay(dateStr)}
          className={`min-h-[58px] rounded-xl border p-1.5 flex flex-col items-start text-left transition-colors ${
            isToday
              ? 'bg-orange-50/70 border-orange-300'
              : dayActs.length
              ? 'bg-white border-slate-200/90 hover:border-orange-300'
              : 'bg-white border-slate-200/60 hover:bg-slate-50'
          }`}
        >
          <span
            className={`text-[11px] font-black leading-none mb-1 ${
              isToday ? 'w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center' : 'text-slate-700'
            }`}
          >
            {d}
          </span>
          {first && (
            <>
              <span className="relative flex h-2 w-2 mb-1">
                {hasPendingReminder && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60" />}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              <span className="text-[7.5px] font-bold text-slate-500 leading-tight w-full truncate">
                {first.time ? `${first.time} ` : ''}
                {first.title}
              </span>
            </>
          )}
        </button>
      );
    }
    return cells;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="px-5 pt-5 flex items-center justify-between shrink-0">
          <div className="flex items-center bg-slate-100 rounded-full p-1">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-1.5 rounded-full hover:bg-white text-slate-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-black text-slate-900 whitespace-nowrap">{monthName}</span>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-1.5 rounded-full hover:bg-white text-slate-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors"
            title="Close planner"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
        <div className="px-5 pt-3 pb-2 shrink-0">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {dayLabels.map((day) => (
              <div key={day} className="text-center text-[9px] font-black text-slate-400 uppercase tracking-wide pt-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">{renderDays()}</div>
          <p className="text-center text-[10px] font-semibold text-slate-400 mt-4">Tap any day to see its activities.</p>
        </div>
      </div>
    </div>
  );
};
