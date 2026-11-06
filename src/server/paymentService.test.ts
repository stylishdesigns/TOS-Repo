import assert from 'node:assert/strict';
import { PaymentError } from './paymentLogic';
import { loadPaymentActor, submitPayment, decidePayment, type PaymentCaller } from './paymentService';

console.log('--- Running paymentService.ts Unit Tests (in-memory Firestore) ---');

// ---------- minimal in-memory Firestore: just what the service uses ----------
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

class FakeSnap {
  constructor(public id: string, private d: Record<string, any> | undefined) {}
  get exists() { return this.d !== undefined; }
  data() { return this.d === undefined ? undefined : clone(this.d); }
}
class FakeQuerySnap {
  constructor(public docs: FakeSnap[]) {}
  get size() { return this.docs.length; }
}
class FakeQuery {
  constructor(private db: FakeDb, private coll: string, private filters: Array<[string, any]> = [], private max = Infinity) {}
  where(field: string, op: string, value: any) {
    assert.equal(op, '==');
    return new FakeQuery(this.db, this.coll, [...this.filters, [field, value]], this.max);
  }
  limit(n: number) { return new FakeQuery(this.db, this.coll, this.filters, n); }
  async __run() {
    const docs: FakeSnap[] = [];
    for (const [key, d] of this.db.store) {
      const [c, id] = key.split('/');
      if (c !== this.coll) continue;
      if (this.filters.every(([f, v]) => d[f] === v)) docs.push(new FakeSnap(id, d));
    }
    return new FakeQuerySnap(docs.slice(0, this.max));
  }
}
class FakeRef {
  constructor(private db: FakeDb, public coll: string, public id: string) {}
  get key() { return `${this.coll}/${this.id}`; }
  async get() { return new FakeSnap(this.id, this.db.store.get(this.key)); }
}
class FakeCollection extends FakeQuery {
  constructor(private db2: FakeDb, private name: string) { super(db2, name); }
  doc(id?: string) { return new FakeRef(this.db2, this.name, id ?? `auto-${++this.db2.autoId}`); }
}
class FakeDb {
  store = new Map<string, Record<string, any>>();
  autoId = 0;
  collection(name: string) { return new FakeCollection(this, name); }
  seed(coll: string, id: string, data: Record<string, any>) { this.store.set(`${coll}/${id}`, clone(data)); }
  get(coll: string, id: string) { return clone(this.store.get(`${coll}/${id}`)); }
  all(coll: string): Array<Record<string, any>> {
    return [...this.store.entries()].filter(([k]) => k.startsWith(coll + '/')).map(([k, v]) => ({ id: k.split('/')[1], ...clone(v) }));
  }
  // Writes are buffered and applied only if the callback resolves, like a real transaction.
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const tx = {
      get: async (x: any) => (x instanceof FakeRef ? x.get() : x.__run()),
      set: (ref: FakeRef, data: any) => writes.push(() => this.store.set(ref.key, clone(data))),
      update: (ref: FakeRef, data: any) =>
        writes.push(() => {
          const cur = this.store.get(ref.key);
          assert.ok(cur, 'update of a missing doc');
          this.store.set(ref.key, { ...cur, ...clone(data) });
        }),
    };
    const out = await fn(tx);
    writes.forEach((w) => w());
    return out;
  }
}

// ---------- fixtures ----------
const fresh = () => {
  const db = new FakeDb();
  const student = (uid: string, centreId: string | undefined, extra: Record<string, any> = {}) => ({
    uid, name: `Student ${uid}`, programmeName: 'JAMB', totalFee: 100000, paidAmount: 0,
    outstandingBalance: 100000, paymentStatus: 'Pending', ...(centreId ? { centreId } : {}), ...extra,
  });
  db.seed('students', 'stu-1', student('u-stu1', 'c1'));
  db.seed('students', 'stu-2', student('u-stu2', 'c1'));
  db.seed('students', 'stu-b', student('u-stub', 'c2'));
  db.seed('students', 'stu-legacy', student('u-leg', undefined));
  db.seed('admins', 'u-adm1', { centreId: 'c1' });
  db.seed('admins', 'u-adm2', { centreId: 'c2' });
  db.seed('admins', 'u-admNoCentre', {});
  return db;
};
const user = (uid: string, tos = false): PaymentCaller => ({ uid, email: `${uid}@test.com`, tos });
const as = async (db: FakeDb, c: PaymentCaller) => ({ c, a: await loadPaymentActor(db as any, c) });
const claim = (db: FakeDb, who: { c: PaymentCaller; a: any }, studentId: string, amount: number) =>
  submitPayment(db as any, who.c, who.a, { studentId, amount, method: 'Bank Transfer' });
