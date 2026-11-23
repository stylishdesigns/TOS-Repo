// ============================================================================
// Seat-days (batch 19): seats carry days, not students.
//
// Each seat the facility pays for holds 30 calendar days (14 on trial). A
// seat counts only while a student is on it (batch 21): it is switched on by
// adding a student, burns one Lagos calendar day for every day it runs, and
// locks when its days run out, switching that student's access off.
// Reopening the seat takes a new payment. Batch 22 adds free seats: a
// platform-granted block that never expires, carries no switch and renders
// first in the facility's pool.
//
// Everything here runs server-side only (admin SDK). The client never reads
// the centreSeats collection directly; it sees seats through the seats
// summary, so no Firestore rule changes are needed.
// ============================================================================
import { adminDb } from './firebaseAdmin';
import { STARTING_CONFIG } from './platformDefaults';

/** The live platform config as one plain object, STARTING_CONFIG underneath.
 *  Local on purpose: importing getPlatformConfig from tenantService would
 *  make a cycle. */
async function readSeatConfig(): Promise<any> {
  try {
    const snap = await adminDb.collection('platformConfig').doc('global').get();
    return { ...STARTING_CONFIG, ...(snap.data() || {}) };
  } catch {
    return { ...STARTING_CONFIG };
  }
}

export const SEAT_DAYS_PAID = 30;
export const SEAT_DAYS_TRIAL = 14;

export type SeatStatus = 'available' | 'active' | 'locked';

export interface SeatHistoryEntry {
  uid: string;
  name?: string;
  from?: string | null;
  to?: string | null;
  reason?: string;
}

export interface SeatRead {
  status?: SeatStatus;
  kind?: 'free' | 'paid';
  daysTotal?: number;
  daysUsedBase?: number;
  startedAt?: string | null;
  studentUid?: string;
  studentName?: string;
  assignedAt?: string | null;
  history?: SeatHistoryEntry[];
  seatNo?: number;
}

