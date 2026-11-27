// Custom exam requests (batch 64, user-requested 2026-11-27): when a facility
// signs up on the landing page and types an exam that is not in the Tutorial
// OS registry (the signup exam chips plus their Custom box), that exam is
// filed here as a pending request. The TOS console's Exams panel lists the
// pending requests: approving registers the exam in the shared examTypes
// library so it can get its own questions; discarding closes it. Every new
// request notifies the TOS admin by email and (when the console has push
// turned on) by web push. Server-only collection examRequests, read through
// requireTos routes and the public trial route; no Firestore rules changes.
import { adminDb } from './firebaseAdmin';
import { sendEmail } from './email';
import { sendPushNow } from './pushSender';

/** Exams the signup form offers as chips; they never need a request. */
const BUILT_IN_EXAMS = new Set(['jamb', 'waec', 'neco', 'post-utme', 'ijmb', 'jupeb']);

function examSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Where TOS admin notifications go. Set TOS_ADMIN_EMAILS to add recipients. */
export function tosNotifyEmails(): string[] {
  return (process.env.TOS_ADMIN_EMAILS || 'stylishdesigns484@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export interface ExamRequestDoc {
  id: string;
  examName: string;
  nameLower: string;
  centreId: string;
  centreName: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * File a signup's custom exams as pending requests. Exams already in the
 * registry (or the built-in chips) are skipped; a duplicate pending request
 * for the same exam name is skipped too, so many facilities asking for the
 * same exam do not flood the admin. Never throws: the trial must succeed
 * regardless.
 */
export async function fileCustomExamRequests(opts: {
  exams: string[];
  centreId: string;
  centreName: string;
  requestedBy: string;
}): Promise<{ filed: string[]; skipped: string[] }> {
  const filed: string[] = [];
  const skipped: string[] = [];
  try {
    const names = Array.from(new Set((opts.exams || []).map((s) => String(s).trim().slice(0, 24)).filter(Boolean)));
    if (!names.length || !opts.centreId) return { filed, skipped };
    const registry = new Set<string>();
    try {
      const snap = await adminDb.collection('examTypes').get();
      for (const d of snap.docs) {
        const n = String((d.data() as Record<string, any>)?.name || '').trim().toLowerCase();
        if (n) registry.add(n);
      }
    } catch { /* registry read failure must not block signup */ }
    const now = new Date().toISOString();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (BUILT_IN_EXAMS.has(lower) || registry.has(lower)) { skipped.push(name); continue; }
      try {
        const dup = await adminDb.collection('examRequests')
          .where('nameLower', '==', lower)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
        if (!dup.empty) { skipped.push(name); continue; }
      } catch { /* dedup is best-effort */ }
      const ref = adminDb.collection('examRequests').doc();
      const doc: Omit<ExamRequestDoc, 'id'> & { id: string } = {
        id: ref.id,
        examName: name,
        nameLower: lower,
        centreId: opts.centreId,
        centreName: String(opts.centreName || '').slice(0, 120),
        requestedBy: String(opts.requestedBy || '').slice(0, 120),
        requestedAt: now,
        status: 'pending',
      };
      await ref.set(doc);
      filed.push(name);
    }
    if (filed.length) await notifyTosAdmin(filed, opts.centreName || '', opts.centreId);
  } catch (e) {
    console.error('[exam-requests] filing failed:', (e as any)?.message || e);
  }
  return { filed, skipped };
}

/** Email + push the TOS admin about new pending requests. Best-effort. */
async function notifyTosAdmin(names: string[], centreName: string, centreId: string): Promise<void> {
  const list = names.join(', ');
  const where = 'TOS console > Learning Resources > Exams > Custom exam requests';
  try {
    for (const to of tosNotifyEmails()) {
      await sendEmail({
        to,
        subject: `New custom exam request: ${list}`.slice(0, 120),
        text: `A facility added an exam that is not in the Tutorial OS library.\n\nExam: ${list}\nFacility: ${centreName}\n\nReview it under ${where}. Approving adds the exam to the library so it can get its own questions; discarding closes the request.`,
        html: `<p>A facility added an exam that is not in the Tutorial OS library.</p>`
          + `<p><b>Exam:</b> ${esc(list)}<br/><b>Facility:</b> ${esc(centreName)}</p>`
          + `<p>Review it under ${esc(where)}. Approving adds the exam to the library so it can get its own questions; discarding closes the request.</p>`,
      });
    }
  } catch (e) {
    console.error('[exam-requests] email failed:', (e as any)?.message || e);
  }
  try {
    const emails = tosNotifyEmails();
    const snap = await adminDb.collection('pushTokens').get();
    const uids = snap.docs
      .filter((d) => emails.includes(String((d.data() as Record<string, any>)?.email || '').toLowerCase()))
      .map((d) => d.id);
    if (uids.length) {
      await sendPushNow({
        centreId,
        uids,
        title: 'New custom exam request',
        body: `${list} — from ${centreName}. Review it in the Exams panel.`.slice(0, 200),
        tag: `examreq-${examSlug(names[0])}-${Date.now()}`,
      });
    }
  } catch (e) {
    console.error('[exam-requests] push failed:', (e as any)?.message || e);
  }
}
