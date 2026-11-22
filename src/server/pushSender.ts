// ============================================================================
// Web push sender (Nov 19): turns the planner-reminder push queue into real
// device notifications.
//
// Flow:
//   1. When a member saves a planner reminder, /api/push/queue stores one
//      `pushQueue` document (server-only collection, no rules change needed).
//   2. A Netlify scheduled function (netlify/functions/push-sender.mts) runs
//      every 10 minutes and calls runPushSweep(), which sends every due,
//      not-yet-sent job to that member's registered devices via web-push.
//   3. Devices that answer 404/410 (subscription expired or uninstalled) are
//      removed from pushTokens so the next send is not wasted on them.
//
// Safe to re-run: jobs are marked sent with a timestamp, attempts cap at 3.
// The sweep no-ops (and returns a clear reason) until WEB_PUSH_PRIVATE_KEY
// is set in Netlify's environment variables; the public key is public by
// design and lives below.
// ============================================================================
import webpush from 'web-push';
import { adminDb } from './firebaseAdmin';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';

// Our own VAPID key pair (generated Nov 19 for this sender; the key pair
// Firebase's console mints cannot be used for self-sending because its private
// half stays inside Firebase). The public half ships in the browser app.
export const WEB_PUSH_PUBLIC_KEY =
  'BFXOh72Rhv-vH1AhTTn375mvNJCweGgoGGjwATkQVuplkyGx3KqMWlZS4cEPWJr0WJk8nTHwMAN47-W9nAhifgs';

/** Planner reminder "HH:MM AM/PM" -> minutes past midnight, 0 when absent. */
export function parseReminderMinutes(time: string): number {
  const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(time || '').trim());
  if (!t) return 0;
  let h = Number(t[1]);
  const mm = Number(t[2]);
  const ap = (t[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + mm;
}

/** Date "YYYY-MM-DD" + time -> epoch ms of that Lagos wall-clock moment. */
export function sendAtMs(date: string, time: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!m) return 0;
  const mins = parseReminderMinutes(time);
  // Lagos is UTC+1 all year (no daylight saving), so Lagos 09:00 = 08:00 UTC.
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, mins) - 60 * 60 * 1000;
}

// Facility icon for a push payload: the facility's own Cloudinary logo at
// 192px, or the default TOS icon. One read per facility, cached per process.
const logoCache = new Map<string, string>();
async function facilityIcon(centreId: string): Promise<string> {
  if (!centreId) return '/pwa-192x192.png';
  if (logoCache.has(centreId)) return logoCache.get(centreId) as string;
  let icon = '/pwa-192x192.png';
  try {
    const cs = await adminDb.collection('centres').doc(centreId).get();
    const logoUrl = String((cs.data() as any)?.logoUrl || '');
    const m = logoUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
    if (m) icon = `${m[1]}w_192,h_192,c_pad,b_white,f_png/${m[2]}`;
  } catch { /* fall back to the default icon */ }
  logoCache.set(centreId, icon);
  return icon;
}

export interface DirectPushResult {
  sent: number;
  failed: number;
  cleaned: number;
}

/**
 * Push straight to the registered devices of the given uids, without the
 * queue (Nov 20). "Send now" broadcasts use this so the push lands at the
 * same moment as the in-app bell and the emails; only scheduled sends keep
 * queueing, so the sweep alone controls their timing.
 */