// Lagos is UTC+1 all year: the wall-clock date decides which calendar day a
// moment belongs to, so day counting matches what the facility sees.
function lagosDateKey(at: string | number | Date): string {
  const shifted = new Date(new Date(at).getTime() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Paid seat or free grant. Seats written before batch 22 are paid. */
export function seatKind(seat: SeatRead): 'free' | 'paid' {
  return (seat as any).kind === 'free' ? 'free' : 'paid';
}

/** True while the facility sits inside its trial window. */
export function isOnTrial(billing: any): boolean {
  if (!billing || billing.skippedTrial) return false;
  const t = billing.trialEndsAt ? new Date(billing.trialEndsAt).getTime() : 0;
  return t > Date.now();
}

/** Days used and days left for one seat right now. */
export function seatUsage(
  seat: SeatRead,
  now: Date = new Date()
): { daysUsed: number; remaining: number } {
  // A free seat never burns: it has no day countdown at all.
  if (seatKind(seat) === 'free') return { daysUsed: 0, remaining: 9999 };
  const total = Math.max(1, Number(seat.daysTotal || SEAT_DAYS_PAID));
  const base = Math.max(0, Number(seat.daysUsedBase || 0));
  if (seat.status === 'active' && seat.startedAt) {
    // The day the seat is switched on counts as its first burning day; every
    // later calendar day adds one more, student or not.
    const elapsed = Math.max(0, daysBetweenKeys(lagosDateKey(seat.startedAt), lagosDateKey(now)));
    const daysUsed = Math.min(total, base + elapsed + 1);
    return { daysUsed, remaining: Math.max(0, total - daysUsed) };
  }
  const daysUsed = Math.min(total, base);
  return { daysUsed, remaining: Math.max(0, total - daysUsed) };
}

/** One facility's seats, oldest seat number first. */
export async function listSeats(centreId: string) {
  const snap = await adminDb.collection('centreSeats').where('centreId', '==', centreId).get();
  return snap.docs.sort((a, b) => Number((a.data() as any).seatNo || 0) - Number((b.data() as any).seatNo || 0));
}

async function hasSeats(centreId: string): Promise<boolean> {
  const snap = await adminDb
    .collection('centreSeats')
    .where('centreId', '==', centreId)
    .limit(1)
    .get();
  return !snap.empty;
}

interface SeedContext {
  billing: any;
  trialSeatCap: number;
  freeSeats: number;
}

/** Batch 23: a new facility starts with ONLY its free-seat grant. Paid seats
 *  exist only when the facility creates one itself (Add seat) or a payment
 *  buys seats; nothing else is seeded by default. */
export async function ensureSeatsForCentre(centreId: string, ctx: SeedContext): Promise<void> {
  if (await hasSeats(centreId)) return;
  await reconcileFreeSeats(centreId, ctx.freeSeats);
}

/** Batch 23, runs once per facility on its first seats read after this ships:
 *  the one-time tidy-up of the old default seeding.
 *  1. Free seats first: every student holding a paid seat moves to an open
 *     free seat. A student on a locked seat stays put; the lock is their
 *     current state and a payment reopens their seat.
 *  2. Empty paid seats that Tutorial OS seeded by default are removed. Paid
 *     seats now exist only when the facility creates one (source 'manual')
 *     or a payment buys them (source 'payment'); both are stamped going
 *     forward and always survive this pass.
 *  3. The pool is renumbered: free seats take 1..freeCount and paid seats
 *     continue after them, so the free seats are always the first set.
 *  Guarded by billing.defaultSeatsCleanedAt, so it runs at most once. */
export async function reconcileSeatOrder(centreId: string): Promise<{ moved: number; deleted: number; renumbered: number }> {
  const billingRef = adminDb.collection('centreBilling').doc(centreId);
  const billingDoc = await billingRef.get();
  if ((billingDoc.data() as any)?.defaultSeatsCleanedAt) return { moved: 0, deleted: 0, renumbered: 0 };
  const now = new Date();
  const nowIso = now.toISOString();
  let seats = await listSeats(centreId);
  if (!seats.length) {
    await billingRef.set({ defaultSeatsCleanedAt: nowIso }, { merge: true });
    return { moved: 0, deleted: 0, renumbered: 0 };
  }
  let moved = 0;
  const openFrees = seats
    .filter((d) => seatKind(d.data() as SeatRead) === 'free' && !String((d.data() as any).studentUid || ''))
    .sort((a, b) => Number((a.data() as any).seatNo || 0) - Number((b.data() as any).seatNo || 0));
  for (const doc of seats) {
    const s = doc.data() as any;
    if (seatKind(s) !== 'paid' || !String(s.studentUid || '')) continue;
    const target = openFrees.shift();
    if (!target) break;
    const t = target.data() as any;
    const history: SeatHistoryEntry[] = Array.isArray(s.history) ? s.history.slice(-50) : [];
    history.push({
      uid: String(s.studentUid),
      name: String(s.studentName || ''),
      from: s.assignedAt || s.startedAt || null,
      to: nowIso,
      reason: 'moved to a free seat',
    });
    await doc.ref.update({
      status: 'available' as SeatStatus,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      daysUsedBase: seatUsage(s, now).daysUsed,
      freedAt: nowIso,
      history,
    });
    await target.ref.update({
      status: 'active' as SeatStatus,
      studentUid: String(s.studentUid),
      studentName: String(s.studentName || ''),
      assignedAt: nowIso,
      startedAt: nowIso,
      daysUsedBase: 0,
    });
    await adminDb
      .collection('memberships')
      .doc(`${s.studentUid}__${centreId}`)
      .set({ seatId: target.id, seatNo: Number(t.seatNo || 0), updatedAt: nowIso }, { merge: true });
    moved += 1;
  }
  if (moved) seats = await listSeats(centreId);
  let deleted = 0;
  for (const doc of seats) {
    const s = doc.data() as any;
    if (seatKind(s) !== 'paid') continue;
    if (String(s.studentUid || '')) continue;
    const source = String(s.source || '');
    if (source === 'payment' || source === 'manual') continue;
    await doc.ref.delete();
    deleted += 1;
  }
  if (deleted) seats = await listSeats(centreId);
  const frees = seats
    .filter((d) => seatKind(d.data() as SeatRead) === 'free')
    .sort((a, b) => Number((a.data() as any).seatNo || 0) - Number((b.data() as any).seatNo || 0));
  const paids = seats
    .filter((d) => seatKind(d.data() as SeatRead) === 'paid')
    .sort((a, b) => Number((a.data() as any).seatNo || 0) - Number((b.data() as any).seatNo || 0));
  const finals = [
    ...frees.map((d, i) => ({ src: d, no: i + 1 })),
    ...paids.map((d, i) => ({ src: d, no: frees.length + i + 1 })),
  ];
  const stale = finals.some(
    (f) => Number((f.src.data() as any).seatNo || 0) !== f.no || f.src.id !== `${centreId}__seat-${f.no}`
  );
  let renumbered = 0;
  if (stale) {
    // Stage at temporary ids first: a final id can still be held by another
    // seat until the whole pass finishes, so nothing is overwritten mid-way.
    const staged = finals.map((f) => ({
      no: f.no,
      data: { ...((f.src.data() as any) || {}), seatNo: f.no },
      holderUid: String((f.src.data() as any).studentUid || ''),
    }));
    const b1 = adminDb.batch();
    staged.forEach((st) => b1.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-staged-${st.no}`), st.data));
    await b1.commit();
    const b2 = adminDb.batch();
    seats.forEach((d) => b2.delete(d.ref));
    await b2.commit();
    const b3 = adminDb.batch();
    staged.forEach((st) => {
      b3.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${st.no}`), st.data);
      b3.delete(adminDb.collection('centreSeats').doc(`${centreId}__seat-staged-${st.no}`));
    });
    await b3.commit();
    for (const st of staged) {
      if (st.holderUid) {
        await adminDb
          .collection('memberships')
          .doc(`${st.holderUid}__${centreId}`)
          .set({ seatId: `${centreId}__seat-${st.no}`, seatNo: st.no, updatedAt: nowIso }, { merge: true });
      }
    }
    renumbered = staged.length;
  }
  await billingRef.set({ defaultSeatsCleanedAt: nowIso }, { merge: true });
  return { moved, deleted, renumbered };
}

