/**
 * Batch 65: an unpaid facility's app still opens.
 * The lead-tier lock (batch 26) was written for the public landing page: an
 * unpaid facility shows no public facility page. The facility app's binding
 * reuses that same lookup, so the lock leaked into the app and an unpaid
 * facility could not even reach its own access-code gate. Now the binding
 * lookup carries app=1, and the server serves the facility's details for an
 * app lookup at any tier; only a non-app lookup, the public landing page,
 * stays locked.
 */
import { readFileSync } from 'fs';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const server = readFileSync('src/server/extendedRoutes.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const install = readFileSync('src/components/public/AppInstallPage.tsx', 'utf8');

check('server reads the app flag on the binding lookup',
  server.includes("const isAppLookup = String(req.query.app || '') === '1';"));
check('lead-tier lock applies only to a non-app lookup',
  server.includes("if (facilityTier(billing) === 'lead' && !isAppLookup) {"));
check('the landing lock is intact: the public page still answers locked',
  server.includes("'This facility page is not available right now. Please contact the facility admin directly.'"));
check('the app binding lookup carries app=1',
  app.includes('centre-by-slug?centre=${encodeURIComponent(slug)}&app=1'));
check('the locked screen stays in the app as a fallback',
  app.includes('This facility page is not available</h1>'));
check('the /app install page lookup is untouched (no app flag)',
  install.includes('centre-by-slug?centre=${encodeURIComponent(slug)}`'));

if (failed) { console.error(`batch65: ${failed} check(s) failed`); process.exit(1); }
console.log('batch65: all checks pass');
