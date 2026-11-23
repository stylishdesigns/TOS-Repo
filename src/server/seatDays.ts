// ============================================================================
// Seat-days (batch 19): seats carry days, not students.
//
// Each seat the facility pays for holds 30 days. A seat counts
// only while a student is on it (batch 21): it is switched on by adding a
// student, and (batch 24) burns one day for every FULL 24 HOURS it runs.
// Switching off pauses the count; re-adding the student the same day resumes
// it, so fiddling the switch never counts a day twice. When its days run out
// it locks, switching that student's access off.
// Reopening the seat takes a new payment. Batch 22 adds free seats: a
// platform-granted block that never expires, carries no switch and renders
// first in the facility's pool. Batch 26 retires the free trial: every
// facility is a lead (free seats only) until it upgrades to a plan.
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

/** Batch 26: the facility's tier. A LEAD has signed up and never upgraded: it
 *  uses only its free-seat grant and has no public landing page. A FACILITY
 *  has upgraded by paying for at least the minimum seats. */
export function facilityTier(billing: any): 'lead' | 'facility' {
  return billing && billing.tier === 'facility' ? 'facility' : 'lead';
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
  // Batch 24: a day counts only after 24 full hours of the seat actually
  // running. runMs banks the running time from earlier stretches; the live
  // stretch adds its elapsed time on top, so a same-day switch off and back
  // on never counts a second day.
  const runMs = Math.max(0, Number((seat as any).runMs || 0));
  let ms = runMs;
  if (seat.status === 'active' && seat.startedAt) {
    const started = new Date(seat.startedAt).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, now.getTime() - started);
  }
  const daysUsed = Math.min(total, base + Math.floor(ms / 86400000));
  return { daysUsed, remaining: Math.max(0, total - daysUsed) };
}

/** Running milliseconds a seat has banked at the moment it stops running
 *  (switched off, banked or locked): everything it ran before plus the live
 *  stretch, frozen until it runs again. */
