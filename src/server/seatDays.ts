// ============================================================================
// Seat-days (batch 19): seats carry days, not students.
//
// Each seat the facility pays for holds 30 calendar days (14 on trial). A seat
// that is switched on burns one day every calendar day, whether or not a
// student is attached, counting from the day it was switched on (Lagos
// calendar). When its days run out the seat locks itself, the attached
// student's access switches off, and reopening the seat takes a new payment.
// Switching a student on draws the free seat with the most days left;
// switching them off freezes the seat's used days and returns it to the
// facility's pool.
//
// Everything here runs server-side only (admin SDK). The client never reads
// the centreSeats collection directly; it sees seats through the seats
// summary, so no Firestore rule changes are needed.
// ============================================================================
import { adminDb } from './firebaseAdmin';

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

/** Days used and days left for one seat right now. */
export function seatUsage(
  seat: SeatRead,
  now: Date = new Date()
): { daysUsed: number; remaining: number } {
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
}

/** First read seeds the pool from the facility's existing billing state.
 *  Trial facilities get trialSeatCap seats burning with the trial clock (14
 *  days each). Everyone else gets a seat per live active student (30 days
 *  each, aligned to end with the paid period when one is under 30 days away)
 *  plus their billed minimum as banked spares. */
export async function ensureSeatsForCentre(centreId: string, ctx: SeedContext): Promise<void> {
  if (await hasSeats(centreId)) return;
  const nowIso = new Date().toISOString();
  const billing = ctx.billing || {};
  const trialEndsAt = billing.trialEndsAt ? new Date(billing.trialEndsAt) : null;
  const trialSeed = Boolean(trialEndsAt) && !billing.skippedTrial;

  // Who is switched on right now: they take the first seats, in seat order.
  let activeStudents: { uid: string; name: string }[] = [];
  try {
    const [mSnap, sSnap] = await Promise.all([
      adminDb.collection('memberships').where('centreId', '==', centreId).where('role', '==', 'student').get(),
      adminDb.collection('students').where('centreId', '==', centreId).limit(400).get(),
    ]);
    const names = new Map<string, string>();
    sSnap.docs.forEach((d) => {
      const v = d.data() as any;
      names.set(String(v.uid || d.id), String(v.name || ''));
    });
    activeStudents = mSnap.docs
      .filter((d) => (d.data() as any).status === 'active')
      .map((d) => {
        const v = d.data() as any;
        return { uid: String(v.uid || d.id), name: names.get(String(v.uid || d.id)) || '' };
      });
  } catch {
    /* the pool still seeds; attachments follow on the next toggle */
  }

  type NewSeat = {
    seatNo: number;
    status: SeatStatus;
    daysTotal: number;
    startedAt: string | null;
    studentUid: string;
    studentName: string;
    assignedAt: string | null;
    history: SeatHistoryEntry[];
    daysUsedBase: number;
  };
  const seats: NewSeat[] = [];

  if (trialSeed) {
    const n = Math.max(1, Number(ctx.trialSeatCap || 10));
    const startedAt = billing.trialStartsAt
      ? String(billing.trialStartsAt)
      : new Date(trialEndsAt!.getTime() - SEAT_DAYS_TRIAL * 86400000).toISOString();
    for (let i = 1; i <= n; i++) {
      const holder = activeStudents[i - 1];
      seats.push({
        seatNo: i,
        status: 'active',
        daysTotal: SEAT_DAYS_TRIAL,
        startedAt,
        studentUid: holder ? holder.uid : '',
        studentName: holder ? holder.name : '',
        assignedAt: holder ? nowIso : null,
        history: [],
        daysUsedBase: 0,
      });
    }
  } else {
    let n = Math.max(0, Number(billing.billedSeatsMinimum || 0));
    n = Math.max(n, activeStudents.length);
    if (n === 0 && Number(billing.seatCap || 0) > 0) n = Math.min(Number(billing.seatCap), 50);
    const paidThrough = billing.paidThrough ? new Date(billing.paidThrough) : null;
    const daysToPaidThrough = paidThrough ? Math.ceil((paidThrough.getTime() - Date.now()) / 86400000) : null;
    const startedAt =
      paidThrough && daysToPaidThrough !== null && daysToPaidThrough >= 1 && daysToPaidThrough <= SEAT_DAYS_PAID
        ? new Date(paidThrough.getTime() - SEAT_DAYS_PAID * 86400000).toISOString()
        : nowIso;
    activeStudents.forEach((s, idx) => {
      seats.push({
        seatNo: idx + 1,
        status: 'active',
        daysTotal: SEAT_DAYS_PAID,
        startedAt,
        studentUid: s.uid,
        studentName: s.name,
        assignedAt: nowIso,
        history: [],
        daysUsedBase: 0,
      });
    });
    for (let i = activeStudents.length + 1; i <= n; i++) {
      seats.push({
        seatNo: i,
        status: 'available',
        daysTotal: SEAT_DAYS_PAID,
        startedAt: null,
        studentUid: '',
        studentName: '',
        assignedAt: null,
        history: [],
        daysUsedBase: 0,
      });
    }
  }

  if (!seats.length) return;
  const batch = adminDb.batch();
  for (const s of seats) {
    batch.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${s.seatNo}`), {
      centreId,
      ...s,
    });
  }
  await batch.commit();
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

/** Where a newly switched-on student goes. A seat already counting with
 *  nobody on it costs nothing to fill, so it wins first (lowest number);
 *  otherwise the banked seat with the most days left (lowest number on a
 *  tie). Null when the pool has nothing to give. */
export async function drawFreeSeatForCentre(
  centreId: string,
  now: Date = new Date()
): Promise<{ id: string; seatNo: number; remaining: number } | null> {
  const snap = await adminDb
    .collection('centreSeats')
    .where('centreId', '==', centreId)
    .get();
  if (snap.empty) return null;
  let emptyRunning: { id: string; seatNo: number; remaining: number } | null = null;
  let bestBanked: { id: string; seatNo: number; remaining: number } | null = null;
  for (const doc of snap.docs) {
    const data = doc.data() as SeatRead;
    const status = data.status;
    if (status !== 'active' && status !== 'available') continue;
    const { remaining } = seatUsage(data, now);
    const seatNo = Number(data.seatNo || 0);
    if (remaining <= 0) continue;
    if (status === 'active' && !data.studentUid) {
      if (!emptyRunning || seatNo < emptyRunning.seatNo) {
        emptyRunning = { id: doc.id, seatNo, remaining };
      }
      continue;
    }
    if (status === 'active') continue; // occupied and running: not free
    if (!bestBanked || remaining > bestBanked.remaining || (remaining === bestBanked.remaining && seatNo < bestBanked.seatNo)) {
      bestBanked = { id: doc.id, seatNo, remaining };
    }
  }
  return emptyRunning || bestBanked;
}

/** A payment tops the pool: locked seats reopen with a fresh 30 days first,
 *  then brand-new seats are added behind them. */
export async function provisionSeats(
  centreId: string,
  count: number
): Promise<{ reopened: number; added: number; total: number }> {
  const n = Math.max(0, Math.floor(Number(count || 0)));
  const seats = await listSeats(centreId);
  if (!n) return { reopened: 0, added: 0, total: seats.length };
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
    });
    reopened += 1;
  }
  let added = 0;
  for (let i = 1; i <= n - reopened; i++) {
    batch.set(adminDb.collection('centreSeats').doc(`${centreId}__seat-${nextNo + i}`), {
      centreId,
      seatNo: nextNo + i,
      status: 'available' as SeatStatus,
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
  return { reopened, added, total: all.length };
}

/** Pool counts for the TOS console and the admin control room header. */
export async function getSeatPool(centreId: string): Promise<{
  total: number;
  active: number;
  available: number;
  locked: number;
  bankedDays: number;
}> {
  const seats = await listSeats(centreId);
  const now = new Date();
  let active = 0;
  let available = 0;
  let locked = 0;
  let bankedDays = 0;
  for (const d of seats) {
    const s = d.data() as SeatRead;
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
  return { total: seats.length, active, available, locked, bankedDays };
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