/** Batch 23: the facility creates its own paid seat from the control room.
 *  One seat per call, banked with a fresh 30 days, stamped source 'manual'.
 *  The same rules payments respect: off trial the facility chooses its plan
 *  first, and the paid-seat cap bounds how many paid seats it may hold. */
export async function addSeatForCentre(
  centreId: string
): Promise<{ added: boolean; seatNo: number; capped: boolean; cap: number; planRequired?: boolean; message?: string }> {
  const billing = (await adminDb.collection('centreBilling').doc(centreId).get()).data() || {};
  const config = await readSeatConfig();
  if (!isOnTrial(billing) && !String(billing.planId || '')) {
    return { added: false, seatNo: 0, capped: false, cap: 0, planRequired: true, message: 'Choose a plan before creating seats.' };
  }
  const cap = isOnTrial(billing)
    ? Math.max(1, Math.floor(Number((config as any)?.trialMaxSeats ?? 10)))
    : (config as any)?.paidSeatsUnlimited === true
      ? Infinity
      : Math.max(1, Math.floor(Number((config as any)?.paidMaxSeats ?? 50)));
  const seats = await listSeats(centreId);
  const paidHeld = seats.filter((d) => seatKind(d.data() as SeatRead) === 'paid').length;
  if (Number.isFinite(cap) && paidHeld >= cap) {
    return {
      added: false,
      seatNo: 0,
      capped: true,
      cap,
      message: `You have reached your seat cap of ${cap} seats. A new payment or a plan change raises it.`,
    };
  }
  const nextNo = seats.reduce((m, d) => Math.max(m, Number((d.data() as any).seatNo || 0)), 0) + 1;
  const nowIso = new Date().toISOString();
  await adminDb.collection('centreSeats').doc(`${centreId}__seat-${nextNo}`).set({
    centreId,
    seatNo: nextNo,
    status: 'available' as SeatStatus,
    kind: 'paid' as const,
    source: 'manual',
    daysTotal: SEAT_DAYS_PAID,
    daysUsedBase: 0,
    startedAt: null,
    studentUid: '',
    studentName: '',
    assignedAt: null,
    history: [] as SeatHistoryEntry[],
    createdAt: nowIso,
  });
  try {
    await adminDb.collection('auditLogs').add({ action: 'SEAT_ADDED', centreId, seatNo: nextNo, at: nowIso });
  } catch {
    /* audit is best effort */
  }
  return { added: true, seatNo: nextNo, capped: false, cap: Number.isFinite(cap) ? cap : 0 };
}

export interface LockOutcome {
  seatNo: number;
  studentUid: string;
  studentName: string;
}

/** Lock every active seat whose days are spent, detaching its student (access
 *  off). Runs on every seats read and in the sweep; notifications fire once
 *  per seat per cycle. Returns what it locked this pass. */
