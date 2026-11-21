import { isConfirmedPayment } from '../types';

/** Format a YYYY-MM-DD date the way people read it: 5 March 2027. */
export const formatDateLong = (iso?: string | null): string =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

/**
 * The next payment due date for a student: the expiry date of the payment
 * window the facility most recently confirmed. No confirmed window yet means
 * there is no due date to show.
 */
export const nextPaymentDue = (
  payments: Array<{ status?: string; expiresAt?: string }>
): string | null => {
  const dates = payments
    .filter((p) => isConfirmedPayment({ status: p.status }) && typeof p.expiresAt === 'string' && p.expiresAt)
    .map((p) => (p.expiresAt as string).slice(0, 10));
  if (!dates.length) return null;
  return dates.sort().slice(-1)[0];
};

/** Today as YYYY-MM-DD in local time. */
export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A valid YYYY-MM-DD string, or undefined. */
export const cleanDate = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined;
