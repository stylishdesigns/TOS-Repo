/**
 * Batch 65: an unpaid facility's app still opens.
 * The lead-tier lock (batch 26) was written for the public landing page and
 * leaked into the facility app's binding lookup. Batch 65 first carved the
 * app lookup out of the lock with an app=1 flag; batch 66 then removed the
 * lock entirely at the user's direction (every tier's page opens), so the
 * flag went with it. These checks now guard the state batch 66 left behind.
 */
import { readFileSync } from 'fs';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const server = readFileSync('src/server/extendedRoutes.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const install = readFileSync('src/components/public/AppInstallPage.tsx', 'utf8');

check('no app flag remains on the binding lookup',
  !app.includes('&app=1'));
check('no tier gate or locked reply remains on the public lookup',
  !server.includes('locked: true') && !server.includes('isAppLookup'));
check('the public lookup still answers the real payload',
  server.includes('centreId: doc.id') && server.includes('accessCodeRequired: data.accessCodeRequired !== false,'));
check('the app binding lookup is a plain centre fetch',
  app.includes('centre-by-slug?centre=${encodeURIComponent(slug)}`'));
check('the locked screen stays in the app as a fallback',
  app.includes('This facility page is not available</h1>'));
check('the /app install page lookup is untouched (no app flag)',
  install.includes('centre-by-slug?centre=${encodeURIComponent(slug)}`'));

if (failed) { console.error(`batch65: ${failed} check(s) failed`); process.exit(1); }
console.log('batch65: all checks pass');
