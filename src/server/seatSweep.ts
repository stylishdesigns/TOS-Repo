// ============================================================================
// Seat-policy sweep (batch 22): warns facility admins before enforcement.
//
// Runs daily from Netlify's scheduler (seat-policy-sweep) and on demand from
// POST /api/centre/seats/sweep. Three notices:
//  1. A facility that is not on trial and holds fewer paid seats than the
//     platform minimum gets a 7-day warning, and its landing-page grace
//     window starts the day this email lands.
//  2. When that grace ends with the minimum still unmet, the facility's
//     public landing page pauses (centre-by-slug enforces it) and the
//     facility gets one notice that it happened. Portals keep working.
//  3. Running paid seats with 5 or fewer days left get one "seats finishing"
//     digest email, marked on the seat so the same seat never warns twice.
// Meeting the minimum again clears the grace window and the page returns.
// ============================================================================
import { adminDb } from './firebaseAdmin';
import { getPlatformConfig } from './tenantService';
import { listSeats, seatKind, isOnTrial, countPaidSeatsForCentre, seatUsage } from './seatDays';
import { sendEmail, emailProviderConfigured, OutgoingEmail } from './email';

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SeatSweepResult {
  checked: number;
  warned: number;
  lockedNotices: number;
  cleared: number;
  expiryDigests: number;
  emailsSkipped: boolean;
}

/** The people to warn for one facility: every active owner or admin, plus
 *  the facility's owner email. */
async function centreRecipients(centreId: string, ownerEmail?: string): Promise<string[]> {
  const set = new Set<string>();
  if (ownerEmail && EMAIL_RE.test(String(ownerEmail))) set.add(String(ownerEmail).toLowerCase());
  const memSnap = await adminDb.collection('memberships').where('centreId', '==', centreId).limit(200).get();
  const uids: string[] = [];
  memSnap.docs.forEach((d) => {
    const m = d.data() as any;
    if (['owner', 'admin'].includes(String(m.role || '')) && String(m.status || 'active') === 'active' && m.uid) {
      uids.push(String(m.uid));
    }
  });
  for (const uid of uids) {
    try {
      const uDoc = await adminDb.collection('users').doc(uid).get();
      const email = String((uDoc.data() as any)?.email || '').toLowerCase();
      if (email && EMAIL_RE.test(email)) set.add(email);
    } catch { /* skip this one */ }
  }
  return [...set];
}

async function sendToAll(recipients: string[], mail: Omit<OutgoingEmail, 'to'>): Promise<number> {
  let delivered = 0;
  for (const to of recipients) {
    try {
      const r = await sendEmail({ ...mail, to });
      if (r.delivered) delivered += 1;
    } catch { /* keep going */ }
  }
  return delivered;
}

