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
  feeState,
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
  /** When the payment starts covering the student (YYYY-MM-DD). */
  effectiveFrom?: unknown;
  /** When the payment window expires (YYYY-MM-DD). */
  expiresAt?: unknown;
}

const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

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
  const { studentId, amount, method, note, evidenceUrl, evidenceName, effectiveFrom, expiresAt } = input;
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
    if (isISODate(effectiveFrom)) basePayment.effectiveFrom = effectiveFrom.trim();
    if (isISODate(expiresAt)) basePayment.expiresAt = expiresAt.trim();

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

export interface SetFeeInput {
  studentId: string;
  totalFee: number;
}

/**
 * Admin: set the total fee a student owes. This is the only way a fee moves
 * (the admin decides what each student pays), and the server recomputes the
 * balance and status from it, so no device ever sends balance numbers.
 */
export async function setStudentFee(
  db: Firestore,
  caller: PaymentCaller,
  actor: PaymentActor,
  input: SetFeeInput
) {
  if (!actor.isAdminCaller) {
    throw new PaymentError(403, 'Only a facility admin can set the total fee');
  }
  const { studentId, totalFee } = input;

  return db.runTransaction(async (tx) => {
    const studentRef = db.collection('students').doc(studentId);
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) {
      throw new PaymentError(404, 'Student record not found');
    }
    const s = studentSnap.data() as Record<string, any>;
    const studentCentreId = typeof s.centreId === 'string' ? s.centreId : '';
    assertCentreAccess({
      tos: tosOverride(caller, actor),
      callerCentreId: actor.callerCentreId,
      recordCentreId: studentCentreId,
    });

    const fees = feeState(s, totalFee);
    tx.update(studentRef, {
      totalFee: fees.totalFee,
      outstandingBalance: fees.outstandingBalance,
      paymentStatus: fees.paymentStatus,
      feeSetBy: caller.uid,
      feeSetAt: Date.now(),
    });
    tx.set(db.collection('auditLogs').doc(), {
      action: 'fee.set',
      actorUid: caller.uid,
      actorEmail: caller.email,
      centreId: studentCentreId,
      studentId,
      totalFee: fees.totalFee,
      previousFee: typeof s.totalFee === 'number' ? s.totalFee : 0,
      paidAmount: fees.paidAmount,
      at: new Date().toISOString(),
    });
    return { student: fees };
  });
}

export interface SyncProgrammeFeeInput {
  programmeId: string;
}

/**
 * Admin pulls every student registered on an exam programme to the
 * programme's current fee. The paid amount is preserved and balance and
 * payment status are recomputed with the same feeState rule as set-fee;
 * only students whose stored fee differs are written, so a re-run is a
 * no-op. Every fee switch lands in the audit log.
 */
export async function syncProgrammeFee(
  db: Firestore,
  caller: PaymentCaller,
  actor: PaymentActor,
  input: SyncProgrammeFeeInput
) {
  if (!actor.isAdminCaller) {
    throw new PaymentError(403, 'Only a facility admin can sync exam programme fees');
  }
  const programmeId = String(input.programmeId || '');
  if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(programmeId)) {
    throw new PaymentError(400, 'Invalid programmeId');
  }
  const progRef = db.collection('programmes').doc(programmeId);
  const progSnap = await progRef.get();
  if (!progSnap.exists) {
    throw new PaymentError(404, 'Exam programme not found');
  }
  const p = progSnap.data() as Record<string, any>;
  const progCentreId = typeof p.centreId === 'string' ? p.centreId : '';
  assertCentreAccess({
    tos: tosOverride(caller, actor),
    callerCentreId: actor.callerCentreId,
    recordCentreId: progCentreId,
  });
  const fee = Math.round(Number(p.fee));
  if (!Number.isFinite(fee) || fee <= 0) {
    throw new PaymentError(400, 'That exam programme has no fee set yet');
  }

  const stuSnap = await db.collection('students').where('centreId', '==', progCentreId).get();
  const batch = db.batch();
  let updated = 0;
  let unchanged = 0;
  stuSnap.forEach((docSnap) => {
    const s = docSnap.data() as Record<string, any>;
    if (String(s.programmeId || '') !== programmeId) return;
    const fees = feeState(s, fee);
    const previousFee = typeof s.totalFee === 'number' ? s.totalFee : 0;
    if (previousFee === fees.totalFee) {
      unchanged++;
      return;
    }
    batch.update(docSnap.ref, {
      totalFee: fees.totalFee,
      outstandingBalance: fees.outstandingBalance,
      paymentStatus: fees.paymentStatus,
    });
    batch.set(db.collection('auditLogs').doc(), {
      action: 'fee.sync',
      actorUid: caller.uid,
      actorEmail: caller.email,
      centreId: progCentreId,
      studentId: docSnap.id,
      programmeId,
      totalFee: fees.totalFee,
      previousFee,
      paidAmount: fees.paidAmount,
      at: new Date().toISOString(),
    });
    updated++;
  });
  await batch.commit();
  return { programmeId, fee, updated, unchanged };
}

export interface DecidePaymentInput {
  paymentId: string;
  action: ConfirmAction;
  reason?: unknown;
  /** Admin may set the payment window when confirming (YYYY-MM-DD). */
  effectiveFrom?: unknown;
  expiresAt?: unknown;
}

/** Admin: confirm or reject a pending claim, exactly once. */
export async function decidePayment(
  db: Firestore,
  caller: PaymentCaller,
  actor: PaymentActor,
  input: DecidePaymentInput
) {
  if (!actor.isAdminCaller) {
    throw new PaymentError(403, 'Only a facility admin can confirm payments');
  }
  const { paymentId, action, reason, effectiveFrom, expiresAt } = input;
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
    const confirmUpdate: Record<string, any> = {
      status: fees.paymentStatus,
      balance: fees.outstandingBalance,
      receiptNumber: receipt,
      confirmedBy: caller.uid,
      confirmedAt: Date.now(),
    };
    if (isISODate(effectiveFrom)) confirmUpdate.effectiveFrom = effectiveFrom.trim();
    if (isISODate(expiresAt)) confirmUpdate.expiresAt = expiresAt.trim();
    tx.update(paymentRef, confirmUpdate);
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
