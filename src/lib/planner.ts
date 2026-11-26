import { TimetableSlot, PlannerActivity } from '../types';

// Timetable periods become the first-class activities on the academic
// schedule planner: one entry per slot on its own date. Reminders members
// add arrive separately as PlannerActivity values from AppContext.
export function slotsToActivities(slots: TimetableSlot[]): PlannerActivity[] {
  return slots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    time: (slot.startTime || (slot.time || '').split('-')[0]?.trim() || '').trim(),
    title: slot.subject,
    kind: 'class' as const,
  }));
}

// Weekday name for a YYYY-MM-DD string, parsed as a LOCAL calendar date (not
// UTC midnight), so the weekday always matches the date the user picked.
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const dayNameFromDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  return WEEKDAYS[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
};

// Local YYYY-MM-DD key for a Date. toISOString shifts at UTC midnight and can
// hand back yesterday's date in any timezone ahead of UTC (Lagos included).
export const localDateKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
