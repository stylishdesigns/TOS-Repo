// ============================================================================
// Automated payment reminders (Nov 20).
//
// The facility sets when reminders go out (days before the payment due date,
// optionally every Monday) and which channels to use (email, device push,
// in-chat message). A daily sweep then does the sending, so the admin never
// has to remind anyone by hand.
//
//   1. For each facility whose settings are enabled, read its active students
//      and their confirmed payment windows.
//   2. A student with an outstanding balance is reminded when the next
//      payment due date falls within the chosen window (overdue included),
//      and additionally every Monday when that toggle is on.
//   3. Each channel sends once per due date (or once per Monday), tracked in
//      the server-only `reminderSends` collection so re-runs never resend.
//
// The email uses the facility's registered ZeptoMail template (see
// fee-reminder-email-template.html) and falls back to the built-in copy
// until the template key is saved in Netlify's environment variables.
// The push rides the same queue and sender as planner reminders
// (pushQueue + runPushSweep). The in-chat message is posted into the
// personal chat between the facility's owner account and the student,
// voiced as the facility itself.
// ============================================================================
import { adminDb, adminRtdb } from './firebaseAdmin';
import { sendEmail } from './email';
import { nextPaymentDue, todayISO } from '../lib/paymentDates';
import {
  FeeReminderSettings,
  normalizeFeeReminderSettings,
  renderChatTemplate,
} from '../lib/feeReminders';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today in Lagos (UTC+1 all year, no daylight saving). */
const lagosISO = (): string => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

export interface FeeReminderRunResult {
  centresChecked: number;
  centresRan: number;
  studentsChecked: number;
  reminded: number;
  emailed: number;
  pushed: number;
  chatted: number;
  reasons: string[];
}

const money = (n: number): string => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** ZeptoMail merge values + fallback copy for one student's reminder. */
function emailFor(centreName: string, studentName: string, balance: string, due: string) {
  const facility = centreName || 'your facility';
  const dueText = due || 'as soon as possible';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment reminder from ${facility}</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F172A;"><div style="max-width:560px;margin:0 auto;padding:24px 16px;"><div style="background:#0F172A;border-radius:16px 16px 0 0;padding:20px 24px;"><span style="font-size:18px;font-weight:bold;color:#FFFFFF;">${facility}</span><span style="float:right;font-size:11px;letter-spacing:2px;color:#94A3B8;">PAYMENT REMINDER</span></div><div style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:28px 24px;"><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi ${studentName},</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">This is a friendly reminder from <strong>${facility}</strong> about your fees. Your record shows an outstanding balance, and your next payment is due on <strong>${dueText}</strong>.</p><div style="border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin:0 0 18px;"><p style="margin:0 0 10px;font-size:14px;"><strong>Outstanding balance:</strong> ${balance}</p><p style="margin:0;font-size:14px;"><strong>Next payment due:</strong> ${dueText}</p></div><p style="margin:0 0 14px;font-size:15px;line-height:1.6;">You can settle your balance by bank transfer or in cash at the centre. When you pay, submit it in the app so the centre can confirm it and update your record.</p><p style="margin:0 0 22px;text-align:center;"><a href="https://tutorialos.com/app" style="display:inline-block;background:#0F172A;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:12px;">Open the app</a></p><p style="margin:0 0 4px;font-size:13px;color:#475569;">If you have already paid, please disregard this reminder or reach out to us at the centre.</p></div><p style="margin:14px 4px 0;font-size:11px;color:#94A3B8;">You are receiving this email because you are enrolled at ${facility}.</p></div></body></html>`;
  const text = `Hi ${studentName}, this is a friendly reminder from ${facility}. Your outstanding balance is ${balance}, and your next payment is due ${dueText}. You can settle by bank transfer or in cash at the centre. When you pay, submit it in the app so the centre can confirm it. If you have already paid, please disregard this reminder.`;
  return {
    html,
    text,
    mergeFields: {
      facility_name: facility,
      student_name: studentName,
      outstanding_balance: balance,
      next_payment_due: dueText,
      app_url: 'https://tutorialos.com/app',
    },
  };
}

/** Find (or open) the personal chat between the facility owner and the student. */
async function ensurePersonalChat(centreId: string, adminUid: string, studentUid: string): Promise<string> {
  const pair = [adminUid, studentUid].sort();
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
      memberCentres: { [adminUid]: centreId, [studentUid]: centreId },
      access: { mode: 'none' },
      createdBy: adminUid,
      createdByRole: 'centre_admin',
      createdAt: now,
      updatedAt: now,
      active: true,
    });
  } else {
    const v = snap.data() as Record<string, any>;
    const members: string[] = Array.isArray(v.members) ? v.members.map(String) : [];
    if (!members.includes(studentUid) || !members.includes(adminUid)) {
      await ref.set(
        { members: pair, memberCentres: { ...(v.memberCentres || {}), [adminUid]: centreId, [studentUid]: centreId } },
        { merge: true },
      );
    }
  }
  return chatId;
}

