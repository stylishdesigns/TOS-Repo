// ============================================================================
// Automated staff pay reminders (Nov 21).
//
// Mirrors the fee-reminder sweep: when a staff member's next pay date
// arrives or passes without a recorded payment, the facility reminds them
// automatically, once a day, until the owner records the payment. Three
// channels, each deduplicated per day in the server-only `reminderSends`
// collection:
//   - a facility-voiced message in the personal chat with the staff member
//   - a device push (queued in `pushQueue`; the push sender drains it)
//   - an email to the staff member's address
// The reminder stops on its own: recording the payment moves the next pay
// date forward, so nobody still "due" remains.
// ============================================================================
import { adminDb, adminRtdb } from './firebaseAdmin';
import { sendEmail } from './email';
import { computeNextPayDate, payDueStatus, overdueDays } from '../lib/staffPay';

/** Today in Lagos (UTC+1 all year, no daylight saving). */
const lagosISO = (): string => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

export interface StaffPayReminderRunResult {
  centresChecked: number;
  centresRan: number;
  staffChecked: number;
  reminded: number;
  chatted: number;
  pushed: number;
  emailed: number;
  reasons: string[];
}

/** One send marker per facility, staff member, day and channel. */
async function markOnce(key: string): Promise<boolean> {
  const ref = adminDb.collection('reminderSends').doc(key);
  const snap = await ref.get();
  if (snap.exists) return false;
  await ref.set({ createdAt: Date.now() });
  return true;
}

/** Find (or open) the personal chat between the facility owner and a staff member. */
async function ensurePersonalChat(centreId: string, ownerUid: string, staffUid: string): Promise<string> {
  const pair = [ownerUid, staffUid].sort();
  const chatId = `dm-${pair[0]}__${pair[1]}`;
  const ref = adminDb.collection('chatGroups').doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = new Date().toISOString();
    await ref.set({
      kind: 'personal',
      centreId,
      crossCentre: false,
      members: pair,
      memberCentres: { [ownerUid]: centreId, [staffUid]: centreId },
      access: { mode: 'none' },
      createdBy: ownerUid,
      createdByRole: 'centre_admin',
      createdAt: now,
      updatedAt: now,
      active: true,
    });
  } else {
    const v = snap.data() as Record<string, any>;
    const members: string[] = Array.isArray(v.members) ? v.members.map(String) : [];
    if (!members.includes(staffUid) || !members.includes(ownerUid)) {
      await ref.set(
        { members: pair, memberCentres: { ...(v.memberCentres || {}), [ownerUid]: centreId, [staffUid]: centreId } },
        { merge: true },
      );
    }
  }
  return chatId;
}

/** Post one facility-voiced message into that chat, mirroring writeMessage. */
async function postChatMessage(chatId: string, ownerUid: string, facilityName: string, text: string): Promise<void> {
  const msgRef = adminRtdb.ref(`chat/groups/${chatId}/messages`).push();
  await msgRef.set({
    uid: ownerUid,
    username: facilityName || 'Facility',
    role: 'centre_admin',
    text,
    photoUrl: null,
    at: Date.now(),
    removed: null,
  });
  await adminRtdb.ref(`chat/groups/${chatId}/meta`).transaction((m: any) => ({
    ...(m || {}),
    msgCount: (Number(m?.msgCount) || 0) + 1,
  }));
}

function messageFor(centreName: string, staffName: string, dueText: string, daysLate: number): string {
  const facility = centreName || 'the facility';
  if (daysLate > 0) {
    return `Hello ${staffName}, this is a reminder from ${facility}. Your pay for this period was due on ${dueText}, ${daysLate} day${daysLate === 1 ? '' : 's'} ago. We are settling it as soon as possible; you can follow the record on your Staff Pay page. Thank you.`;
  }
  return `Hello ${staffName}, this is a reminder from ${facility}. Your pay for this period is due today, ${dueText}. You can follow the record on your Staff Pay page. Thank you.`;
}

function emailFor(centreName: string, staffName: string, text: string) {
  const facility = centreName || 'your facility';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pay reminder from ${facility}</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F172A;"><div style="max-width:560px;margin:0 auto;padding:24px 16px;"><div style="background:#0F172A;border-radius:16px 16px 0 0;padding:20px 24px;"><span style="font-size:18px;font-weight:bold;color:#FFFFFF;">${facility}</span><span style="float:right;font-size:11px;letter-spacing:2px;color:#94A3B8;">PAY REMINDER</span></div><div style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:28px 24px;"><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi ${staffName},</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${text}</p><p style="margin:0 0 22px;text-align:center;"><a href="https://tutorialos.com/app" style="display:inline-block;background:#0F172A;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:12px;">Open the app</a></p></div><p style="margin:14px 4px 0;font-size:11px;color:#94A3B8;">You are receiving this email because you are a staff member at ${facility}.</p></div></body></html>`;
  return { html, text };
}

