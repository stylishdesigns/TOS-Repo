/**
 * Daily mock release, fired by Netlify's scheduler at 05:00 UTC = 06:00 in
 * Africa/Lagos (Lagos has no daylight saving). Releases every past-dated
 * mock whose attempts have all left their deadline windows: sums the score
 * tally, builds the leaderboard, flips the mock to released.
 *
 * Safe to re-run: released mocks are skipped, and anything deferred or
 * failed is picked up the next morning, or earlier through the TOS
 * console's release button (POST /api/tos/mocks/release).
 *
 * Note: Netlify only fires scheduled functions from the site's production
 * deploy, so this job becomes automatic once this branch reaches main;
 * until then the TOS console's release button does the same work.
 */
import { runReleaseSweep } from '../../src/server/mockRelease';

export default async () => {
  const result = await runReleaseSweep({ budgetMs: 8000 });
  console.log('[mock-release]', JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const config = { schedule: '0 5 * * *' };
