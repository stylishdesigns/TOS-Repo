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
