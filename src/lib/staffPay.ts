// Staff pay dates. A person's pay cycle is daily, weekly or monthly with a
// fixed anchor day; the next pay date is worked out from the anchor and the
// date of their last recorded payment. A tutor's per-class rate is a record
// of what a class is worth, never an automatic salary calculation.
import { todayISO } from './paymentDates';

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
};

const nextAnchorFrom = (fromISO: string, frequency: string, day: number): string => {
  const from = new Date(`${fromISO}T12:00:00`);
  if (frequency === 'weekly') {
    const d = new Date(from);
    const target = Math.min(Math.max(Math.floor(day), 0), 6);
    while (d.getDay() !== target) d.setDate(d.getDate() + 1);
    return isoOf(d);
  }
  if (frequency === 'monthly') {
    const target = Math.min(Math.max(Math.floor(day) || 1, 1), 28);
    let d = new Date(from.getFullYear(), from.getMonth(), target);
    if (isoOf(d) < fromISO) d = new Date(from.getFullYear(), from.getMonth() + 1, target);
    return isoOf(d);
  }
  return fromISO;
};

/**
 * The next date this person should be paid: the next anchor of their pay
 * cycle after their last recorded payment, or after today when nothing has
 * been recorded yet. Null when no pay cycle is set.
 */
export const computeNextPayDate = (
  payFrequency?: string | null,
  payDay?: number | null,
  lastPaidISO?: string | null
): string | null => {
  if (!payFrequency) return null;
  const today = todayISO();
  if (payFrequency === 'daily') return lastPaidISO ? addDays(lastPaidISO, 1) : today;
  const base = lastPaidISO ? addDays(lastPaidISO, 1) : today;
  return nextAnchorFrom(base, payFrequency, Number(payDay || 0));
};

export type PayDueStatus = 'none' | 'due' | 'overdue';

/** Is the next pay date today, or already behind us? */
export const payDueStatus = (nextISO: string | null): PayDueStatus => {
  if (!nextISO) return 'none';
  const today = todayISO();
  if (nextISO === today) return 'due';
  if (nextISO < today) return 'overdue';
  return 'none';
};

/** How far behind a due payment is, in plain words. */
export const overdueDays = (nextISO: string): number => {
  const diff = new Date(`${todayISO()}T12:00:00`).getTime() - new Date(`${nextISO}T12:00:00`).getTime();
  return Math.max(1, Math.round(diff / 86400000));
};
