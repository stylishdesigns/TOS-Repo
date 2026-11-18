import express from 'express';
import { adminDb } from './firebaseAdmin';
import { Caller, httpError, requireMembership } from './tenantService';

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
        if (!subjectsInclude(student.subjects, Array.isArray(v.subjects) ? v.subjects : [])) continue;
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
