import assert from 'node:assert/strict';
import {
  PaymentError,
  MAX_PAYMENT_AMOUNT,
  MAX_PENDING_PER_STUDENT,
  outstandingOf,
  parseAmount,
  assertCentreAccess,
  assertOwnStudentRecord,
  applyPayment,
  assertPending,
  assertPendingCapacity,
  parseConfirmAction,
} from './paymentLogic';

console.log('--- Running paymentLogic.ts Unit Tests ---');

const throwsPayment = (fn: () => unknown, status: number) => {
  assert.throws(fn, (e: unknown) => e instanceof PaymentError && e.status === status);
};

// parseAmount
assert.equal(parseAmount(1500), 1500);
assert.equal(parseAmount('2500.50'), 2500.5);
assert.equal(parseAmount(10.005 + 0.0001), 10.01);
for (const bad of [0, -5, NaN, Infinity, '', '  ', 'abc', null, undefined, {}, [], MAX_PAYMENT_AMOUNT + 1]) {
  throwsPayment(() => parseAmount(bad), 400);
}
assert.equal(parseAmount(MAX_PAYMENT_AMOUNT), MAX_PAYMENT_AMOUNT);
console.log('✓ parseAmount passed');

// outstandingOf
assert.equal(outstandingOf({ totalFee: 100000, paidAmount: 40000 }), 60000);
assert.equal(outstandingOf({ totalFee: 100000, paidAmount: 150000 }), 0);
assert.equal(outstandingOf({}), 0);
assert.equal(outstandingOf({ totalFee: 'oops' as any, paidAmount: null as any }), 0);
console.log('✓ outstandingOf passed');

// applyPayment: normal, partial, exact, and the money-risk cases
assert.deepEqual(applyPayment({ totalFee: 100000, paidAmount: 0 }, 40000), {
  paidAmount: 40000,
  outstandingBalance: 60000,
  paymentStatus: 'Partial',
});
assert.deepEqual(applyPayment({ totalFee: 100000, paidAmount: 40000 }, 60000), {
  paidAmount: 100000,
  outstandingBalance: 0,
  paymentStatus: 'Paid',
});
// Overpayment is refused, not clamped (a typo must not clear a bigger debt).
throwsPayment(() => applyPayment({ totalFee: 100000, paidAmount: 40000 }, 60000.01), 400);
throwsPayment(() => applyPayment({ totalFee: 100000, paidAmount: 40000 }, 9_999_999), 400);
// A student with nothing owed cannot receive a payment.
throwsPayment(() => applyPayment({ totalFee: 100000, paidAmount: 100000 }, 1), 400);
throwsPayment(() => applyPayment({ totalFee: 0, paidAmount: 0 }, 1), 400);
// Floating point drift does not leave a phantom balance.
let s = { totalFee: 0.3, paidAmount: 0 };
const a = applyPayment(s, 0.1);
const b = applyPayment({ ...s, paidAmount: a.paidAmount }, 0.2);
assert.equal(b.outstandingBalance, 0);
assert.equal(b.paymentStatus, 'Paid');
console.log('✓ applyPayment passed');

// assertCentreAccess: fail closed
assertCentreAccess({ tos: false, callerCentreId: 'c1', recordCentreId: 'c1' });
throwsPayment(() => assertCentreAccess({ tos: false, callerCentreId: 'c1', recordCentreId: 'c2' }), 403);
throwsPayment(() => assertCentreAccess({ tos: false, callerCentreId: '', recordCentreId: 'c1' }), 403);
throwsPayment(() => assertCentreAccess({ tos: false, callerCentreId: 'c1', recordCentreId: '' }), 403);
throwsPayment(() => assertCentreAccess({ tos: false, callerCentreId: '', recordCentreId: '' }), 403);
assertCentreAccess({ tos: true, callerCentreId: '', recordCentreId: 'c2' });
console.log('✓ assertCentreAccess passed');

// assertOwnStudentRecord
assertOwnStudentRecord({ callerUid: 'u1', studentId: 'stu-1', student: { uid: 'u1' } });
assertOwnStudentRecord({ callerUid: 'u1', studentId: 'u1', student: { uid: '' } });
throwsPayment(
  () => assertOwnStudentRecord({ callerUid: 'u1', studentId: 'stu-2', student: { uid: 'u2' } }),
  403
);
console.log('✓ assertOwnStudentRecord passed');

// assertPending: single use
assertPending('Pending');
for (const st of ['Paid', 'Partial', 'Rejected', undefined, '']) {
  throwsPayment(() => assertPending(st), 409);
}
console.log('✓ assertPending passed');

// assertPendingCapacity
assertPendingCapacity(MAX_PENDING_PER_STUDENT - 1);
throwsPayment(() => assertPendingCapacity(MAX_PENDING_PER_STUDENT), 429);
console.log('✓ assertPendingCapacity passed');

// parseConfirmAction
assert.equal(parseConfirmAction('confirm'), 'confirm');
assert.equal(parseConfirmAction('reject'), 'reject');
for (const bad of ['', 'CONFIRM', 'approve', null, undefined, 1]) {
  throwsPayment(() => parseConfirmAction(bad), 400);
}
console.log('✓ parseConfirmAction passed');

console.log('--- ALL PAYMENT LOGIC TESTS PASSED SUCCESSFULLY ---');