export async function runSeatPolicySweep(opts: { centreId?: string } = {}): Promise<SeatSweepResult> {
  const result: SeatSweepResult = {
    checked: 0,
    warned: 0,
    lockedNotices: 0,
    cleared: 0,
    expiryDigests: 0,
    emailsSkipped: !emailProviderConfigured(),
  };
  const config = await getPlatformConfig();
  const minimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
  const centresSnap = await adminDb.collection('centres').limit(500).get();
  const centres = centresSnap.docs.filter((d) => {
    if (opts.centreId && d.id !== opts.centreId) return false;
    return String((d.data() as any)?.status || 'active') === 'active';
  });

  for (const cDoc of centres) {
    result.checked += 1;
    const centreId = cDoc.id;
    const centre = cDoc.data() as any;
    const centreName = String(centre.name || 'Your facility');
    const bRef = adminDb.collection('centreBilling').doc(centreId);
    const bDoc = await bRef.get();
    const billing = (bDoc.data() || {}) as any;

    // Trial facilities have nothing to warn about yet.
    if (isOnTrial(billing)) continue;

    const paidHeld = await countPaidSeatsForCentre(centreId);
    const recipients = await centreRecipients(centreId, centre.ownerEmail);

    if (paidHeld < minimum) {
      const graceUntil = billing.landingGraceUntil ? new Date(billing.landingGraceUntil).getTime() : 0;
      if (!graceUntil) {
        const until = new Date(Date.now() + 7 * DAY_MS).toISOString();
        await bRef.set({ landingGraceUntil: until, landingLockedNotifiedAt: null }, { merge: true });
        await adminDb.collection('auditLogs').add({
          actorUid: 'system',
          centreId,
          action: 'LANDING_GATE_WARNED',
          after: { paidHeld, minimum, landingGraceUntil: until },
          at: new Date().toISOString(),
        });
        if (recipients.length) {
          const delivered = await sendToAll(recipients, {
            subject: `${centreName}: your facility page pauses in 7 days`,
            html: `<p>Your facility currently holds <b>${paidHeld}</b> paid seat${paidHeld === 1 ? '' : 's'}. Tutorial OS facilities keep their public landing page only while they hold at least <b>${minimum}</b> paid seats.</p><p>Unless you record a payment for at least ${minimum} seats by <b>${new Date(until).toDateString()}</b>, your facility's landing page link will pause. Everything else keeps working: students, tutors and admins stay signed in as usual.</p><p>To keep the page live, record a payment for your seats in the facility app, or let your Tutorial OS contact know.</p>`,
            text: `Your facility currently holds ${paidHeld} paid seat(s). Tutorial OS facilities keep their public landing page only while they hold at least ${minimum} paid seats.\n\nUnless you record a payment for at least ${minimum} seats by ${new Date(until).toDateString()}, your facility's landing page link will pause. Everything else keeps working: students, tutors and admins stay signed in as usual.\n\nTo keep the page live, record a payment for your seats in the facility app, or let your Tutorial OS contact know.`,
          });
          console.log('[seat-sweep] landing warning', centreId, JSON.stringify({ delivered }));
        }
        result.warned += 1;
      } else if (graceUntil <= Date.now() && !billing.landingLockedNotifiedAt) {
        await bRef.set({ landingLockedNotifiedAt: new Date().toISOString() }, { merge: true });
        await adminDb.collection('auditLogs').add({
          actorUid: 'system',
          centreId,
          action: 'LANDING_GATE_LOCKED',
          after: { paidHeld, minimum },
          at: new Date().toISOString(),
        });
        if (recipients.length) {
          const delivered = await sendToAll(recipients, {
            subject: `${centreName}: your facility page is now paused`,
            html: `<p>Your facility's public landing page is now paused because it holds <b>${paidHeld}</b> paid seat${paidHeld === 1 ? '' : 's'}, below the platform minimum of <b>${minimum}</b>.</p><p>Everything else keeps working: students, tutors and admins stay signed in as usual. The page returns as soon as a payment brings you to at least ${minimum} seats.</p>`,
            text: `Your facility's public landing page is now paused because it holds ${paidHeld} paid seat(s), below the platform minimum of ${minimum}.\n\nEverything else keeps working: students, tutors and admins stay signed in as usual. The page returns as soon as a payment brings you to at least ${minimum} seats.`,
          });
          console.log('[seat-sweep] locked notice', centreId, JSON.stringify({ delivered }));
        }
        result.lockedNotices += 1;
      }
    } else if (billing.landingGraceUntil || billing.landingLockedNotifiedAt) {
      await bRef.set({ landingGraceUntil: null, landingLockedNotifiedAt: null }, { merge: true });
      result.cleared += 1;
    }

    // Seats-finishing digest: running paid seats with 5 or fewer days left.
    const seats = await listSeats(centreId);
    const now = new Date();
    const finishing: { seatNo: number; student: string; days: number }[] = [];
    const batch = adminDb.batch();
    let marked = 0;
    for (const d of seats) {
      const s = d.data() as any;
      if (seatKind(s) !== 'paid' || s.status !== 'active') continue;
      const { remaining } = seatUsage(s, now);
      if (remaining > 5 || remaining <= 0 || s.expiryNoticeSentAt) continue;
      finishing.push({ seatNo: Number(s.seatNo || 0), student: String(s.studentName || 'a student'), days: remaining });
      batch.update(d.ref, { expiryNoticeSentAt: now.toISOString() });
      marked += 1;
    }
    if (marked) await batch.commit();
    if (finishing.length && recipients.length) {
      const lines = finishing.map((f) => `Seat ${f.seatNo} (${f.student}): ${f.days} day${f.days === 1 ? '' : 's'} left`);
      const delivered = await sendToAll(recipients, {
        subject: `${centreName}: ${finishing.length} seat${finishing.length === 1 ? '' : 's'} finish this week`,
        html: `<p>${finishing.length} seat${finishing.length === 1 ? '' : 's'} at ${centreName} finish within the next 5 days:</p><p>${lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br/>')}</p><p>When a seat finishes it locks and the student on it loses access until a payment reopens the pool. Record a payment in the facility app, or let your Tutorial OS contact know.</p>`,
        text: `${finishing.length} seat(s) at ${centreName} finish within the next 5 days:\n\n${lines.join('\n')}\n\nWhen a seat finishes it locks and the student on it loses access until a payment reopens the pool. Record a payment in the facility app, or let your Tutorial OS contact know.`,
      });
      console.log('[seat-sweep] expiry digest', centreId, JSON.stringify({ delivered }));
      result.expiryDigests += 1;
    }
  }

  return result;
}
