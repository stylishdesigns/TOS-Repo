/**
 * Batch 63: the facility app never paints TOS surfaces.
 * A facility app is bound to one facility (?centre= in its start address).
 * Answering "no" to the routing hole the user hit: their device carried a
 * signed-in platform-staff session, and the app opened straight into the TOS
 * console instead of the access-code gate. The fences now in place:
 *  1. The TOS console and its platform-staff explainer never render in the
 *     app context.
 *  2. The TOS staff door (#tos) is ignored in the app context, and the
 *     device's last-surface memory never marks a facility app as TOS or
 *     forces the #tos-admin hash.
 *  3. The TOS landing never paints in the app context, even on #landing.
 *  4. Inside the app a platform-staff session is invisible: automatic entry
 *     never runs for it, and the access-code gate and app login page treat
 *     it like a signed-out visit. The staff session itself is left alone.
 */
import { readFileSync } from 'fs';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const app = readFileSync('src/App.tsx', 'utf8');

check('flags defined (tosDoorActive, facilityAppStaffSession)',
  app.includes('const tosDoorActive = tosLoginRequested && !isAppContext;') &&
  app.includes('const facilityAppStaffSession = isAppContext && isTosAdmin;'));
check('TOS console never renders in the app context',
  /if \(currentUser && isTosAdmin && !centreAppRequested && !forceLanding && !isAppContext\) return/.test(app));
check('platform-staff explainer never renders in the app context',
  app.includes('if (currentUser && isTosAdmin && !activeCentreId && !forceLanding && !isAppContext) {'));
check('staff door ignored in the app context', app.includes('if (tosDoorActive) {'));
check('last-surface never marks a facility app as TOS',
  app.includes('const onTos = !isAppContext && (tosLoginRequested || (!!currentUser && isTosAdmin && !centreAppRequested));'));
check('TOS landing never paints in the app context',
  app.includes('if ((!isAppContext && forceLanding) || (showWelcome && !currentUser)) {'));
check('app gate treats a staff session as signed out',
  app.includes('if ((!currentUser || facilityAppStaffSession) && !tosDoorActive && !pendingCentre && isAppContext && appFacility && appWelcomeCentre && appWelcomeMode === null) {'));
check('app welcome screen reachable for a staff session',
  app.includes("if ((!currentUser || facilityAppStaffSession) && !tosDoorActive && centreGateRequested && appWelcomeCentre && appWelcomeMode === 'welcome') {"));
check('app login page reachable for a staff session',
  app.includes("if ((!currentUser || facilityAppStaffSession) && appWelcomeCentre && appWelcomeMode === 'login') {"));
check('belt branch covers a staff session',
  app.includes('if (isAppContext && appFacility && (!currentUser || facilityAppStaffSession) && !appWelcomeCentre) {'));
check('automatic entry never runs for a staff session in the app',
  app.includes('if (isAppContext && appFacility && hasTosClaim) {'));
check('entry effect watches the staff claim',
  /resumeCentreSession, hasTosClaim\]\);/.test(app));
check('stale TOS hash is reset to the app door',
  app.includes("if (h === '#tos-admin' || h === '#landing') window.location.hash = '#access';"));

if (failed) { console.error(`batch63: ${failed} check(s) failed`); process.exit(1); }
console.log('batch63: all checks pass');
