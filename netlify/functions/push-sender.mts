/**
 * Planner-reminder push sender, fired by Netlify's scheduler every 10 minutes.
 *
 * Sends every due, not-yet-sent job in the server-only `pushQueue`
 * collection (one job per saved planner reminder) to that member's
 * registered devices, using the same VAPID keys the browser used to
 * subscribe. Devices that answer 404/410 are cleaned out of pushTokens.
 *
 * Safe to re-run: sent jobs are stamped with a timestamp, and a job that
 * keeps failing is given up on after 3 attempts.
 *
 * Note: Netlify only fires scheduled functions from the site's production
 * deploy, so this becomes automatic once this branch reaches main. Until
 * then POST /api/push/send-due (staff token) does the same work, and the
 * sweep no-ops with a clear reason until WEB_PUSH_PRIVATE_KEY is set in
 * Netlify's environment variables.
 */
import { runPushSweep } from '../../src/server/pushSender';
import { runAnnouncementSweep } from '../../src/server/announcementRoutes';

export default async () => {
  const result = await runPushSweep({ limit: 20 });
  // Scheduled broadcasts (compose page, "Schedule" mode) ride the same
  // 10-minute cadence: due ones deliver here, minutes after their moment.
  const announcements = await runAnnouncementSweep({ limit: 10 });
  console.log('[push-sender]', JSON.stringify(result), '[announcements]', JSON.stringify(announcements));
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { schedule: '*/10 * * * *' };
