import express from 'express';
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { Caller, httpError, requireMembership } from './tenantService';
import { pushNotification } from './notificationRoutes';
import { emailProviderConfigured, sendEmail } from './email';

// ============================================================================
// Broadcast announcements (Nov 20).
//
// The Announcements page used to fake its delivery: only the "Student Group"
// channel actually posted into a chat group, while In-App and Email were
// recorded in page memory and never reached anyone. This module is the real
// fan-out behind the compose form:
//
//   POST /api/centre/announcements/broadcast  staff only. Saves the broadcast
//       to the `announcements` collection (so history survives a refresh),
//       then either delivers it now or stores it as Scheduled.
//   GET  /api/centre/announcements            staff only. Broadcast history.
//   POST /api/centre/announcements/send-due   staff only. Delivers every
//       scheduled broadcast whose time has arrived (the scheduled sender and
//       the push sweep trigger the same work).
//
// Delivery per attached channel:
//   In-App  one `notifications` document (type 'announcement') every student
//           sees in their bell, plus one `pushQueue` job per student who has
//          a registered device so the bell wakes the phone.
//   Email   one mail per recipient: the student's own address for Student
//           broadcasts, the guardian address for Parents broadcasts.
//
// WhatsApp has no sending pipe on the platform, so the compose form no longer
// offers it; a provider (WhatsApp Business API) has to be connected first.
//
// Safe to re-run: a broadcast is stamped Delivered with its results before
// the response returns; the sweep only picks up documents still Scheduled.
// ============================================================================

const STAFF_ROLES = ['owner', 'admin', 'tutor'];
const CHANNELS = ['In-App', 'Email'] as const;
const EMAIL_CHUNK = 10;
const EMAIL_MAX_RECIPIENTS = 300;

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function errStatus(e: unknown): number {
  const anyE = e as { status?: number; code?: number };
  return Number(anyE?.status || anyE?.code) || 500;
}

/** "2026-11-21T09:00" from datetime-local is Lagos wall clock; Lagos stays UTC+1 all year. */
function parseScheduledAt(value: string): number {
  const t = String(value || '').trim();
  if (!t) return 0;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(t)) return Date.parse(t) || 0;
  const withSeconds = t.length === 16 ? `${t}:00+01:00` : `${t}+01:00`;
  const at = Date.parse(withSeconds);
  return Number.isFinite(at) ? at : 0;
}

export interface AnnouncementResults {
  inApp?: { delivered: number; skipped: string };
  push?: { queued: number };
  email?: { sent: number; failed: number; noAddress: number; skipped: string };
}