/** Post one facility-voiced message into that chat, mirroring writeMessage. */
async function postChatMessage(chatId: string, adminUid: string, facilityName: string, text: string): Promise<void> {
  const msgRef = adminRtdb.ref(`chat/groups/${chatId}/messages`).push();
  await msgRef.set({
    uid: adminUid,
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

/** One send marker per centre, student, trigger and channel. */
async function markOnce(key: string): Promise<boolean> {
  const ref = adminDb.collection('reminderSends').doc(key);
  const snap = await ref.get();
  if (snap.exists) return false;
  await ref.set({ createdAt: Date.now() });
  return true;
}

/** Sweep one facility. Returns how many students were reminded and by which channels. */
async function sweepCentre(centreId: string, out: FeeReminderRunResult): Promise<void> {
  const [centreSnap, settingsSnap] = await Promise.all([
    adminDb.collection('centres').doc(centreId).get(),
    adminDb.collection('centreSettings').doc(`${centreId}__global`).get(),
  ]);
  const centre = (centreSnap.data() || {}) as Record<string, any>;
  const centreName = String(centre.name || centre.centreName || 'your facility');
  const ownerUid = String(centre.ownerUid || '');
  const settings: FeeReminderSettings = normalizeFeeReminderSettings(
    (settingsSnap.data() as Record<string, any> | undefined)?.paymentReminders,
  );
  if (!settings.enabled) return;
  out.centresRan += 1;

  const today = lagosISO();
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  const cutoffMs = Date.parse(`${today}T12:00:00Z`) + settings.daysBefore * DAY_MS;

  // One payments read per facility, grouped in memory: the student's next
  // payment due is the latest confirmed window's expiry date.
  const paySnap = await adminDb.collection('payments').where('centreId', '==', centreId).get();
  const byStudent = new Map<string, any[]>();
  paySnap.forEach((d) => {
    const v = d.data() as Record<string, any>;
    const sid = String(v.studentId || '');
    if (!sid) return;
    const list = byStudent.get(sid) || [];
    list.push(v);
    byStudent.set(sid, list);
  });

  const stuSnap = await adminDb.collection('students').where('centreId', '==', centreId).get();
  out.studentsChecked += stuSnap.size;

  for (const stu of stuSnap.docs) {
    const s = stu.data() as Record<string, any>;
    const outstanding = Number(s.outstandingBalance || 0);
    const studentUid = String(s.uid || '');
    if (outstanding <= 0 || !studentUid) continue;
    const studentName = String(s.name || 'there');
    const balance = money(outstanding);

    // An access-disabled student is not being chased for fees.
    try {
      const mem = await adminDb.collection('memberships').doc(`${studentUid}__${centreId}`).get();
      if (mem.exists && String((mem.data() as any)?.status || '') !== 'active') continue;
    } catch { /* a missing membership row reads as active */ }

    const history = byStudent.get(stu.id) || [];
    const due = nextPaymentDue(history);
    const dueWithinWindow = !!due && Date.parse(`${due}T12:00:00Z`) <= cutoffMs;
    if (!dueWithinWindow && !(settings.weeklyMonday && isMonday)) continue;
    out.reminded += 1;

    const dueText = due
      ? new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'as soon as possible';
    const trigger = due ? `due-${due}` : `mon-${today}`;

    if (settings.channels.email) {
      const key = `${centreId}__${studentUid}__${trigger}__email`;
      if (await markOnce(key)) {
        const email = String(s.email || '').trim();
        if (email && /.+@.+\..+/.test(email)) {
          const built = emailFor(centreName, studentName, balance, dueText);
          const sent = await sendEmail({
            to: email,
            subject: `Payment reminder from ${centreName}`,
            html: built.html,
            text: built.text,
            mergeFields: built.mergeFields,
            templateKey: (process.env.ZEPTOMAIL_FEE_REMINDER_TEMPLATE_KEY || '').trim(),
          });
          if (sent.delivered) out.emailed += 1;
          else out.reasons.push(`email to ${studentName} failed: ${sent.error || 'no email provider is configured yet'}`);
        } else {
          out.reasons.push(`${studentName} has no email address on file, so no email reminder`);
        }
      }
    }

    if (settings.channels.push) {
      const key = `${centreId}__${studentUid}__${trigger}__push`;
      if (await markOnce(key)) {
        await adminDb.collection('pushQueue').doc(`fee-${key}`).set({
          kind: 'fee_reminder',
          uid: studentUid,
          centreId,
          pushTitle: `${centreName}: payment reminder`,
          pushBody: `Your tuition balance of ${balance} is due ${due ? `by ${dueText}` : 'as soon as possible'}. Kindly complete your payment.`,
          sendAt: Date.now(),
          sent: false,
          attempts: 0,
        });
        out.pushed += 1;
      }
    }

    if (settings.channels.chat && ownerUid && ownerUid !== studentUid) {
      const key = `${centreId}__${studentUid}__${trigger}__chat`;
      if (await markOnce(key)) {
        try {
          const chatId = await ensurePersonalChat(centreId, ownerUid, studentUid);
          const text = renderChatTemplate(settings.chatTemplate, {
            student_name: studentName.split(' ')[0] || studentName,
            facility_name: centreName,
            outstanding_balance: balance,
            next_payment_due: dueText,
          });
          if (text) {
            await postChatMessage(chatId, ownerUid, centreName, text);
            out.chatted += 1;
          }
        } catch (e: any) {
          out.reasons.push(`chat message to ${studentName} failed: ${e?.message || 'unknown reason'}`);
        }
      }
    }
  }
}

/** Run the sweep for one facility (the run-now button) or every facility (the daily schedule). */
export async function runFeeReminderSweep(opts: { centreId?: string } = {}): Promise<FeeReminderRunResult> {
  const out: FeeReminderRunResult = {
    centresChecked: 0,
    centresRan: 0,
    studentsChecked: 0,
    reminded: 0,
    emailed: 0,
    pushed: 0,
    chatted: 0,
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
