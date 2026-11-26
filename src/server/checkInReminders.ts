// ============================================================================
// Check-in reminder sweep (Nov 23): on the days a facility is open, once its
// check-in (resumption) time passes, every student of that facility who has
// not checked in yet gets ONE in-app notification and ONE web push asking
// them to check in. The push rides the shared pushQueue + runPushSweep; the
// in-app note lands in the `notifications` collection the student bell reads.
//
// Fired from the same 10-minute Netlify scheduler as the push sweep and from
// POST /api/push/send-due (staff run-now). Once-per-day per student: the
// reminderSends doc is the guard, so re-runs never double-send.
// ============================================================================
import { adminDb } from './firebaseAdmin';

export interface CheckInReminderRunResult {
  centres: number;
  reminded: number;
  pushed: number;
  reasons: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "08:00 AM" -> minutes past midnight; 0 when absent or malformed. */
function parseTimeToMinutes(time12h: string): number {
  const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(time12h || '').trim());
  if (!t) return 0;
  let h = Number(t[1]);
  const mm = Number(t[2]);
  const ap = (t[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + mm;
}

export async function runCheckInReminderSweep(opts: { limit?: number } = {}): Promise<CheckInReminderRunResult> {
  const out: CheckInReminderRunResult = { centres: 0, reminded: 0, pushed: 0, reasons: [] };
  const limit = Math.max(1, Math.min(opts.limit || 300, 500));
  // Lagos wall clock (UTC+1 all year) decides which day it is and whether the
  // check-in time has passed; the date key matches what check-in logs write
  // (the UTC date), so already-checked-in students are found reliably.
  const lagos = new Date(Date.now() + 60 * 60 * 1000);
  const today = DAY_NAMES[lagos.getUTCDay()];
  const dateKey = new Date().toISOString().slice(0, 10);
  const nowMinutes = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();

  let centresSnap;
  try {
    centresSnap = await adminDb.collection('centres').limit(100).get();
  } catch (e) {
    out.reasons.push(`could not list centres: ${(e as Error).message}`);
    return out;
  }

  for (const c of centresSnap.docs) {
    const centreId = c.id;
    out.centres += 1;
    try {
      const setSnap = await adminDb.collection('centreSettings').doc(`${centreId}__attendance`).get();
      const s = (setSnap.data() || {}) as any;
      const openDays: string[] = Array.isArray(s.operatingDays) && s.operatingDays.length
        ? s.operatingDays.map(String)
        : [...DAY_NAMES];
      if (!openDays.includes(today)) continue; // facility does not open today

      const resumption = parseTimeToMinutes(String(s.resumptionTime || '08:00 AM'));
      if (resumption <= 0 || nowMinutes < resumption) continue; // not check-in time yet

      const centreName = String((c.data() as any)?.name || 'Your facility');

      const [stuSnap, logSnap] = await Promise.all([
        adminDb.collection('students').where('centreId', '==', centreId).limit(400).get(),
        adminDb.collection('attendance_logs').where('centreId', '==', centreId).where('date', '==', dateKey).get(),
      ]);
      const checkedIn = new Set<string>();
      for (const l of logSnap.docs) {
        const v = l.data() as any;
        if (v.clockInAt) checkedIn.add(String(v.studentId || ''));
      }

      for (const stu of stuSnap.docs) {
        if (out.reminded >= limit) return out;
        const v = stu.data() as any;
        const uid = String(v.uid || stu.id);
        if (!uid || checkedIn.has(String(stu.id)) || checkedIn.has(uid)) continue;
        const key = `checkin-${centreId}-${dateKey}-${uid}`;
        const markRef = adminDb.collection('reminderSends').doc(key);
        const markSnap = await markRef.get();
        if (markSnap.exists) continue;
        await markRef.set({ createdAt: Date.now() });
        out.reminded += 1;

        // In-app notification (server-only write; the student bell reads this).
        try {
          await adminDb.collection('notifications').doc(`not-chk-${key}`).set({
            centreId,
            type: 'attendance',
            title: 'Time to check in',
            body: `${centreName} is open for today. Please check in now.`,
            audienceUid: uid,
            createdAt: Date.now(),
            subjects: [],
            programmes: [],
          });
        } catch (e) {
          out.reasons.push(`in-app for ${uid}: ${(e as Error).message}`);
        }

        // Web push through the shared queue (the sweep sends due jobs).
        try {
          await adminDb.collection('pushQueue').doc(`chk-${key}`).set({
            kind: 'checkin_reminder',
            uid,
            centreId,
            pushTitle: `${centreName}: check in`,
            pushBody: `${centreName} is open for today. Please check in now.`,
            sendAt: Date.now(),
            sent: false,
            attempts: 0,
          });
          out.pushed += 1;
        } catch (e) {
          out.reasons.push(`push for ${uid}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      out.reasons.push(`${centreId}: ${(e as Error).message}`);
    }
  }
  return out;
}
