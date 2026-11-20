/**
 * Automated payment reminders, fired by Netlify's scheduler once a day.
 *
 * For every facility whose automatic-reminder settings are enabled, sends
 * the due email, device-push and in-chat reminders to students with an
 * outstanding balance (see src/server/feeReminders.ts). Each send is marked
 * in `reminderSends`, so a re-run never sends the same reminder twice.
 *
 * Note: Netlify only fires scheduled functions from the site's production
 * deploy, so this becomes automatic once this branch reaches main. Until
 * then the facility admin's "Run reminders now" button (POST
 * /api/centre/reminders/run) runs the same sweep on demand.
 */
import { runFeeReminderSweep } from '../../src/server/feeReminders';
import { runPushSweep } from '../../src/server/pushSender';

export default async () => {
  const reminders = await runFeeReminderSweep({});
  const push = reminders.pushed > 0 ? await runPushSweep({ limit: 50 }) : undefined;
  console.log('[fee-reminder-sweep]', JSON.stringify({ reminders, push }));
  return new Response(JSON.stringify({ reminders, push }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { schedule: '0 6 * * *' };
