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
import { FieldValue } from 'firebase-admin/firestore';

// Same VAPID public key the browser uses to subscribe (public by design).
export const WEB_PUSH_PUBLIC_KEY =
  'BFMo8SSNA0RgwpNF0zVU_cVP5wVKRCjQrOBwh2ODha7Ml1iKBiXRsuuA3ySI77Zp5owrp3oC7kOHTv8H6Agtn6o';

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

export interface PushSweepResult {
  reason?: string;
  checked: number;
  delivered: number;
  failed: number;
  cleaned: number;
  gaveUp: number;
}

/** Send every queued planner reminder whose time has arrived. */
export async function runPushSweep(opts: { limit?: number } = {}): Promise<PushSweepResult> {
  const out: PushSweepResult = { checked: 0, delivered: 0, failed: 0, cleaned: 0, gaveUp: 0 };
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
    const uid = String(v.uid || '');
    if (!uid) {
      await job.ref.set({ sent: true, sentAt: now, note: 'job had no owner' }, { merge: true });
      out.gaveUp += 1;
      continue;
    }
    const payload = JSON.stringify({
      title: 'Planner reminder',
      body: v.time ? `${v.title} (${v.time})` : String(v.title || ''),
      tag: `planner-${String(v.id || job.id)}`,
      url: '/',
    });

    const tokenSnap = await adminDb.collection('pushTokens').doc(uid).get();
    const devices = (tokenSnap.data()?.devices || {}) as Record<string, any>;
    const endpoints = Object.values(devices);
    if (!endpoints.length) {
      await job.ref.set({ sent: true, sentAt: now, delivered: 0, note: 'no device subscribed' }, { merge: true });
      continue;
    }

    let ok = 0;
    let hardFail = false;
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
          await adminDb.collection('pushTokens').doc(uid)
            .set({ [`devices.${hash}`]: FieldValue.delete(), updatedAt: now }, { merge: true });
          out.cleaned += 1;
        } else {
          hardFail = true;
          out.failed += 1;
        }
      }
    }

    if (ok > 0) {
      await job.ref.set({ sent: true, sentAt: now, delivered: ok }, { merge: true });
      out.delivered += 1;
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
    if (ok === 0 && !hardFail && endpoints.length > 0 && out.cleaned > 0) {
      await job.ref.set({ sent: true, sentAt: now, delivered: 0, note: 'no working device left' }, { merge: true });
    }
  }
  return out;
}