export async function sendPushNow(opts: {
  centreId: string;
  uids: string[];
  title: string;
  body: string;
  tag?: string;
}): Promise<DirectPushResult> {
  const out: DirectPushResult = { sent: 0, failed: 0, cleaned: 0 };
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const uids = (opts.uids || []).filter(Boolean);
  if (!privateKey || !uids.length) return out;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT || 'mailto:noreply@tutorialos.com',
    WEB_PUSH_PUBLIC_KEY,
    privateKey,
  );
  const icon = await facilityIcon(String(opts.centreId || ''));
  const payload = JSON.stringify({
    title: String(opts.title || 'Announcement').slice(0, 120),
    body: String(opts.body || '').slice(0, 200),
    tag: String(opts.tag || `ann-${Date.now()}`),
    url: '/',
    icon,
    badge: icon,
  });
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    let snap;
    try {
      snap = await adminDb.collection('pushTokens').where(FieldPath.documentId(), 'in', chunk).get();
    } catch { continue; }
    for (const d of snap.docs) {
      const raw = (d.data() || {}) as Record<string, any>;
      // Fold the legacy dotted-key writes into the real device map.
      const deviceMap: Record<string, any> =
        raw.devices && typeof raw.devices === 'object' ? { ...raw.devices } : {};
      for (const [k, val] of Object.entries(raw)) {
        if (k.startsWith('devices.') && val && typeof val === 'object') deviceMap[k.slice(8)] = val;
      }
      for (const [hash, dev] of Object.entries(deviceMap)) {
        const endpoint = String(dev?.endpoint || '');
        if (!endpoint.startsWith('https://')) continue;
        try {
          await webpush.sendNotification(
            { endpoint, keys: { p256dh: String(dev?.keys?.p256dh || ''), auth: String(dev?.keys?.auth || '') } },
            payload,
            { TTL: 3600 },
          );
          out.sent += 1;
        } catch (e) {
          const status = Number((e as any)?.statusCode) || 0;
          if (status === 404 || status === 410) {
            // Subscription is gone: remove it so the next send is not wasted.
            const freshRaw = ((await adminDb.collection('pushTokens').doc(d.id).get()).data() || {}) as Record<string, any>;
            const freshMap: Record<string, any> =
              freshRaw.devices && typeof freshRaw.devices === 'object' ? { ...freshRaw.devices } : {};
            for (const [k, val] of Object.entries(freshRaw)) {
              if (k.startsWith('devices.') && val && typeof val === 'object') freshMap[k.slice(8)] = val;
            }
            delete freshMap[hash];
            await adminDb.collection('pushTokens').doc(d.id).set({ devices: freshMap, updatedAt: Date.now() }, { merge: true });
            out.cleaned += 1;
          } else {
            out.failed += 1;
          }
        }
      }
    }
  }
  return out;
}

/** Bell-history copy for a finished push-queue job, delivered or not:
 * the reminder log never depends on a device being reachable. Planner
 * heads-up copies file under rem-<id>-pre so both records survive. */
async function fileReminderBell(v: Record<string, any>, reminderId: string, opts: { pre?: boolean } = {}): Promise<void> {
  const isFee = String(v.kind || '') === 'fee_reminder';
  let centreId = String(v.centreId || '');
  if (!centreId) {
    const [stu, tut, adm] = await Promise.all([
      adminDb.collection('students').where('uid', '==', String(v.uid || '')).limit(1).get(),
      adminDb.collection('tutors').where('uid', '==', String(v.uid || '')).limit(1).get(),
      adminDb.collection('admins').doc(String(v.uid || '')).get(),
    ]);
    centreId = String(
      (!stu.empty ? stu.docs[0].data()?.centreId : undefined) ||
      (!tut.empty ? tut.docs[0].data()?.centreId : undefined) ||
      (adm.exists ? adm.data()?.centreId : undefined) || ''
    );
  }
  const timePart = v.time ? ` at ${String(v.time)}` : '';
  await adminDb.collection('notifications').doc(`rem-${reminderId}${opts.pre ? '-pre' : ''}`).set({
    centreId,
    type: 'reminder',
    title: isFee
      ? String(v.pushTitle || 'Payment reminder').slice(0, 120)
      : String(v.title || 'Planner reminder').slice(0, 120),
    body: isFee
      ? String(v.pushBody || '').slice(0, 400)
      : opts.pre
        ? `Planner reminder for ${String(v.date || '')}${timePart} (10 minutes ahead).`.slice(0, 400)
        : `Planner reminder for ${String(v.date || '')}${timePart}.`.slice(0, 400),
    subjects: [],
    audienceUid: String(v.uid || ''),
    reminderId: opts.pre ? `${reminderId}-pre` : reminderId,
    createdAt: Date.now(),
  }, { merge: true });
}

