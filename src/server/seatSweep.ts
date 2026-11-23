// ============================================================================
// Seat-policy sweep (batch 22): warns facility admins before enforcement.
//
// Runs daily from Netlify's scheduler (seat-policy-sweep) and on demand from
// POST /api/centre/seats/sweep. Three notices:
//  1. A LEAD facility (signed up, never upgraded) gets a one-time notice
//     that its public landing page stays off until it upgrades. Meeting the
//     minimum by paying for seats turns it into a facility and clears the
//     notice, so the page goes live the moment the upgrade lands.
//  2. Seat-day reminders: running paid seats with 7/3/1 days left get a
//     reminder, and a seat that runs out locks (seatDaysSweep).
//  3. A seats-finishing digest for running paid seats with 5 or fewer days
//     left.
//
import { adminDb } from './firebaseAdmin';
import { getPlatformConfig } from './tenantService';
import { listSeats, seatKind, facilityTier, trimPaidSeatsForCap, reconcileFreeSeats, effectiveFreeSeats, seatUsage, migrateToLeadTier } from './seatDays';
import { sendEmail, emailProviderConfigured, OutgoingEmail } from './email';

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
  try { await migrateToLeadTier(); } catch (e) { console.error('[seat-sweep] lead migration failed:', (e as Error).message); }
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
    const status = String((d.data() as any)?.status || 'active');
    // Batch 26: lead-status facilities are swept too (their seats still run).
    return status === 'active' || status === 'lead';
  });

  for (const cDoc of centres) {
    result.checked += 1;
    const centreId = cDoc.id;
    const centre = cDoc.data() as any;
    const centreName = String(centre.name || 'Your facility');
    const bRef = adminDb.collection('centreBilling').doc(centreId);
    const bDoc = await bRef.get();
    const billing = (bDoc.data() || {}) as any;

    // Batch 26: a lead (never upgraded) has no public landing page. One
    // notice email tells it so; upgrading clears the flag and the page
    // goes live with the rest of the upgrade.
    if (facilityTier(billing) === 'lead') {
      if (!billing.leadLandingNotifiedAt) {
        await bRef.set({ leadLandingNotifiedAt: new Date().toISOString() }, { merge: true });
        await adminDb.collection('auditLogs').add({
          actorUid: 'system',
          centreId,
          action: 'LEAD_LANDING_NOTICE',
          after: { tier: 'lead' },
          at: new Date().toISOString(),
        });
        const recipients = await centreRecipients(centreId, centre.ownerEmail);
        if (recipients.length) {
          const delivered = await sendToAll(recipients, {
            subject: `${centreName}: upgrade to unlock your facility page`,
            html: `<p>Your Tutorial OS facility page (the public landing page with your facility's own web address) goes live as soon as you upgrade.</p><p>You can start upgrading by recording a payment for at least <b>${minimum}</b> seats, and choosing your plan in the facility app. Everything else keeps working: students, tutors and admins stay signed in as usual.</p>`,
            text: `Your Tutorial OS facility page (the public landing page with your facility's own web address) goes live as soon as you upgrade.\n\nYou can start upgrading by recording a payment for at least ${minimum} seats, and choosing your plan in the facility app. Everything else keeps working: students, tutors and admins stay signed in as usual.`,
          });
          console.log('[seat-sweep] lead landing notice', centreId, JSON.stringify({ delivered }));
        }
        result.warned += 1;
      }
    } else if (billing.leadLandingNotifiedAt || billing.landingGraceUntil || billing.landingLockedNotifiedAt) {
      await bRef.set({ leadLandingNotifiedAt: null, landingGraceUntil: null, landingLockedNotifiedAt: null }, { merge: true });
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
    const digestRecipients = finishing.length ? await centreRecipients(centreId, centre.ownerEmail) : [];
    if (finishing.length && digestRecipients.length) {
      const lines = finishing.map((f) => `Seat ${f.seatNo} (${f.student}): ${f.days} day${f.days === 1 ? '' : 's'} left`);
      const delivered = await sendToAll(digestRecipients, {
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