/** Fan one saved announcement out through every channel it names. */
async function deliverAnnouncement(id: string, v: Record<string, any>): Promise<AnnouncementResults> {
  const centreId = cleanStr(v.centreId, 120);
  const title = cleanStr(v.title, 200);
  const fullBody = cleanStr(v.body, 4000);
  const audience = cleanStr(v.audience, 120) || 'All Programs';
  const target = v.target === 'Parents' ? 'Parents' : 'Student';
  const channels: string[] = Array.isArray(v.channels) ? v.channels.map((c: unknown) => cleanStr(c, 20)) : [];
  const results: AnnouncementResults = {};

  // The recipient set: every student of the facility, narrowed to the chosen
  // programme when the broadcast names one.
  const stuSnap = await adminDb.collection('students').where('centreId', '==', centreId).limit(1000).get();
  const students = stuSnap.docs
    .map((d) => d.data() as any)
    .filter((s) => audience === 'All Programs' || cleanStr(s.programmeName, 120) === audience);

  // In-App: one bell notification. `programmes` narrows which students see it;
  // the feed filters on it the same way it filters on subjects.
  if (channels.includes('In-App')) {
    try {
      await pushNotification({
        centreId,
        type: 'announcement',
        title,
        body: fullBody.slice(0, 400),
        programmes: audience === 'All Programs' ? [] : [audience],
      });
      results.inApp = { delivered: students.length, skipped: '' };
    } catch (e) {
      results.inApp = { delivered: 0, skipped: (e as Error).message || 'could not write the notification' };
    }

    // Device wake-up: queue one push job per student who actually has a
    // registered device. pushTokens is keyed by uid, so the uids are probed
    // in chunks instead of one read per student.
    const uids = students.map((s) => cleanStr(s.uid, 128)).filter(Boolean);
    let withDevices = 0;
    for (let i = 0; i < uids.length; i += 30) {
      const chunk = uids.slice(i, i + 30);
      let snap;
      try {
        snap = await adminDb.collection('pushTokens').where(FieldPath.documentId(), 'in', chunk).get();
      } catch { continue; }
      for (const d of snap.docs) {
        const raw = (d.data() || {}) as Record<string, any>;
        const devices: Record<string, any> =
          raw.devices && typeof raw.devices === 'object' ? raw.devices : {};
        const hasDevice = Object.values(devices).some((dev: any) => String(dev?.endpoint || '').startsWith('https://'));
        if (!hasDevice) continue;
        withDevices += 1;
        await adminDb.collection('pushQueue').doc(`prq_ann_${id}_${d.id}`).set(
          {
            id: `ann_${id}`,
            uid: d.id,
            title,
            kind: 'announcement',
            centreId,
            pushTitle: title,
            pushBody: fullBody.slice(0, 200),
            sendAt: Date.now(),
            sent: false,
            attempts: 0,
            createdAt: Date.now(),
          },
          { merge: true },
        );
      }
    }
    results.push = { queued: withDevices };
  }

  // Email: one mail per recipient, ten at a time so a large facility stays
  // inside the function's time budget.
  if (channels.includes('Email')) {
    if (!emailProviderConfigured()) {
      results.email = { sent: 0, failed: 0, noAddress: 0, skipped: 'no email provider is connected yet' };
    } else {
      let cs;
      try {
        cs = await adminDb.collection('centres').doc(centreId).get();
      } catch { cs = null; }
      const centreName = cleanStr((cs?.data() as any)?.name, 120) || 'your facility';
      const recipients = Array.from(new Set(
        students
          .map((s) => cleanStr(target === 'Parents' ? s.parentEmail : s.email, 200).toLowerCase())
          .filter(Boolean),
      )).slice(0, EMAIL_MAX_RECIPIENTS);
      const noAddress = students.filter((s) => !(target === 'Parents' ? s.parentEmail : s.email)).length;
      let sent = 0;
      let failed = 0;
      const subject = `${centreName}: ${title}`;
      const greeting = target === 'Parents' ? 'Dear Parent' : 'Hello';
      const text = `${greeting},\n\n${fullBody}\n\n— ${centreName}`;
      const html = `<p>${greeting},</p><p>${fullBody
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .split(/\n{2,}/).map((p: string) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')}</p><p>— ${centreName}</p>`;
      for (let i = 0; i < recipients.length; i += EMAIL_CHUNK) {
        const chunk = recipients.slice(i, i + EMAIL_CHUNK);
        const settled = await Promise.allSettled(
          chunk.map((to) => sendEmail({ to, subject, text, html })),
        );
        for (const r of settled) {
          const out = r.status === 'fulfilled' ? r.value : null;
          if (out?.delivered) sent += 1; else failed += 1;
        }
      }
      results.email = { sent, failed, noAddress, skipped: '' };
    }
  }

  return results;
}

export interface AnnouncementSweepResult {
  checked: number;
  delivered: number;
  failed: number;
  reason?: string;
}

/** Deliver every scheduled broadcast whose moment has arrived. */
export async function runAnnouncementSweep(opts: { limit?: number } = {}): Promise<AnnouncementSweepResult> {
  const out: AnnouncementSweepResult = { checked: 0, delivered: 0, failed: 0 };
  // Single-field query on purpose: status equality alone needs no composite
  // index, so this works without the user having to create one.
  const snap = await adminDb.collection('announcements')
    .where('status', '==', 'Scheduled')
    .limit(opts.limit ?? 10)
    .get();
  const now = Date.now();
  for (const doc of snap.docs) {
    const v = doc.data() as any;
    const scheduledAt = Number(v.scheduledAt || 0);
    if (!scheduledAt || scheduledAt > now) continue;
    out.checked += 1;
    try {
      const results = await deliverAnnouncement(doc.id, v);
      await doc.ref.set(
        { status: 'Delivered', deliveredAt: now, results, sentAt: scheduledAt },
        { merge: true },
      );
      out.delivered += 1;
    } catch (e) {
      out.failed += 1;
      console.error('[announcements] scheduled send failed for', doc.id, (e as Error).message);
      await doc.ref.set({ lastError: String((e as Error).message || 'send failed'), attempts: Number(v.attempts || 0) + 1 }, { merge: true }).catch(() => {});
    }
  }
  return out;
}