/** Sweep one facility: remind every staff member whose pay is due or overdue. */
async function sweepCentre(centreId: string, out: StaffPayReminderRunResult): Promise<void> {
  const centreSnap = await adminDb.collection('centres').doc(centreId).get();
  const centre = (centreSnap.data() || {}) as Record<string, any>;
  const centreName = String(centre.name || centre.centreName || 'your facility');
  const ownerUid = String(centre.ownerUid || '');
  out.centresRan += 1;

  const today = lagosISO();
  const [tutorSnap, adminSnap] = await Promise.all([
    adminDb.collection('tutors').where('centreId', '==', centreId).get(),
    adminDb.collection('admins').where('centreId', '==', centreId).get(),
  ]);
  const staffDocs = [...tutorSnap.docs, ...adminSnap.docs];
  out.staffChecked += staffDocs.length;

  for (const doc of staffDocs) {
    const s = doc.data() as Record<string, any>;
    const payFrequency = String(s.payFrequency || '');
    if (!['daily', 'weekly', 'monthly'].includes(payFrequency)) continue;
    const nextPay = computeNextPayDate(payFrequency as any, s.payDay, s.lastPaidAt);
    if (!nextPay) continue;
    const status = payDueStatus(nextPay);
    if (status !== 'due' && status !== 'overdue') continue;
    out.reminded += 1;

    const staffUid = String(s.uid || doc.id);
    const staffName = String(s.name || 'there').split(' ')[0] || 'there';
    const daysLate = status === 'overdue' ? overdueDays(nextPay) : 0;
    const dueText = new Date(`${nextPay}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const text = messageFor(centreName, staffName, dueText, daysLate);

    // Chat: a facility-voiced message in the personal chat with the staff member.
    if (ownerUid && ownerUid !== staffUid) {
      const key = `${centreId}__staff-${doc.id}__${today}__chat`;
      if (await markOnce(key)) {
        try {
          const chatId = await ensurePersonalChat(centreId, ownerUid, staffUid);
          await postChatMessage(chatId, ownerUid, centreName, text);
          out.chatted += 1;
        } catch (e: any) {
          out.reasons.push(`chat message to ${staffName} failed: ${e?.message || 'unknown reason'}`);
        }
      }
    }

    // Device push: the push sender drains the queue every 10 minutes.
    const pKey = `${centreId}__staff-${doc.id}__${today}__push`;
    if (await markOnce(pKey)) {
      await adminDb.collection('pushQueue').doc(`spay-${pKey}`).set({
        kind: 'staff_pay_reminder',
        uid: staffUid,
        centreId,
        pushTitle: `${centreName}: pay reminder`,
        pushBody: text,
        sendAt: Date.now(),
        sent: false,
        attempts: 0,
      });
      out.pushed += 1;
    }

    // Email to the staff member's address.
    const eKey = `${centreId}__staff-${doc.id}__${today}__email`;
    if (await markOnce(eKey)) {
      const email = String(s.email || '').trim();
      if (email && /.+@.+\..+/.test(email)) {
        const built = emailFor(centreName, staffName, text);
        const sent = await sendEmail({
          to: email,
          subject: `Pay reminder from ${centreName}`,
          html: built.html,
          text: built.text,
        });
        if (sent.delivered) out.emailed += 1;
        else out.reasons.push(`email to ${staffName} failed: ${sent.error || 'no email provider is configured yet'}`);
      }
    }
  }
}

/** Run the sweep for one facility (the run-now button) or every facility (the daily schedule). */
export async function runStaffPayReminderSweep(opts: { centreId?: string } = {}): Promise<StaffPayReminderRunResult> {
  const out: StaffPayReminderRunResult = {
    centresChecked: 0,
    centresRan: 0,
    staffChecked: 0,
    reminded: 0,
    chatted: 0,
    pushed: 0,
    emailed: 0,
    reasons: [],
  };
  try {
    if (opts.centreId) {
      out.centresChecked = 1;
      await sweepCentre(opts.centreId, out);
      return out;
    }
    const snap = await adminDb.collection('centres').get();
    out.centresChecked = snap.size;
    for (const doc of snap.docs) {
      try {
        await sweepCentre(doc.id, out);
      } catch (e: any) {
        out.reasons.push(`facility ${doc.id} sweep failed: ${e?.message || 'unknown reason'}`);
      }
    }
  } catch (e: any) {
    out.reasons.push(`sweep failed: ${e?.message || 'unknown reason'}`);
  }
  return out;
}
