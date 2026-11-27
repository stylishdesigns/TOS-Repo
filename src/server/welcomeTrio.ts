import express from 'express';
import { adminDb } from './firebaseAdmin';
import { pushNotification } from './notificationRoutes';
import { sendPushNow } from './pushSender';
import { sendEmail, buildRoleWelcomeEmail, type WelcomeRole } from './email';

/**
 * Batch 58: the welcome trio. The first time an account takes its first look
 * inside its portal, it gets one welcome notification (in-app), one push and
 * one email naming the facility and its programmes, and the benefits of the
 * portal it just opened. Guarded server-side by users/{uid}.welcomeSentAt,
 * so no account is ever welcomed twice even across devices.
 */

interface Caller {
  uid: string;
  email?: string;
}

function errStatus(e: unknown): number {
  const anyE = e as { status?: number; code?: number };
  return Number(anyE?.status || anyE?.code) || 500;
}

function roleCopy(role: WelcomeRole, centreName: string, programmes: string): { title: string; body: string } {
  if (role === 'admin') {
    return {
      title: `Welcome to ${centreName}`,
      body: `Your ${centreName} dashboard is ready. Add students and tutors, manage fees, upload study materials, schedule CBT mocks and follow attendance and the leaderboard, all in one place.`,
    };
  }
  if (role === 'tutor') {
    return {
      title: `Welcome to ${centreName}`,
      body: `Your classes, study materials, attendance and CBT mocks for ${centreName} are all in one place. Check your timetable and reach your students any time.`,
    };
  }
  return {
    title: `Welcome to ${centreName}`,
    body: `Your classes, study materials, video lessons, practice questions and CBT mocks${programmes ? ` for ${programmes}` : ''} are ready. Practise daily, take your mocks and climb the leaderboard.`,
  };
}

async function resolveRole(uid: string): Promise<{ role: WelcomeRole | null; centreId: string | null; fullName: string; email: string | null }> {
  const out = { role: null as WelcomeRole | null, centreId: null as string | null, fullName: '', email: null as string | null };
  const stuSnap = await adminDb.collection('students').where('uid', '==', uid).limit(1).get();
  if (!stuSnap.empty) {
    const stu = stuSnap.docs[0].data() as any;
    out.role = 'student';
    out.centreId = String(stu.centreId || '') || null;
    out.fullName = String(stu.name || '');
    out.email = String(stu.email || '') || null;
    return out;
  }
  const tutorSnap = await adminDb.collection('tutors').where('uid', '==', uid).limit(1).get();
  if (!tutorSnap.empty) {
    const tutor = tutorSnap.docs[0].data() as any;
    out.role = 'tutor';
    out.centreId = String(tutor.centreId || '') || null;
    out.fullName = String(tutor.name || '');
    out.email = String(tutor.email || '') || null;
    return out;
  }
  const memSnap = await adminDb
    .collection('memberships')
    .where('uid', '==', uid)
    .where('role', 'in', ['owner', 'admin'])
    .limit(1)
    .get();
  if (!memSnap.empty) {
    const mem = memSnap.docs[0].data() as any;
    out.role = 'admin';
    out.centreId = String(mem.centreId || '') || null;
    out.fullName = String(mem.name || '');
    out.email = String(mem.email || '') || null;
    return out;
  }
  return out;
}

export function registerWelcomeRoutes(app: express.Express): void {
  app.post('/api/welcome/first-look', async (req: express.Request, res: express.Response) => {
    try {
      const caller = (req as any).caller as Caller | undefined;
      if (!caller?.uid) return res.status(401).json({ error: 'Unauthorized' });
      const uid = String(caller.uid);

      const userRef = adminDb.collection('users').doc(uid);
      const userDoc = await userRef.get();
      if (userDoc.exists && userDoc.data()?.welcomeSentAt) {
        return res.json({ ok: true, already: true });
      }

      const found = await resolveRole(uid);
      if (!found.role || !found.centreId) {
        // No portal role yet (e.g. a brand-new sign-in before the centre
        // resolves): nothing to welcome, and the flag stays unset so the
        // portal fires this again once the role exists.
        return res.json({ ok: true, skipped: 'no-role' });
      }
      const centreId = found.centreId;
      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      const centreName = String((cDoc.data() as any)?.name || centreId);
      const programmes = Array.isArray((cDoc.data() as any)?.programmes)
        ? ((cDoc.data() as any).programmes as string[]).join(', ')
        : '';

      const { title, body } = roleCopy(found.role, centreName, programmes);

      // In-app: the notifications collection every portal already listens to.
      await pushNotification({ centreId, type: 'welcome', title, body, audienceUid: uid });

      // Push: direct and immediate; never blocks the response on failure.
      sendPushNow({ centreId, uids: [uid], title, body, tag: `welcome-${uid}` }).catch(() => undefined);

      // Email: same facility, role-specific benefits. Fire and forget too;
      // the flag is stamped regardless so the trio never repeats.
      const email = found.email || caller.email || '';
      if (email) {
        const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
        sendEmail(
          buildRoleWelcomeEmail({
            to: email,
            fullName: found.fullName || caller.email?.split('@')[0] || 'there',
            centreName,
            programmes,
            role: found.role,
            appUrl,
          })
        ).catch(() => undefined);
      }

      await userRef.set({ welcomeSentAt: new Date().toISOString(), welcomeRole: found.role }, { merge: true });
      return res.json({ ok: true });
    } catch (error: any) {
      console.error('[welcome] first-look failed:', error?.message || error);
      return res.status(errStatus(error)).json({ error: 'Could not record your welcome. It will not be sent twice.' });
    }
  });
}
