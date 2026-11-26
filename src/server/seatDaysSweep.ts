// ============================================================================
// Seat-days sweep (batch 19): rides the same 10-minute scheduler as the push
// sender. Locks every seat whose 30 (or trial 14) days ran out, and reminds
// facility admins when a switched-on seat is 7, 3 or 1 days from completing
// its cycle, so a payment can land before it locks. Every pass is safe to
// re-run: notifications are guarded by a reminderSends doc per seat per cycle.
// ============================================================================
import { adminDb } from './firebaseAdmin';
import { seatUsage, lockExpiredSeatsForCentre, notifySeat } from './seatDays';

const REMIND_AT = [7, 3, 1];

export interface SeatDaysRunResult {
  seats: number;
  locked: number;
  reminded: number;
  reasons: string[];
}

export async function runSeatDaysSweep(opts: { limit?: number } = {}): Promise<SeatDaysRunResult> {
  const out: SeatDaysRunResult = { seats: 0, locked: 0, reminded: 0, reasons: [] };
  const limit = Math.max(1, Math.min(opts.limit || 400, 600));
  let snap;
  try {
    snap = await adminDb.collection('centreSeats').where('status', '==', 'active').limit(limit).get();
  } catch (e) {
    out.reasons.push(`could not read seats: ${(e as Error).message}`);
    return out;
  }
  const now = new Date();
  const lockedCentres = new Set<string>();
  for (const doc of snap.docs) {
    if (out.seats >= limit) break;
    out.seats += 1;
    const seat = doc.data() as any;
    const centreId = String(seat.centreId || '');
    if (!centreId) continue;
    try {
      const { remaining } = seatUsage(seat, now);
      if (remaining <= 0) {
        if (lockedCentres.has(centreId)) continue; // already locked with its whole pool
        lockedCentres.add(centreId);
        const outcomes = await lockExpiredSeatsForCentre(centreId, {});
        out.locked += outcomes.length;
        continue;
      }
      if (REMIND_AT.includes(remaining)) {
        const centreDoc = await adminDb.collection('centres').doc(centreId).get();
        const centreName = String((centreDoc.data() as any)?.name || 'Your facility');
        const sent = await notifySeat(centreId, centreName, {
          seatNo: Number(seat.seatNo || 0),
          studentName: String(seat.studentName || ''),
          kind: 'remind',
          remaining,
          daysTotal: Number(seat.daysTotal || 30),
          startedAt: seat.startedAt || null,
        });
        if (sent) out.reminded += 1;
      }
    } catch (e) {
      out.reasons.push(`${centreId}/seat${seat.seatNo}: ${(e as Error).message}`);
    }
  }
  return out;
}
