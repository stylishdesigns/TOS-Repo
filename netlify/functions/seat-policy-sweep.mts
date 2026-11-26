/**
 * Seat-policy sweep, fired by Netlify's scheduler once a day.
 *
 * Warns facility admins before seat enforcement lands (see
 * src/server/seatSweep.ts): a 7-day landing-page warning for facilities below
 * the paid-seat minimum, one notice when the page actually pauses, and a
 * seats-finishing digest for running seats with 5 or fewer days left.
 *
 * Netlify only fires scheduled functions from the site's production deploy,
 * so this becomes automatic once this branch reaches main. Until then
 * POST /api/centre/seats/sweep runs the same sweep for one facility on demand.
 */
import { runSeatPolicySweep } from '../../src/server/seatSweep';

export default async () => {
  const result = await runSeatPolicySweep({});
  console.log('[seat-policy-sweep]', JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { schedule: '30 6 * * *' };
