/**
 * Payment transactions. Each function is one Firestore transaction that moves
 * a payment record and the student's fees together. The database is a
 * parameter (not an import) so the same code runs against the real Admin SDK
 * in production and an in-memory fake in unit tests.
 *
 * See paymentLogic.ts for the trust model.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  PaymentError,
  MAX_PENDING_PER_STUDENT,
  outstandingOf,
  assertCentreAccess,
  assertOwnStudentRecord,
  applyPayment,
  assertPending,
  assertPendingCapacity,
  type ConfirmAction,
} from './paymentLogic';

export interface PaymentCaller {
  uid: string;
  email: string;
  tos: boolean;
}

export interface PaymentActor {
  isAdminCaller: boolean;
  callerCentreId: string;
}

/** Work out whether the caller is a centre admin, and which centre they run. */
export async function loadPaymentActor(db: Firestore, caller: PaymentCaller): Promise<PaymentActor> {
  const adminSnap = await db.collection('admins').doc(caller.uid).get();
  return {
    isAdminCaller: adminSnap.exists || caller.tos === true,
    callerCentreId: adminSnap.exists
      ? String((adminSnap.data() as Record<string, unknown>).centreId || '')
      : '',
  };
}

// Platform staff without a centre of their own may act on any centre. A centre
// admin (even one who is also platform staff) is held to their own centre.
const tosOverride = (caller: PaymentCaller, actor: PaymentActor) =>
  caller.tos === true && !actor.callerCentreId;

const receiptNumber = () =>
  `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

export interface SubmitPaymentInput {
  studentId: string;
  amount: number;
  method: 'Card' | 'Bank Transfer' | 'Cash';
  note?: unknown;
  evidenceUrl?: unknown;
  evidenceName?: unknown;
}

/**
 * Student: store a 'Pending' claim and change nothing else.
 * Admin / platform staff: record the payment and apply it to the balance now.
 */
export async function submitPayment(
  db: Firestore,
  caller: PaymentCaller,
  actor: PaymentActor,
  input: SubmitPaymentInput
) {
  const { studentId, amount, method, note, evidenceUrl, evidenceName } = input;
  const { isAdminCaller, callerCentreId } = actor;

  return db.runTransaction(async (tx) => {
    const studentRef = db.collection('students').doc(studentId);
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) {
      throw new PaymentError(404, 'Student record not found');
    }
    const s = studentSnap.data() as Record<string, any>;
    const studentCentreId = typeof s.centreId === 'string' ? s.centreId : '';

    let pendingCount = 0;
    if (isAdminCaller) {
      assertCentreAccess({
        tos: tosOverride(caller, actor),
        callerCentreId,
        recordCentreId: studentCentreId,
      });
    } else {
      assertOwnStudentRecord({ callerUid: caller.uid, studentId, student: s });
      const pendingSnap = await tx.get(
        db
          .collection('payments')
          .where('studentId', '==', studentId)
          .where('status', '==', 'Pending')
          .limit(MAX_PENDING_PER_STUDENT)
      );
      pendingCount = pendingSnap.size;
    }

    const totalFee = typeof s.totalFee === 'number' ? s.totalFee : 0;
    const paymentId = `pay-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const basePayment: Record<string, any> = {
      centreId: studentCentreId,
      studentId,
      studentName: typeof s.name === 'string' ? s.name : '',
      programmeName: typeof s.programmeName === 'string' ? s.programmeName : '',
      amountPaid: amount,
      totalFee,
      method,
      date: new Date().toISOString().split('T')[0],
      createdAt: Date.now(),
    };
    if (typeof note === 'string' && note.trim()) basePayment.note = note.trim().slice(0, 500);
    if (typeof evidenceUrl === 'string' && evidenceUrl) basePayment.evidenceUrl = evidenceUrl;
    if (typeof evidenceName === 'string' && evidenceName) basePayment.evidenceName = evidenceName.slice(0, 200);

    if (!isAdminCaller) {
      assertPendingCapacity(pendingCount);
      const outstanding = outstandingOf(s);
      if (amount > outstanding) {
        throw new PaymentError(
          400,
          outstanding <= 0
            ? 'You have no outstanding balance'
            : `Amount is more than your outstanding balance (${outstanding})`
        );
      }
      const paymentDoc = {
        ...basePayment,
        receiptNumber: '',
        balance: outstanding,
        status: 'Pending',
        submittedBy: 'Student',
      };
      tx.set(db.collection('payments').doc(paymentId), paymentDoc);
      tx.set(db.collection('auditLogs').doc(), {
        action: 'payment.submit',
        actorUid: caller.uid,
        actorEmail: caller.email,
        centreId: studentCentreId,
        studentId,
        paymentId,
        amountPaid: amount,
        method,
        at: new Date().toISOString(),
      });
      return { pending: true as const, payment: { id: paymentId, ...paymentDoc } };
    }

    const fees = applyPayment(s, amount);
    const receipt = receiptNumber();
    const paymentDoc = {
      ...basePayment,
      receiptNumber: receipt,
      balance: fees.outstandingBalance,
      status: fees.paymentStatus,
      submittedBy: 'Admin',
      confirmedBy: caller.uid,
      confirmedAt: Date.now(),
    };
    tx.set(db.collection('payments').doc(paymentId), paymentDoc);
    tx.update(studentRef, {
      paidAmount: fees.paidAmount,
      outstandingBalance: fees.outstandingBalance,
      paymentStatus: fees.paymentStatus,
    });
    tx.set(db.collection('auditLogs').doc(), {
      action: 'payment.record',
      actorUid: caller.uid,
      actorEmail: caller.email,
      centreId: studentCentreId,
      studentId,
      paymentId,
      receiptNumber: receipt,
      amountPaid: amount,
      method,
      at: new Date().toISOString(),
    });
    return {
      pending: false as const,
      payment: { id: paymentId, ...paymentDoc },
      student: {
        paidAmount: fees.paidAmount,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
      },
    };
  });
}

