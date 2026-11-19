import express from 'express';
import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { Caller, httpError, requireMembership } from './tenantService';
import { sendAtMs, runPushSweep } from './pushSender';

// ============================================================================
// In-app notifications for the student portal.
//
// Every notification lives in the Firestore `notifications` collection:
//   { centreId, type, title, body, subjects?, audienceUid?, createdAt }
//   type: 'class' | 'material' | 'mock' | 'leaderboard' | 'welcome'
//   subjects: delivered only to students taking those subjects (empty = all)
//   audienceUid: delivered only to that one student (welcome notes)
// Each student's read position lives in `notificationReads/{centreId}__{uid}`.
// Writes go through the server only; the client just reads and marks read.
// ============================================================================

const STAFF_ROLES = ['owner', 'admin', 'tutor'];

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

export async function pushNotification(input: {
  centreId: string;
  type: string;
  title: string;
  body: string;
  subjects?: string[];
  audienceUid?: string;
}): Promise<void> {
  const doc: Record<string, unknown> = {
    centreId: cleanStr(input.centreId, 120),
    type: cleanStr(input.type, 20),
    title: cleanStr(input.title, 120),
    body: cleanStr(input.body, 400),
    createdAt: Date.now(),
  };
  const subjects = (input.subjects || []).map((s) => cleanStr(s, 60)).filter(Boolean);
  if (subjects.length) doc.subjects = subjects;
  if (input.audienceUid) doc.audienceUid = cleanStr(input.audienceUid, 128);
  await adminDb.collection('notifications').add(doc);
}

