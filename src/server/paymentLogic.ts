/**
 * Payment rules, kept free of Firebase and Express so they can be unit-tested.
 *
 * Trust model:
 *  - A student can only SUBMIT a payment claim. It is stored as 'Pending' and
 *    never changes the student's balance.
 *  - Only a centre admin (or platform staff) can record a payment directly or
 *    confirm a pending claim. Only then do paidAmount / outstandingBalance /
 *    paymentStatus move, and only the server writes them.
 *  - The amount that gets applied is always the amount stored on the server's
 *    own payment document, never a number sent with the confirm request.
 */

export const MAX_PAYMENT_AMOUNT = 10_000_000;
export const MAX_PENDING_PER_STUDENT = 5;

export class PaymentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
  }
}

export interface StudentFees {
  uid?: unknown;
  centreId?: unknown;
  totalFee?: unknown;
  paidAmount?: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Money is kept to 2 decimal places so repeated additions never drift. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const outstandingOf = (s: StudentFees): number =>
  round2(Math.max(num(s.totalFee) - num(s.paidAmount), 0));

/** Parse and bound a client-supplied amount. */
export function parseAmount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PAYMENT_AMOUNT) {
    throw new PaymentError(400, 'Invalid payment amount');
  }
  return round2(n);
}

/**
 * Centre isolation for admins. Fails closed: if either side has no centre,
 * the call is refused (run the tenant backfill) rather than waved through.
 * Platform staff (tos) may act on any centre.
 */
export function assertCentreAccess(opts: {
  tos: boolean;
  callerCentreId: string;
  recordCentreId: string;
}): void {
  if (opts.tos) return;
  if (!opts.callerCentreId || !opts.recordCentreId) {
    throw new PaymentError(
      403,
      'This record has no centre assigned, so it cannot be changed here. Ask platform support to run the centre backfill.'
    );
  }
  if (opts.callerCentreId !== opts.recordCentreId) {
    throw new PaymentError(403, 'That record belongs to a different centre');
  }
}

/** A non-admin may only act on the student record that belongs to them. */
export function assertOwnStudentRecord(opts: {
  callerUid: string;
  studentId: string;
  student: StudentFees;
}): void {
  const { callerUid, studentId, student } = opts;
  if (student.uid !== callerUid && studentId !== callerUid) {
    throw new PaymentError(403, 'You can only submit payments for your own student record');
  }
}

export interface AppliedFees {
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: 'Paid' | 'Partial';
}

/**
 * Apply a payment to a student's fees. Refuses overpayment so a balance can
 * never go negative and a typo cannot silently clear a bigger debt.
 */
export function applyPayment(student: StudentFees, amount: number): AppliedFees {
  const outstanding = outstandingOf(student);
  if (amount > outstanding) {
    throw new PaymentError(
      400,
      outstanding <= 0
        ? 'This student has no outstanding balance'
        : `Amount is more than the outstanding balance (${outstanding})`
    );
  }
  const paidAmount = round2(num(student.paidAmount) + amount);
  const outstandingBalance = round2(Math.max(num(student.totalFee) - paidAmount, 0));
  return {
    paidAmount,
    outstandingBalance,
    paymentStatus: outstandingBalance <= 0 ? 'Paid' : 'Partial',
  };
}

/** A pending claim may be confirmed or rejected exactly once. */
export function assertPending(status: unknown): void {
  if (status !== 'Pending') {
    throw new PaymentError(409, 'This payment has already been processed');
  }
}

/** Cap how many unconfirmed claims one student can stack up. */
export function assertPendingCapacity(existingPending: number): void {
  if (existingPending >= MAX_PENDING_PER_STUDENT) {
    throw new PaymentError(
      429,
      'You already have several payments awaiting confirmation. Wait for the centre to confirm them first.'
    );
  }
}

export type ConfirmAction = 'confirm' | 'reject';

export function parseConfirmAction(raw: unknown): ConfirmAction {
  if (raw === 'confirm' || raw === 'reject') return raw;
  throw new PaymentError(400, 'Invalid action');
}