export async function lockExpiredSeatsForCentre(
  centreId: string,
  opts: { centreName?: string; now?: Date } = {}
): Promise<LockOutcome[]> {
  const now = opts.now || new Date();
  const nowIso = now.toISOString();
  const snap = await adminDb
    .collection('centreSeats')
    .where('centreId', '==', centreId)
    .where('status', '==', 'active')
    .get();
  if (snap.empty) return [];
  const centreName =
    opts.centreName ||
    (await adminDb
      .collection('centres')
      .doc(centreId)
      .get()
      .then((d) => String((d.data() as any)?.name || 'Your facility'))
      .catch(() => 'Your facility'));
  const locked: LockOutcome[] = [];
  for (const doc of snap.docs) {
    const seat = doc.data() as SeatRead;
    // A seat with no student on it never counts. Bank any empty running seat
    // so its used days freeze and it waits in the pool instead.
    if (!String(seat.studentUid || '')) {
      const { daysUsed } = seatUsage(seat, now);
      await doc.ref.update({
        status: 'available' as SeatStatus,
        startedAt: null,
        studentUid: '',
        studentName: '',
        assignedAt: null,
        daysUsedBase: daysUsed,
        freedAt: nowIso,
      });
      continue;
    }
    // Free seats never expire.
    if (seatKind(seat) === 'free') continue;
    const { remaining } = seatUsage(seat, now);
    if (remaining > 0) continue;
    const total = Math.max(1, Number(seat.daysTotal || SEAT_DAYS_PAID));
    const uid = String(seat.studentUid || '');
    const name = String(seat.studentName || '');
    const history: SeatHistoryEntry[] = Array.isArray(seat.history) ? seat.history.slice(-50) : [];
    if (uid) {
      history.push({
        uid,
        name,
        from: seat.assignedAt || seat.startedAt || null,
        to: nowIso,
        reason: 'seat expired',
      });
    }
    await doc.ref.update({
      status: 'locked' as SeatStatus,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      daysUsedBase: total,
      history,
      lockedAt: nowIso,
    });
    if (uid) {
      try {
        await adminDb
          .collection('memberships')
          .doc(`${uid}__${centreId}`)
          .set(
            { status: 'disabled', seatId: '', seatNo: 0, lastAccessToggledAt: nowIso, updatedAt: nowIso },
            { merge: true }
          );
        const bRef = adminDb.collection('centreBilling').doc(centreId);
        const bDoc = await bRef.get();
        const cur = Number((bDoc.data() as any)?.activeStudentCount || 0);
        await bRef.set({ activeStudentCount: Math.max(0, cur - 1) }, { merge: true });
        // The student portal listens to its own profile doc live; this stamp
        // is what turns their app into the contact-admin banner at once.
        await adminDb.collection('students').doc(uid).set({ accessStatus: 'off' }, { merge: true });
      } catch {
        /* the sweep retries this seat on its next pass */
      }
    }
    locked.push({ seatNo: Number(seat.seatNo || 0), studentUid: uid, studentName: name });
    try {
      await notifySeat(centreId, centreName, {
        seatNo: Number(seat.seatNo || 0),
        studentName: name,
        kind: 'locked',
        daysTotal: total,
        startedAt: seat.startedAt || null,
      });
    } catch {
      /* notification failures never block the lock */
    }
  }
  return locked;
}

/** Where a newly switched-on student goes. Batch 22: an unlocked free seat
 *  wins first (it never burns a day, lowest number on a tie), then the banked
 *  paid seat with the most days left (lowest number on a tie). Null when the
 *  pool has nothing to give. */
export async function drawFreeSeatForCentre(
  centreId: string,
  now: Date = new Date(),
  opts: { freeSeatsUnlocked?: boolean } = {}
): Promise<{ id: string; seatNo: number; remaining: number } | null> {
  const snap = await adminDb
    .collection('centreSeats')
    .where('centreId', '==', centreId)
    .get();
  if (snap.empty) return null;
  let bestFree: { id: string; seatNo: number; remaining: number } | null = null;
  let bestBanked: { id: string; seatNo: number; remaining: number } | null = null;
  for (const doc of snap.docs) {
    const data = doc.data() as SeatRead;
    const status = data.status;
    if (status !== 'active' && status !== 'available') continue;
    if (status === 'active') continue; // occupied and running: not free
    const seatNo = Number(data.seatNo || 0);
    if (seatKind(data) === 'free') {
      if (opts.freeSeatsUnlocked === false) continue;
      if (!bestFree || seatNo < bestFree.seatNo) bestFree = { id: doc.id, seatNo, remaining: 9999 };
      continue;
    }
    const { remaining } = seatUsage(data, now);
    if (remaining <= 0) continue;
    if (!bestBanked || remaining > bestBanked.remaining || (remaining === bestBanked.remaining && seatNo < bestBanked.seatNo)) {
      bestBanked = { id: doc.id, seatNo, remaining };
    }
  }
  return bestFree || bestBanked;
}