export function freezeSeatRunMs(seat: SeatRead, now: Date = new Date()): number {
  const prior = Math.max(0, Number((seat as any).runMs || 0));
  if (seat.status !== 'active' || !seat.startedAt) return prior;
  const started = new Date(seat.startedAt).getTime();
  if (!Number.isFinite(started)) return prior;
  return prior + Math.max(0, now.getTime() - started);
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
      runMs: freezeSeatRunMs(s, now),
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
      runMs: 0,
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

/** Batch 23/24: the facility creates its own paid seats from the control
 *  room. The Add seat pop-up sends how many seats to create. The platform
 *  minimum (paidSeatMinimum, judged on PAID seats only: free seats never
 *  count toward it) gates the first creation for trial and paid facilities
 *  alike: below it, a request that would not reach the minimum is refused
 *  with the exact shortfall, and the request that reaches it creates every
 *  selected seat at once. From the minimum up, any number goes. The same
 *  rules payments respect: off trial the facility chooses its plan first,
 *  and the paid-seat cap bounds how many paid seats it may hold. */
export async function addSeatsForCentre(
  centreId: string,
  count: number
): Promise<{
  added: boolean;
  count: number;
  created: number[];
  underMinimum: boolean;
  minimum: number;
  paidHeld: number;
  needed: number;
  capped: boolean;
  cap: number;
  planRequired?: boolean;
  message?: string;
}> {
  const n = Math.max(1, Math.floor(Number(count || 1)));
  const billing = (await adminDb.collection('centreBilling').doc(centreId).get()).data() || {};
  const config = await readSeatConfig();
  const minimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
  if (!isOnTrial(billing) && !String(billing.planId || '')) {
    return { added: false, count: n, created: [], underMinimum: false, minimum, paidHeld: 0, needed: 0, capped: false, cap: 0, planRequired: true, message: 'Choose a plan before creating seats.' };
  }
  const cap = isOnTrial(billing)
    ? Math.max(1, Math.floor(Number((config as any)?.trialMaxSeats ?? 10)))
    : (config as any)?.paidSeatsUnlimited === true
      ? Infinity
      : Math.max(1, Math.floor(Number((config as any)?.paidMaxSeats ?? 50)));
  const seats = await listSeats(centreId);
  const paidHeld = seats.filter((d) => seatKind(d.data() as SeatRead) === 'paid').length;
  const allowed = Number.isFinite(cap) ? Math.max(0, cap - paidHeld) : Infinity;
  // The minimum gates the FIRST creation only: below it, the whole request
  // must reach the minimum in one go, so the seats arrive together.
  const needed = paidHeld < minimum ? minimum - paidHeld : 0;
  if (needed > 0 && n < needed) {
    return {
      added: false,
      count: n,
      created: [],
      underMinimum: true,
      minimum,
      paidHeld,
      needed,
      capped: false,
      cap: Number.isFinite(cap) ? cap : 0,
      message: `The platform requires at least ${minimum} paid seats before seats can be added one or two at a time. Your facility holds ${paidHeld} paid seat${paidHeld === 1 ? '' : 's'}, so create at least ${needed} more in one go.`,
    };
  }
  if (n > allowed) {
    return {
      added: false,
      count: n,
      created: [],
      underMinimum: false,
      minimum,
      paidHeld,
      needed,
      capped: true,
      cap: Number.isFinite(cap) ? cap : 0,
      message: Number.isFinite(cap)
        ? `You can add at most ${allowed} more paid seat${allowed === 1 ? '' : 's'} (cap ${cap}, ${paidHeld} held). A new payment or a plan change raises it.`
        : 'Could not create the seats.',
    };
  }
  const nextNo = seats.reduce((m, d) => Math.max(m, Number((d.data() as any).seatNo || 0)), 0);
  const nowIso = new Date().toISOString();
  const batch = adminDb.batch();
  const created: number[] = [];
  for (let i = 1; i <= n; i++) {
    const seatNo = nextNo + i;
    batch.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${seatNo}`), {
      centreId,
      seatNo,
      status: 'available' as SeatStatus,
      kind: 'paid' as const,
      source: 'manual',
      daysTotal: SEAT_DAYS_PAID,
      daysUsedBase: 0,
      runMs: 0,
      startedAt: null,
      studentUid: '',
      studentName: '',
      assignedAt: null,
      history: [] as SeatHistoryEntry[],
      createdAt: nowIso,
    });
    created.push(seatNo);
  }
  await batch.commit();
  try {
    await adminDb.collection('auditLogs').add({ action: 'SEAT_ADDED', centreId, count: n, seatNos: created, at: nowIso });
  } catch {
    /* audit is best effort */
  }
  return { added: true, count: n, created, underMinimum: false, minimum, paidHeld, needed, capped: false, cap: Number.isFinite(cap) ? cap : 0 };
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
      await doc.ref.update({
        status: 'available' as SeatStatus,
        startedAt: null,
        studentUid: '',
        studentName: '',
        assignedAt: null,
        runMs: freezeSeatRunMs(seat, now),
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
      runMs: freezeSeatRunMs(seat, now),
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
      runMs: 0,
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
      runMs: 0,
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

/** Batch 25: the seat allocation a platform-settings trim removes, one row
 *  each. Trim always takes the highest seat numbers first and takes vacant
 *  seats before occupied ones, so students keep their seats wherever
 *  possible and the survivors keep the low numbers. */
type TrimSeat = { id: string } & Record<string, any>;

function pickSeatsToTrim(seats: TrimSeat[], count: number): TrimSeat[] {
  const vacant = seats.filter((s) => !String(s.studentUid || ''));
  const occupied = seats.filter((s) => String(s.studentUid || ''));
  const byNoDesc = (a: TrimSeat, b: TrimSeat) => Number(b.seatNo || 0) - Number(a.seatNo || 0);
  return [...vacant.sort(byNoDesc), ...occupied.sort(byNoDesc)].slice(0, Math.max(0, count));
}

/** Remove ONE seat the platform trimmed away. A student on it is detached
 *  exactly like a manual switch-off: membership disabled, access off, the
 *  running-students counter drops, their stay is written into the seat's
 *  history. The seat document itself is then deleted. */
async function removeSeatDoc(centreId: string, seat: TrimSeat, reason: string, nowIso: string): Promise<boolean> {
  const uid = String(seat.studentUid || '');
  const name = String(seat.studentName || '');
  const seatNo = Number(seat.seatNo || 0);
  await adminDb.runTransaction(async (tx) => {
    const billingRef = adminDb.collection('centreBilling').doc(centreId);
    const history: SeatHistoryEntry[] = Array.isArray(seat.history) ? seat.history.slice(-50) : [];
    if (uid) {
      const bDoc = await tx.get(billingRef);
      const used = Number((bDoc.data() as any)?.activeStudentCount || 0);
      history.push({ uid, name, from: seat.assignedAt || seat.startedAt || null, to: nowIso, reason });
      tx.set(
        adminDb.collection('memberships').doc(`${uid}__${centreId}`),
        { status: 'disabled', seatId: '', seatNo: 0, lastAccessToggledAt: nowIso, updatedAt: nowIso },
        { merge: true }
      );
      tx.set(adminDb.collection('students').doc(uid), { accessStatus: 'off' }, { merge: true });
      tx.set(billingRef, { activeStudentCount: Math.max(0, used - 1) }, { merge: true });
    }
    tx.delete(adminDb.collection('centreSeats').doc(seat.id));
  });
  if (uid) {
    try {
      await adminDb.collection('auditLogs').add({
        actorUid: 'platform-config',
        centreId,
        action: 'SEAT_REMOVED_BY_CONFIG',
        seatNo,
        kind: seatKind(seat as SeatRead),
        studentUid: uid,
        studentName: name,
        reason,
        at: nowIso,
      });
    } catch { /* audit is best effort */ }
    try {
      await notifySeatRemoved(centreId, seatNo, name, nowIso);
    } catch { /* notification is best effort */ }
  }
  return Boolean(uid);
}

/** Tells a facility's admins one of their seats was removed by a platform
 *  settings change, once per seat per day. */
async function notifySeatRemoved(centreId: string, seatNo: number, studentName: string, nowIso: string): Promise<void> {
  const key = `seat-removed-${centreId}-seat${seatNo}-${lagosDateKey(nowIso)}`;
  const guard = adminDb.collection('reminderSends').doc(key);
  const g = await guard.get();
  if (g.exists) return;
  await guard.set({ createdAt: Date.now() });

  const who = studentName ? `Seat ${seatNo} (${studentName})` : `Seat ${seatNo}`;
  const title = `${who} removed`;
  const body = `Tutorial OS tightened the seat settings and ${who} fell outside them${studentName ? `; ${studentName}'s access was switched off` : ''}. Add the student to an open seat.`;

  let admins;
  try {
    admins = await adminDb.collection('admins').where('centreId', '==', centreId).get();
  } catch {
    return;
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
    } catch { /* in-app is best effort; the push still tries */ }
    try {
      await adminDb.collection('pushQueue').doc(`push-${key}-${uid.slice(0, 8)}`).set({
        kind: 'seat_removed',
        uid,
        centreId,
        pushTitle: title,
        pushBody: body,
        sendAt: Date.now(),
        sent: false,
        attempts: 0,
      });
    } catch { /* push failures are caught by the sender's own retry */ }
  }
}

/** The facility's free-seat allocation: a per-facility override wins, else
 *  the platform-wide default (batch 22). Shared by the seats read and the
 *  settings sweep so both judge the same number. */
export function effectiveFreeSeats(billing: any, config: any): number {
  const custom = billing?.freeSeatsCustom;
  if (custom !== null && custom !== undefined && String(custom).trim() !== '') {
    return Math.max(0, Math.floor(Number(custom)));
  }
  return Math.max(0, Math.floor(Number((config as any)?.freeSeatsGeneral ?? 5)));
}

/** Batch 22, tightened by batch 25: keep the facility's free-seat grant in
 *  step with the platform setting, live. Below the allocation the pool is
 *  topped up with kind-'free' seats; above it the pool is TRIMMED back
 *  down, so lowering the setting removes seats the same moment it saves
 *  instead of only stopping future top-ups. A student on a trimmed seat is
 *  detached with their access switched off, exactly like a manual
 *  switch-off. The allocation handed in is already the facility's
 *  effective one (override wins). */
export async function reconcileFreeSeats(centreId: string, allocation: number): Promise<{ added: number; removed: number; detached: number }> {
  const want = Math.max(0, Math.floor(Number(allocation || 0)));
  const seats = await listSeats(centreId);
  const freeDocs = seats.filter((d) => seatKind(d.data() as SeatRead) === 'free');
  const nowIso = new Date().toISOString();

  if (freeDocs.length > want) {
    let detached = 0;
    const victims = pickSeatsToTrim(freeDocs.map((d) => ({ id: d.id, ...(d.data() as any) })), freeDocs.length - want);
    for (const v of victims) {
      const took = await removeSeatDoc(centreId, v, 'free-seat allocation reduced', nowIso);
      if (took) detached += 1;
    }
    return { added: 0, removed: victims.length, detached };
  }

  const missing = want - freeDocs.length;
  if (missing <= 0) return { added: 0, removed: 0, detached: 0 };
  const nextNo = seats.reduce((m, d) => Math.max(m, Number((d.data() as any).seatNo || 0)), 0);
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
      runMs: 0,
      grantedAt: nowIso,
    });
  }
  await batch.commit();
  return { added: missing, removed: 0, detached: 0 };
}

/** Batch 25: hold a trial facility to its paid-seat cap live. Seats created
 *  above the cap go: highest numbers first, vacant before occupied, and a
 *  student on a trimmed seat is detached with their access switched off.
 *  Locked seats count toward the cap too; they are vacant, so they are
 *  trimmed first. */
export async function trimPaidSeatsForCap(centreId: string, cap: number): Promise<{ removed: number; detached: number }> {
  const want = Math.max(0, Math.floor(Number(cap)));
  const seats = await listSeats(centreId);
  const paidDocs = seats.filter((d) => seatKind(d.data() as SeatRead) === 'paid');
  const excess = paidDocs.length - want;
  if (excess <= 0) return { removed: 0, detached: 0 };
  const nowIso = new Date().toISOString();
  let detached = 0;
  const victims = pickSeatsToTrim(paidDocs.map((d) => ({ id: d.id, ...(d.data() as any) })), excess);
  for (const v of victims) {
    const took = await removeSeatDoc(centreId, v, 'trial seat cap reduced', nowIso);
    if (took) detached += 1;
  }
  return { removed: victims.length, detached };
}

/** Batch 25, trimmed by batch 26: apply the saved seat settings to EVERY
 *  facility at once, the moment the platform saves them. Each facility's
 *  free-seat grant is reconciled (top-up or trim, its own override wins).
 *  One facility failing never blocks the rest; the seats read self-heals
 *  the stragglers. */
export async function enforceSeatConfigAcrossFacilities(config: any): Promise<{
  facilities: number;
  freeSeatsAdded: number;
  freeSeatsRemoved: number;
  studentsDetached: number;
}> {
  const snap = await adminDb.collection('centreBilling').get();
  let freeSeatsAdded = 0;
  let freeSeatsRemoved = 0;
  let studentsDetached = 0;
  for (const d of snap.docs) {
    const billing = d.data() as any;
    try {
      const free = await reconcileFreeSeats(d.id, effectiveFreeSeats(billing, config));
      freeSeatsAdded += free.added;
      freeSeatsRemoved += free.removed;
      studentsDetached += free.detached;
    } catch { /* this facility retries on its next seats read */ }
  }
  return { facilities: snap.size, freeSeatsAdded, freeSeatsRemoved, studentsDetached };
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