export interface PushSweepResult {
  reason?: string;
  checked: number;
  delivered: number;
  failed: number;
  cleaned: number;
  gaveUp: number;
  skippedLate: number;
}

/** Send every queued planner reminder whose time has arrived. */
export async function runPushSweep(opts: { limit?: number } = {}): Promise<PushSweepResult> {
  const out: PushSweepResult = { checked: 0, delivered: 0, failed: 0, cleaned: 0, gaveUp: 0, skippedLate: 0 };
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  if (!privateKey) {
    out.reason = 'WEB_PUSH_PRIVATE_KEY is not set yet in Netlify environment variables';
    return out;
  }
  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT || 'mailto:noreply@tutorialos.com',
    WEB_PUSH_PUBLIC_KEY,
    privateKey,
  );

  const now = Date.now();
  const snap = await adminDb
    .collection('pushQueue')
    .where('sent', '==', false)
    .where('sendAt', '<=', now)
    .orderBy('sendAt', 'asc')
    .limit(opts.limit ?? 20)
    .get();
  out.checked = snap.size;

  for (const job of snap.docs) {
    const v = job.data() as any;
    // A planner reminder whose moment passed while its job sat unsent (the app
    // was closed, the sweep hit its limit) must never arrive late: the job is
    // closed instead of sent. The 15-minute grace just covers the sweep's own
    // 10-minute cadence. Fee-reminder jobs are exempt; the fee sweep controls
    // their timing with its own due-date windows.
    const isPlannerJob = v.kind !== 'fee_reminder' && v.kind !== 'announcement';
    const isPre = String(v.phase || '') === 'pre';
    // One reminder id for the pair of jobs (on-time + 10-minute heads-up);
    // the heads-up copy files under rem-<id>-pre.
    const reminderId = String(v.id || job.id.replace(/^prq_/, '')).replace(/_pre$/, '');
    if (isPlannerJob && Number(v.sendAt || 0) < now - 15 * 60 * 1000) {
      await job.ref.set(
        { sent: true, sentAt: now, delivered: 0, note: 'reminder time already passed; not sent late' },
        { merge: true },
      );
      // Even a reminder whose moment passed unsent keeps its bell record:
      // the history log never depends on a push arriving.
      if (isPlannerJob) await fileReminderBell(v, reminderId, { pre: isPre });
      out.skippedLate += 1;
      continue;
    }
    const uid = String(v.uid || '');
    if (!uid) {
      await job.ref.set({ sent: true, sentAt: now, note: 'job had no owner' }, { merge: true });
      out.gaveUp += 1;
      continue;
    }
    // The notification carries the facility's own logo, so a Godzilla push
    // shows Godzilla's mark, never a default graduation cap.
    const icon = await facilityIcon(String(v.centreId || ''));
    // Fee-reminder jobs carry their own facility-voiced title and body;
    // planner jobs keep the platform's wording.
    const isFee = v.kind === 'fee_reminder';
    const isAnn = v.kind === 'announcement';
    const pushTitle = isFee || isAnn ? String(v.pushTitle || 'Announcement') : 'Planner reminder';
    const pushBody = isFee || isAnn
      ? String(v.pushBody || v.pushTitle || '')
      : isPre
        ? `${String(v.title || '')} starts in 10 minutes${v.time ? ` (${String(v.time)})` : ''}`
        : v.time ? `${v.title} (${v.time})` : String(v.title || '');
    const payload = JSON.stringify({
      title: pushTitle,
      body: pushBody,
      tag: isFee ? `fee-${String(job.id)}` : isAnn ? `ann-${String(job.id)}` : `planner-${String(v.id || job.id)}`,
      url: '/',
      icon,
      badge: icon,
    });

    const tokenSnap = await adminDb.collection('pushTokens').doc(uid).get();
    // Self-healing read: subscriptions saved by the earlier dotted-key write
    // sit in literal "devices.<hash>" fields; fold them into the real map.
    const raw = (tokenSnap.data() || {}) as Record<string, any>;
    const deviceMap: Record<string, any> =
      raw.devices && typeof raw.devices === 'object' ? { ...raw.devices } : {};
    for (const [k, val] of Object.entries(raw)) {
      if (k.startsWith('devices.') && val && typeof val === 'object') deviceMap[k.slice(8)] = val;
    }
    const endpoints = Object.values(deviceMap);
    console.log(`[push-sender] job ${job.id} uid=${uid} devices=${endpoints.length}`);
    if (!endpoints.length) {
      await job.ref.set({ sent: true, sentAt: now, delivered: 0, note: 'no device subscribed' }, { merge: true });
      // No device to buzz, but the reminder still earns its history record.
      if (isPlannerJob) await fileReminderBell(v, reminderId, { pre: isPre });
      continue;
    }

    let ok = 0;
    let hardFail = false;
    let cleanedJob = 0;
    for (const dev of endpoints) {
      const endpoint = String(dev?.endpoint || '');
      if (!endpoint.startsWith('https://')) continue;
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh: String(dev?.keys?.p256dh || ''), auth: String(dev?.keys?.auth || '') } },
          payload,
          { TTL: 3600 },
        );
        ok += 1;
      } catch (e) {
        const status = Number((e as any)?.statusCode) || 0;
        if (status === 404 || status === 410) {
          // Subscription is gone (app uninstalled, browser dropped it): clean up.
          const hash = require('crypto').createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
          const tokenRef = adminDb.collection('pushTokens').doc(uid);
          const freshRaw = ((await tokenRef.get()).data() || {}) as Record<string, any>;
          const freshMap: Record<string, any> =
            freshRaw.devices && typeof freshRaw.devices === 'object' ? { ...freshRaw.devices } : {};
          for (const [k, val] of Object.entries(freshRaw)) {
            if (k.startsWith('devices.') && val && typeof val === 'object') freshMap[k.slice(8)] = val;
          }
          delete freshMap[hash];
          await tokenRef.set({ devices: freshMap, updatedAt: now }, { merge: true });
          out.cleaned += 1;
          cleanedJob += 1;
        } else {
          hardFail = true;
          out.failed += 1;
        }
      }
    }

    if (ok > 0) {
      await job.ref.set({ sent: true, sentAt: now, delivered: ok }, { merge: true });
      // Announcement pushes get no bell-history copy here: the broadcast
      // fan-out already wrote the real in-app notification, and a `rem-`
      // copy would duplicate it in the bell with planner wording.
      if (isAnn) continue;
      out.delivered += 1;
      // Bell-history copy (Nov 19, widened Nov 22): every reminder is filed
      // as a bell notification with a deterministic id the bell de-dupes
      // against its upcoming row, delivered or missed, on time or heads-up
      // (rem-<id> / rem-<id>-pre). The history is never wiped.
      await fileReminderBell(v, reminderId, { pre: isPre });
    } else if (hardFail) {
      const attempts = Number(v.attempts) + 1;
      if (attempts >= 3) {
        await job.ref.set({ sent: true, sentAt: now, attempts, note: 'gave up after 3 attempts' }, { merge: true });
        out.gaveUp += 1;
      } else {
        await job.ref.set({ attempts }, { merge: true }); // retried next sweep
      }
    }
    // When every device was cleaned but none delivered (all 404/410), the
    // member has no working device left, so mark the job done to stop retries.
    if (ok === 0 && !hardFail && endpoints.length > 0 && cleanedJob === endpoints.length) {
      await job.ref.set({ sent: true, sentAt: now, delivered: 0, note: 'no working device left' }, { merge: true });
    }
  }
  return out;
}