/** A payment tops the pool: locked seats reopen with a fresh 30 days first,
 *  then brand-new seats are added behind them. */
export async function provisionSeats(
  centreId: string,
  count: number
): Promise<{ reopened: number; added: number; total: number; requested: number; capped: boolean; cap: number; planRequired?: boolean; message?: string }> {
  const n = Math.max(0, Math.floor(Number(count || 0)));
  const seats = await listSeats(centreId);
  if (!n) return { reopened: 0, added: 0, total: seats.length, requested: 0, capped: false, cap: 0 };
  // Batch 22: the paid-seat cap. A facility on trial can hold at most
  // trialMaxSeats paid seats (on top of its free grant); everyone else at
  // most paidMaxSeats, unless the platform set paidSeatsUnlimited. Reopening
  // locked seats adds no seats, so it is never capped.
  const billing = (await adminDb.collection('centreBilling').doc(centreId).get()).data() || {};
  const config = await readSeatConfig();
  // Batch 22: a facility chooses its plan before creating seats off trial.
  if (!isOnTrial(billing) && !String(billing.planId || '')) {
    return { reopened: 0, added: 0, total: seats.length, requested: n, capped: false, cap: 0, planRequired: true, message: 'Choose a plan before creating seats.' };
  }
  const cap = isOnTrial(billing)
    ? Math.max(1, Math.floor(Number((config as any)?.trialMaxSeats ?? 10)))
    : (config as any)?.paidSeatsUnlimited === true
      ? Infinity
      : Math.max(1, Math.floor(Number((config as any)?.paidMaxSeats ?? 50)));
  const paidHeld = seats.filter((d) => seatKind(d.data() as SeatRead) === 'paid').length;
  const allowed = Number.isFinite(cap) ? Math.max(0, cap - paidHeld) : Infinity;
  const locked = seats.filter((d) => (d.data() as any).status === 'locked');
  const nextNo = seats.reduce((m, d) => Math.max(m, Number((d.data() as any).seatNo || 0)), 0);
  const nowIso = new Date().toISOString();
  const batch = adminDb.batch();
  let reopened = 0;
  for (const doc of locked) {
    if (reopened >= n) break;
    batch.update(doc.ref, {
      status: 'available' as SeatStatus,
      daysTotal: SEAT_DAYS_PAID,
      daysUsedBase: 0,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      reopenedAt: nowIso,
      expiryNoticeSentAt: null,
    });
    reopened += 1;
  }
  let added = 0;
  const wanted = Math.max(0, n - reopened);
  const canAdd = Number.isFinite(allowed) ? Math.min(wanted, allowed) : wanted;
  for (let i = 1; i <= canAdd; i++) {
    batch.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${nextNo + i}`), {
      centreId,
      seatNo: nextNo + i,
      status: 'available' as SeatStatus,
      kind: 'paid' as const,
      source: 'payment',
      daysTotal: SEAT_DAYS_PAID,
      daysUsedBase: 0,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      history: [] as SeatHistoryEntry[],
    });
    added += 1;
  }
  await batch.commit();
  const all = await listSeats(centreId);
  const capped = Number.isFinite(cap) && wanted > added;
  return { reopened, added, total: all.length, requested: n, capped, cap: Number.isFinite(cap) ? cap : 0 };
}

/** Pool counts for the TOS console and the admin control room header. */
export async function getSeatPool(centreId: string): Promise<{
  total: number;
  active: number;
  available: number;
  locked: number;
  bankedDays: number;
  free: number;
}> {
  try {
    await reconcileSeatOrder(centreId);
  } catch {
    /* retried on the next seats read */
  }
  const seats = await listSeats(centreId);
  const now = new Date();
  let active = 0;
  let available = 0;
  let locked = 0;
  let bankedDays = 0;
  let free = 0;
  for (const d of seats) {
    const s = d.data() as SeatRead;
    if (seatKind(s) === 'free') {
      free += 1;
      if (s.status === 'active') active += 1;
      else available += 1;
      continue; // free seats never add banked days: they never expire
    }
    if (s.status === 'active') {
      active += 1;
      continue;
    }
    if (s.status === 'available') {
      available += 1;
      bankedDays += seatUsage(s, now).remaining;
      continue;
    }
    locked += 1;
  }
  return { total: seats.length, active, available, locked, bankedDays, free };
}

/** Paid seats the facility holds (any status): what unlocks the free grant
 *  and what the landing-page minimum is judged on. */
export async function countPaidSeatsForCentre(centreId: string): Promise<number> {
  const seats = await listSeats(centreId);
  return seats.filter((d) => seatKind(d.data() as SeatRead) === 'paid').length;
}

/** Batch 22: keep the facility's free-seat grant current. Tops the pool up to
 *  the allocation with kind-'free' seats; never removes seats already there,
 *  so lowering a grant only stops future top-ups. */
export async function reconcileFreeSeats(centreId: string, allocation: number): Promise<number> {
  const want = Math.max(0, Math.floor(Number(allocation || 0)));
  const seats = await listSeats(centreId);
  const held = seats.filter((d) => seatKind(d.data() as SeatRead) === 'free').length;
  const missing = want - held;
  if (missing <= 0) return 0;
  const nextNo = seats.reduce((m, d) => Math.max(m, Number((d.data() as any).seatNo || 0)), 0);
  const nowIso = new Date().toISOString();
  const batch = adminDb.batch();
  for (let i = 1; i <= missing; i++) {
    batch.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${nextNo + i}`), {
      centreId,
      seatNo: nextNo + i,
      status: 'available' as SeatStatus,
      kind: 'free' as const,
      daysTotal: 0,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      history: [] as SeatHistoryEntry[],
      daysUsedBase: 0,
      grantedAt: nowIso,
    });
  }
  await batch.commit();
  return missing;
}