async function getStudentDoc(uid: string) {
  const snap = await adminDb.collection('students').where('uid', '==', uid).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

function subjectsInclude(studentSubjects: unknown, needed: string[]): boolean {
  const mine = Array.isArray(studentSubjects)
    ? studentSubjects.map((s: unknown) => String(s).trim().toLowerCase())
    : [];
  if (!needed.length) return true;
  return needed.some((s) => mine.includes(s.trim().toLowerCase()));
}

export function registerNotificationRoutes(app: express.Express): void {
  // Staff (owner/admin/tutor) publish a notification for their centre.
  app.post('/api/notifications/push', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.body?.centreId, 120);
      if (!centreId) return res.status(400).json({ error: 'A facility id is required.' });
      const membership = await requireMembership(caller, centreId);
      const role = String((membership as any)?.role || '');
      if (!caller.tos && !STAFF_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Only facility staff can send notifications.' });
      }
      const type = cleanStr(req.body?.type, 20);
      if (!['class', 'material', 'mock', 'leaderboard', 'welcome'].includes(type)) {
        return res.status(400).json({ error: 'Unknown notification type.' });
      }
      const title = cleanStr(req.body?.title, 120);
      const body = cleanStr(req.body?.body, 400);
      if (!title || !body) return res.status(400).json({ error: 'A title and body are required.' });
      await pushNotification({
        centreId, type, title, body,
        subjects: Array.isArray(req.body?.subjects) ? req.body.subjects : [],
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not send the notification.' });
    }
  });

  // A student's notification feed: latest 60, filtered to their subjects.
  app.get('/api/student/notifications', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No facility is linked to this account.' });
      await requireMembership(caller, centreId);

      const [snap, readSnap] = await Promise.all([
        adminDb.collection('notifications').where('centreId', '==', centreId).orderBy('createdAt', 'desc').limit(60).get(),
        adminDb.collection('notificationReads').doc(`${centreId}__${caller.uid}`).get(),
      ]);
      const lastReadAt = Number(readSnap.data()?.lastReadAt) || 0;
      const items: Record<string, unknown>[] = [];
      let unread = 0;
      for (const d of snap.docs) {
        const v = d.data() as any;
        if (v.audienceUid && v.audienceUid !== caller.uid) continue;
        // The subject filter only bites when the student actually has
        // subjects saved: a student with none saved sees everything, never
        // just the welcome note (the Nov 19 bug where every class, material
        // and mock was hidden from them).
        const stuSubjects = Array.isArray(student.subjects) ? student.subjects : [];
        if (stuSubjects.length > 0 && !subjectsInclude(stuSubjects, Array.isArray(v.subjects) ? v.subjects : [])) continue;
        const at = Number(v.createdAt) || 0;
        if (at > lastReadAt) unread += 1;
        items.push({
          id: d.id,
          type: cleanStr(v.type, 20),
          title: cleanStr(v.title, 120),
          body: cleanStr(v.body, 400),
          subjects: Array.isArray(v.subjects) ? v.subjects : [],
          at,
        });
      }
      return res.json({ items, unread });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not load notifications.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Web push (Nov 19): each signed-in member can allow notifications on a
  // device. The subscription is stored server-side in the `pushTokens`
  // collection, one document per member with one entry per device endpoint.
  // Only the server touches this collection (Admin SDK), so the Firestore
  // rules need no change for it.
  // ---------------------------------------------------------------------------
  const endpointHash = (endpoint: string): string =>
    createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

  async function resolveMemberCentre(uid: string): Promise<{ centreId: string; role: string }> {
    const [stu, tut, adm] = await Promise.all([
      adminDb.collection('students').where('uid', '==', uid).limit(1).get(),
      adminDb.collection('tutors').where('uid', '==', uid).limit(1).get(),
      adminDb.collection('admins').doc(uid).get(),
    ]);
    if (!stu.empty) {
      const v = stu.docs[0].data() as any;
      return { centreId: cleanStr(v.centreId, 120), role: 'student' };
    }
    if (!tut.empty) {
      const v = tut.docs[0].data() as any;
      return { centreId: cleanStr(v.centreId, 120), role: 'tutor' };
    }
    if (adm.exists) {
      const v = adm.data() as any;
      return { centreId: cleanStr(v.centreId, 120), role: cleanStr(v.role, 20) || 'admin' };
    }
    return { centreId: '', role: '' };
  }

  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const caller = getCaller(req);
      const sub = (req.body?.subscription || {}) as Record<string, any>;
      const endpoint = cleanStr(sub.endpoint, 500);
      const p256dh = cleanStr(sub.keys?.p256dh, 200);
      const auth = cleanStr(sub.keys?.auth, 200);
      if (!endpoint.startsWith('https://') || !p256dh || !auth) {
        return res.status(400).json({ error: 'A valid push subscription is required.' });
      }
      const resolved = await resolveMemberCentre(caller.uid);
      const centreId = cleanStr(req.body?.centreId, 120) || resolved.centreId;
      if (centreId) await requireMembership(caller, centreId);
      const now = Date.now();
      const ref = adminDb.collection('pushTokens').doc(caller.uid);
      // Firestore stores dotted keys in set() as literal field names, not
      // nested paths, so the device must live inside a real `devices` map.
      // Legacy literal "devices.<hash>" fields left by the earlier write are
      // folded in here, which repairs subscriptions saved before this fix.
      const prevSnap = await ref.get();
      const prev = (prevSnap.data() || {}) as Record<string, any>;
      const devices: Record<string, any> =
        prev.devices && typeof prev.devices === 'object' ? { ...prev.devices } : {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith('devices.') && v && typeof v === 'object') devices[k.slice(8)] = v;
      }
      devices[endpointHash(endpoint)] = { endpoint, keys: { p256dh, auth }, updatedAt: now };
      await ref.set(
        {
          uid: caller.uid,
          email: caller.email,
          ...(centreId ? { centreId } : {}),
          ...(resolved.role ? { role: resolved.role } : {}),
          devices,
          updatedAt: now,
        },
        { merge: true }
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not save this device for notifications.' });
    }
  });

  app.post('/api/push/unsubscribe', async (req, res) => {
    try {
      const caller = getCaller(req);
      const endpoint = cleanStr(req.body?.endpoint, 500);
      const ref = adminDb.collection('pushTokens').doc(caller.uid);
      if (!endpoint) {
        await ref.delete().catch(() => {});
        return res.json({ ok: true });
      }
      const snap = await ref.get();
      const raw = (snap.data() || {}) as Record<string, any>;
      const devices: Record<string, any> =
        raw.devices && typeof raw.devices === 'object' ? { ...raw.devices } : {};
      for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('devices.') && v && typeof v === 'object') devices[k.slice(8)] = v;
      }
      delete devices[endpointHash(endpoint)];
      await ref.set({ devices, updatedAt: Date.now() }, { merge: true });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not remove this device.' });
    }
  });

  // Mark everything read for this student.
  app.post('/api/student/notifications/read', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const centreId = cleanStr((stuSnap.data() as any).centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No facility is linked to this account.' });
      await requireMembership(caller, centreId);
      await adminDb.collection('notificationReads').doc(`${centreId}__${caller.uid}`)
        .set({ lastReadAt: Date.now(), uid: caller.uid }, { merge: true });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not mark notifications read.' });
    }
  });

  // Manual trigger for the scheduled push sweep (staff only). The Netlify
  // scheduler only fires scheduled functions from production deploys, so on a
  // preview this route lets staff run the same sweep to test reminders.
  app.post('/api/push/send-due', async (req, res) => {
    try {
      const caller = getCaller(req);
      const resolved = await resolveMemberCentre(caller.uid);
      if (!STAFF_ROLES.includes(resolved.role)) {
        return res.status(403).json({ error: 'Only facility staff can run the push sweep.' });
      }
      const result = await runPushSweep({ limit: 20 });
      return res.json(result);
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not run the push sweep.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Planner-reminder push queue (Nov 19): when a member saves a reminder, the
  // client posts it here and the server stores one `pushQueue` document whose
  // sendAt is the reminder's Lagos wall-clock moment. The scheduled sender
  // (netlify/functions/push-sender.mts, every 10 minutes) turns due jobs into
  // real device notifications. Server-only collection: no rules change needed.
  // ---------------------------------------------------------------------------
  app.post('/api/push/queue', async (req, res) => {
    try {
      const caller = getCaller(req);
      const r = (req.body?.reminder || {}) as Record<string, any>;
      const id = cleanStr(r.id, 60);
      const date = cleanStr(r.date, 10);
      const time = cleanStr(r.time, 20);
      const title = cleanStr(r.title, 120);
      const kind = cleanStr(r.kind, 12);
      if (!id || !title) return res.status(400).json({ error: 'A reminder id and title are required.' });
      const sendAt = sendAtMs(date, time);
      if (!sendAt) return res.status(400).json({ error: 'A valid reminder date is required.' });
      const resolved = await resolveMemberCentre(caller.uid);
      await adminDb.collection('pushQueue').doc(`prq_${id}`).set(
        { id: `prq_${id}`, uid: caller.uid, date, time, title, kind, centreId: resolved.centreId, sendAt, sent: false, attempts: 0, createdAt: Date.now() },
        { merge: true }
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not queue this reminder.' });
    }
  });

  app.post('/api/push/unqueue', async (req, res) => {
    try {
      const caller = getCaller(req);
      const id = cleanStr(req.body?.id, 60);
      if (!id) return res.status(400).json({ error: 'A reminder id is required.' });
      const ref = adminDb.collection('pushQueue').doc(`prq_${id}`);
      const snap = await ref.get();
      if (snap.exists && String((snap.data() as any).uid) === caller.uid) {
        await ref.delete().catch(() => {});
      }
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not remove this reminder from the queue.' });
    }
  });

  // One-time welcome note for a student, sent by the student's own client the
  // first time they land in the portal. Idempotent per student.
  app.post('/api/student/notifications/welcome', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const centreId = cleanStr((stuSnap.data() as any).centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No facility is linked to this account.' });
      await requireMembership(caller, centreId);
      const existing = await adminDb.collection('notifications')
        .where('centreId', '==', centreId)
        .where('type', '==', 'welcome')
        .where('audienceUid', '==', caller.uid)
        .limit(1).get();
      if (!existing.empty) return res.json({ ok: true, already: true });
      const centreSnap = await adminDb.collection('centres').doc(centreId).get();
      const centre = (centreSnap.data() || {}) as any;
      const name = cleanStr(centre.name, 80) || 'your facility';
      let programmes = '';
      const progs = Array.isArray(centre.programmes) ? centre.programmes : [];
      const names = progs.map((p: unknown) => cleanStr(typeof p === 'object' && p ? (p as any).name : p, 60)).filter(Boolean);
      if (names.length) programmes = ` Programmes: ${names.slice(0, 6).join(', ')}.`;
      await pushNotification({
        centreId,
        type: 'welcome',
        title: `Welcome to ${name}`,
        body: `You have joined ${name}.${programmes} Your classes, study materials, mock exams and the daily leaderboard all live in this app.`,
        audienceUid: caller.uid,
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(errStatus(e)).json({ error: (e as Error).message || 'Could not send the welcome notification.' });
    }
  });
}