const decide = (db: FakeDb, who: { c: PaymentCaller; a: any }, paymentId: string, action: 'confirm' | 'reject', reason?: string) =>
  decidePayment(db as any, who.c, who.a, { paymentId, action, reason });
const rejectsWith = async (p: Promise<unknown>, status: number) => {
  await assert.rejects(p, (e: unknown) => e instanceof PaymentError && e.status === status);
};
const feesOf = (db: FakeDb, id: string) => {
  const s = db.get('students', id)!;
  return { paid: s.paidAmount, out: s.outstandingBalance, status: s.paymentStatus };
};

let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
};

(async () => {
  await test('student claim is stored Pending and the balance does NOT move (the original exploit)', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    const r: any = await claim(db, stu, 'stu-1', 100000); // claim the full fee
    assert.equal(r.pending, true);
    assert.equal(r.payment.status, 'Pending');
    assert.equal(r.payment.receiptNumber, '');
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
    assert.equal(db.all('payments').length, 1);
    assert.equal(db.all('auditLogs')[0].action, 'payment.submit');
  });

  await test('student cannot submit for someone else, or overclaim', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    await rejectsWith(claim(db, stu, 'stu-2', 1000), 403);
    await rejectsWith(claim(db, stu, 'stu-b', 1000), 403);
    await rejectsWith(claim(db, stu, 'stu-1', 100001), 400);
    await rejectsWith(claim(db, stu, 'does-not-exist', 1000), 404);
    assert.equal(db.all('payments').length, 0);
    assert.equal(db.all('auditLogs').length, 0);
  });

  await test('student can submit using their uid as the record id', async () => {
    const db = fresh();
    db.seed('students', 'u-direct', { uid: '', name: 'Direct', totalFee: 500, paidAmount: 0, centreId: 'c1' });
    const r: any = await claim(db, await as(db, user('u-direct')), 'u-direct', 500);
    assert.equal(r.pending, true);
  });

  await test('pending claims are capped per student', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    for (let i = 0; i < 5; i++) await claim(db, stu, 'stu-1', 100);
    await rejectsWith(claim(db, stu, 'stu-1', 100), 429);
    assert.equal(db.all('payments').length, 5);
  });

  await test('a student (non-admin) cannot confirm or reject anything', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    const r: any = await claim(db, stu, 'stu-1', 100000);
    await rejectsWith(decide(db, stu, r.payment.id, 'confirm'), 403);
    await rejectsWith(decide(db, stu, r.payment.id, 'reject'), 403);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
    assert.equal(db.get('payments', r.payment.id)!.status, 'Pending');
  });

  await test('admin confirms a claim: balance, receipt and audit all move together', async () => {
    const db = fresh();
    const r: any = await claim(db, await as(db, user('u-stu1')), 'stu-1', 40000);
    const out: any = await decide(db, await as(db, user('u-adm1')), r.payment.id, 'confirm');
    assert.equal(out.status, 'Partial');
    assert.match(out.receiptNumber, /^REC-\d{4}-\d{6}$/);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 40000, out: 60000, status: 'Partial' });
    const p = db.get('payments', r.payment.id)!;
    assert.equal(p.status, 'Partial');
    assert.equal(p.confirmedBy, 'u-adm1');
    assert.equal(p.balance, 60000);
    assert.ok(db.all('auditLogs').some((l) => l.action === 'payment.confirm'));
  });

  await test('a claim can be confirmed only once (no double credit)', async () => {
    const db = fresh();
    const adm = await as(db, user('u-adm1'));
    const r: any = await claim(db, await as(db, user('u-stu1')), 'stu-1', 40000);
    await decide(db, adm, r.payment.id, 'confirm');
    await rejectsWith(decide(db, adm, r.payment.id, 'confirm'), 409);
    await rejectsWith(decide(db, adm, r.payment.id, 'reject'), 409);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 40000, out: 60000, status: 'Partial' });
  });

  await test('two partial claims settle the fee exactly', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    const adm = await as(db, user('u-adm1'));
    const a: any = await claim(db, stu, 'stu-1', 40000);
    const b: any = await claim(db, stu, 'stu-1', 60000);
    await decide(db, adm, a.payment.id, 'confirm');
    const out: any = await decide(db, adm, b.payment.id, 'confirm');
    assert.equal(out.status, 'Paid');
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 100000, out: 0, status: 'Paid' });
  });

  await test('overlapping claims cannot overpay: second confirm is refused, can be rejected', async () => {
    const db = fresh();
    const stu = await as(db, user('u-stu1'));
    const adm = await as(db, user('u-adm1'));
    const a: any = await claim(db, stu, 'stu-1', 60000);
    const b: any = await claim(db, stu, 'stu-1', 60000); // both pass: each is under 100000 at submit time
    await decide(db, adm, a.payment.id, 'confirm');
    await rejectsWith(decide(db, adm, b.payment.id, 'confirm'), 409);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 60000, out: 40000, status: 'Partial' });
    assert.equal(db.get('payments', b.payment.id)!.status, 'Pending');
    await decide(db, adm, b.payment.id, 'reject', 'Duplicate transfer');
    const rejected = db.get('payments', b.payment.id)!;
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.rejectionReason, 'Duplicate transfer');
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 60000, out: 40000, status: 'Partial' });
  });

  await test('rejecting never touches the balance', async () => {
    const db = fresh();
    const r: any = await claim(db, await as(db, user('u-stu1')), 'stu-1', 100000);
    await decide(db, await as(db, user('u-adm1')), r.payment.id, 'reject');
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
    assert.equal(db.get('payments', r.payment.id)!.status, 'Rejected');
  });

  await test('an admin from another centre cannot confirm or reject (and nothing changes)', async () => {
    const db = fresh();
    const r: any = await claim(db, await as(db, user('u-stu1')), 'stu-1', 40000);
    const other = await as(db, user('u-adm2'));
    await rejectsWith(decide(db, other, r.payment.id, 'confirm'), 403);
    await rejectsWith(decide(db, other, r.payment.id, 'reject'), 403);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
    assert.equal(db.get('payments', r.payment.id)!.status, 'Pending');
  });

  await test('an admin with no centre assigned is refused (fails closed)', async () => {
    const db = fresh();
    const r: any = await claim(db, await as(db, user('u-stu1')), 'stu-1', 40000);
    const bad = await as(db, user('u-admNoCentre'));
    await rejectsWith(decide(db, bad, r.payment.id, 'confirm'), 403);
    await rejectsWith(claim(db, bad, 'stu-1', 100), 403);
  });

  await test('platform staff (tos) without a centre can act on any centre', async () => {
    const db = fresh();
    const r: any = await claim(db, await as(db, user('u-stub')), 'stu-b', 25000);
    const out: any = await decide(db, await as(db, user('u-platform', true)), r.payment.id, 'confirm');
    assert.equal(out.status, 'Partial');
    assert.deepEqual(feesOf(db, 'stu-b'), { paid: 25000, out: 75000, status: 'Partial' });
  });

  await test('legacy student with no centreId: admin refused, student can still claim, confirm refused', async () => {
    const db = fresh();
    const adm = await as(db, user('u-adm1'));
    await rejectsWith(claim(db, adm, 'stu-legacy', 100), 403);
    const r: any = await claim(db, await as(db, user('u-leg')), 'stu-legacy', 500);
    assert.equal(r.pending, true);
    assert.equal(r.payment.centreId, '');
    await rejectsWith(decide(db, adm, r.payment.id, 'confirm'), 403);
  });

  await test('admin direct record applies immediately, same-centre only, no overpayment', async () => {
    const db = fresh();
    const adm = await as(db, user('u-adm1'));
    const r: any = await claim(db, adm, 'stu-1', 30000);
    assert.equal(r.pending, false);
    assert.equal(r.payment.submittedBy, 'Admin');
    assert.match(r.payment.receiptNumber, /^REC-/);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 30000, out: 70000, status: 'Partial' });
    await rejectsWith(claim(db, adm, 'stu-b', 100), 403); // other centre
    await rejectsWith(claim(db, adm, 'stu-1', 70000.01), 400); // overpay
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 30000, out: 70000, status: 'Partial' });
  });

  await test('a refused transaction writes nothing (no payment, no audit log, no balance change)', async () => {
    const db = fresh();
    const adm = await as(db, user('u-adm1'));
    await rejectsWith(claim(db, adm, 'stu-1', 100001), 400);
    assert.equal(db.all('payments').length, 0);
    assert.equal(db.all('auditLogs').length, 0);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
  });

  await test('confirming a missing payment is 404; a corrupt amount is refused', async () => {
    const db = fresh();
    const adm = await as(db, user('u-adm1'));
    await rejectsWith(decide(db, adm, 'pay-nope', 'confirm'), 404);
    db.seed('payments', 'pay-bad', { studentId: 'stu-1', centreId: 'c1', status: 'Pending', amountPaid: -5 });
    await rejectsWith(decide(db, adm, 'pay-bad', 'confirm'), 409);
    assert.deepEqual(feesOf(db, 'stu-1'), { paid: 0, out: 100000, status: 'Pending' });
  });

  console.log(`--- ALL ${passed} PAYMENT SERVICE TESTS PASSED SUCCESSFULLY ---`);
})().catch((e) => {
  console.error('✗ FAILED:', e);
  process.exit(1);
});