export function registerAnnouncementRoutes(app: express.Express): void {
  // Broadcast history for the Announcements page.
  app.get('/api/centre/announcements', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr((req.query.centreId as string) || '', 120);
      if (!centreId) return res.status(400).json({ error: 'A facility id is required.' });
      const membership = await requireMembership(caller, centreId);
      const role = String((membership as any)?.role || '');
      if (!caller.tos && !STAFF_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Only facility staff can view broadcast history.' });
      }
      const snap = await adminDb.collection('announcements')
        .where('centreId', '==', centreId)
        .limit(50)
        .get();
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      return res.json({ items });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not load broadcast history.' });
    }
  });

  // Compose + fan out (or schedule) a broadcast.
  app.post('/api/centre/announcements/broadcast', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.body?.centreId, 120);
      if (!centreId) return res.status(400).json({ error: 'A facility id is required.' });
      const membership = await requireMembership(caller, centreId);
      const role = String((membership as any)?.role || '');
      if (!caller.tos && !STAFF_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Only facility staff can send broadcasts.' });
      }
      const title = cleanStr(req.body?.title, 200);
      const body = cleanStr(req.body?.body, 4000);
      if (!title || !body) return res.status(400).json({ error: 'A title and body are required.' });
      const audience = cleanStr(req.body?.audience, 120) || 'All Programs';
      const channels = (Array.isArray(req.body?.channels) ? req.body.channels : [])
        .map((c: unknown) => cleanStr(c, 20))
        .filter((c: string) => (CHANNELS as readonly string[]).includes(c) || c === 'Student Group');
      const target = req.body?.target === 'Parents' ? 'Parents' : 'Student';
      const imageUrl = cleanStr(req.body?.imageUrl, 600);
      const groupId = cleanStr(req.body?.groupId, 80);
      const groupName = cleanStr(req.body?.groupName, 120);
      const sendMode = req.body?.sendMode === 'schedule' ? 'schedule' : 'now';
      const scheduledAt = sendMode === 'schedule' ? parseScheduledAt(req.body?.scheduleTime) : 0;
      if (sendMode === 'schedule' && (!scheduledAt || scheduledAt < Date.now() - 60_000)) {
        return res.status(400).json({ error: 'Pick a schedule time in the future.' });
      }

      const now = Date.now();
      const doc: Record<string, unknown> = {
        centreId,
        title,
        body,
        audience,
        channels,
        target,
        targetGroups: [target],
        imageUrl: imageUrl || '',
        groupId: groupId || '',
        groupName: groupName || '',
        status: sendMode === 'schedule' ? 'Scheduled' : 'Delivered',
        createdAt: now,
        createdBy: caller.uid,
      };
      if (sendMode === 'schedule') doc.scheduledAt = scheduledAt;

      const ref = await adminDb.collection('announcements').add(doc);
      if (sendMode === 'schedule') {
        return res.json({ ok: true, id: ref.id, status: 'Scheduled', scheduledAt });
      }
      const results = await deliverAnnouncement(ref.id, doc);
      await ref.set({ results, deliveredAt: Date.now() }, { merge: true });
      return res.json({ ok: true, id: ref.id, status: 'Delivered', results });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not send the broadcast.' });
    }
  });

  // Manual flush for scheduled broadcasts (the scheduled sender does the same).
  app.post('/api/centre/announcements/send-due', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.body?.centreId, 120);
      if (centreId) {
        const membership = await requireMembership(caller, centreId);
        const role = String((membership as any)?.role || '');
        if (!caller.tos && !STAFF_ROLES.includes(role)) {
          return res.status(403).json({ error: 'Only facility staff can run the broadcast sweep.' });
        }
      }
      const result = await runAnnouncementSweep({ limit: 10 });
      return res.json(result);
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not run the broadcast sweep.' });
    }
  });
}