export interface DecidePaymentInput {
  paymentId: string;
  action: ConfirmAction;
  reason?: unknown;
}

/** Admin: confirm or reject a pending claim, exactly once. */
export async function decidePayment(
  db: Firestore,
  caller: PaymentCaller,
  actor: PaymentActor,
  input: DecidePaymentInput
) {
  if (!actor.isAdminCaller) {
    throw new PaymentError(403, 'Only a centre admin can confirm payments');
  }
  const { paymentId, action, reason } = input;
  const { callerCentreId } = actor;

  return db.runTransaction(async (tx) => {
    const paymentRef = db.collection('payments').doc(paymentId);
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) {
      throw new PaymentError(404, 'Payment not found');
    }
    const p = paymentSnap.data() as Record<string, any>;
    assertPending(p.status);

    const studentRef = db.collection('students').doc(String(p.studentId || ''));
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) {
      throw new PaymentError(404, 'Student record not found');
    }
    const s = studentSnap.data() as Record<string, any>;
    const paymentCentreId = typeof p.centreId === 'string' ? p.centreId : '';
    const studentCentreId = typeof s.centreId === 'string' ? s.centreId : '';
    const override = tosOverride(caller, actor);
    // The caller must share a centre with BOTH the payment and the student.
    assertCentreAccess({ tos: override, callerCentreId, recordCentreId: paymentCentreId });
    assertCentreAccess({ tos: override, callerCentreId, recordCentreId: studentCentreId });

    if (action === 'reject') {
      const rejection: Record<string, any> = {
        status: 'Rejected',
        rejectedBy: caller.uid,
        rejectedAt: Date.now(),
      };
      if (typeof reason === 'string' && reason.trim()) rejection.rejectionReason = reason.trim().slice(0, 500);
      tx.update(paymentRef, rejection);
      tx.set(db.collection('auditLogs').doc(), {
        action: 'payment.reject',
        actorUid: caller.uid,
        actorEmail: caller.email,
        centreId: paymentCentreId,
        studentId: p.studentId,
        paymentId,
        amountPaid: p.amountPaid,
        at: new Date().toISOString(),
      });
      return { status: 'Rejected' as const };
    }

    // Confirm: the amount comes from the stored claim, never from the request.
    const amount = typeof p.amountPaid === 'number' ? p.amountPaid : 0;
    if (!(amount > 0)) {
      throw new PaymentError(409, 'This payment has no valid amount. Reject it instead.');
    }
    let fees;
    try {
      fees = applyPayment(s, amount);
    } catch (e) {
      if (e instanceof PaymentError) {
        throw new PaymentError(409, `${e.message}. Reject this payment and ask the student to resubmit.`);
      }
      throw e;
    }
    const receipt = receiptNumber();
    tx.update(paymentRef, {
      status: fees.paymentStatus,
      balance: fees.outstandingBalance,
      receiptNumber: receipt,
      confirmedBy: caller.uid,
      confirmedAt: Date.now(),
    });
    tx.update(studentRef, {
      paidAmount: fees.paidAmount,
      outstandingBalance: fees.outstandingBalance,
      paymentStatus: fees.paymentStatus,
    });
    tx.set(db.collection('auditLogs').doc(), {
      action: 'payment.confirm',
      actorUid: caller.uid,
      actorEmail: caller.email,
      centreId: paymentCentreId,
      studentId: p.studentId,
      paymentId,
      receiptNumber: receipt,
      amountPaid: amount,
      at: new Date().toISOString(),
    });
    return {
      status: fees.paymentStatus,
      receiptNumber: receipt,
      student: {
        paidAmount: fees.paidAmount,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
      },
    };
  });
}