/** One in-app notification and one push per facility admin, guarded by a
 *  reminderSends doc so re-runs never double-send. */
export async function notifySeat(
  centreId: string,
  centreName: string,
  info: {
    seatNo: number;
    studentName?: string;
    kind: 'locked' | 'remind';
    remaining?: number;
    daysTotal: number;
    startedAt?: string | null;
  }
): Promise<boolean> {
  const cycleKey = info.startedAt ? lagosDateKey(info.startedAt) : 'x';
  const key =
    info.kind === 'locked'
      ? `seat-lock-${centreId}-seat${info.seatNo}-${cycleKey}`
      : `seat-rem-${centreId}-seat${info.seatNo}-${cycleKey}-${info.remaining}`;
  const guard = adminDb.collection('reminderSends').doc(key);
  const g = await guard.get();
  if (g.exists) return false;
  await guard.set({ createdAt: Date.now() });

  const who = info.studentName ? `Seat ${info.seatNo} (${info.studentName})` : `Seat ${info.seatNo}`;
  const title =
    info.kind === 'locked'
      ? `Seat ${info.seatNo} locked`
      : `${who}: ${info.remaining} day${info.remaining === 1 ? '' : 's'} left`;
  const body =
    info.kind === 'locked'
      ? `${centreName}: ${who} completed its ${info.daysTotal} days and is now locked${info.studentName ? `; ${info.studentName}'s access was switched off` : ''}. A new payment reopens seats.`
      : `${centreName}: ${who} has ${info.remaining} of ${info.daysTotal} days left. It locks when the days run out; a new payment tops it up.`;

  let admins;
  try {
    admins = await adminDb.collection('admins').where('centreId', '==', centreId).get();
  } catch {
    return false;
  }
  for (const a of admins.docs) {
    const v = a.data() as any;
    const uid = String(v.uid || '');
    const role = String(v.role || '');
    if (!uid) continue;
    if (role && !['owner', 'admin', 'centre_admin'].includes(role)) continue;
    try {
      await adminDb.collection('notifications').doc(`not-${key}-${uid.slice(0, 8)}`).set({
        centreId,
        type: 'billing',
        title,
        body,
        audienceUid: uid,
        createdAt: Date.now(),
        subjects: [],
        programmes: [],
      });
    } catch {
      /* in-app is best effort; the push still tries */
    }
    try {
      await adminDb.collection('pushQueue').doc(`push-${key}-${uid.slice(0, 8)}`).set({
        kind: 'seat_reminder',
        uid,
        centreId,
        pushTitle: title,
        pushBody: body,
        sendAt: Date.now(),
        sent: false,
        attempts: 0,
      });
    } catch {
      /* push failures are caught by the sender's own retry */
    }
  }
  return true;
}
