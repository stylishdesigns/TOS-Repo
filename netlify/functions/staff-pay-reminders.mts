/**
 * Automated staff pay reminders, fired by Netlify's scheduler once a day.
 *
 * For every facility, finds staff members whose pay is due today or overdue
 * (from their pay cycle and the last recorded payment) and sends the
 * in-chat message, device push and email reminder automatically, once a
 * day, until the owner records the payment (see src/server/staffPayReminders.ts).
 *
 * Note: Netlify only fires scheduled functions from the site's production
 * deploy, so this becomes automatic once this branch reaches main. Until
 * then the owner's "Run reminders now" action (POST
 * /api/centre/staff-pay-reminders/run) runs the same sweep on demand.
 */
import { runStaffPayReminderSweep } from '../../src/server/staffPayReminders';
import { runPushSweep } from '../../src/server/pushSender';

export default async () => {
  const reminders = await runStaffPayReminderSweep({});
  const push = reminders.pushed > 0 ? await runPushSweep({ limit: 50 }) : undefined;
  console.log('[staff-pay-reminders]', JSON.stringify({ reminders, push }));
  return new Response(JSON.stringify({ reminders, push }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { schedule: '0 6 * * *' };
