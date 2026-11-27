/**
 * Batch 46: the access-code gate's "Back to landing page" works inside the
 * facility-app context. When the gate opens on a facility link (?centre= in
 * the address), the state-based back could not leave that context: the same
 * render branch re-drew the gate, so the button appeared dead and the visitor
 * stayed stuck on the facility's gate. It now navigates to /#landing for
 * real: a fresh load with no ?centre= shows the public Tutorial OS landing.
 * Inside the installed app the control stays hidden (standalone CSS), so the
 * navigation never fires there.
 */
import { readFileSync } from 'fs';

const repo = process.cwd();
const read = (p: string) => readFileSync(`${repo}/${p}`, 'utf-8');

const failures: string[] = [];
const check = (name: string, cond: unknown) => {
  if (cond) console.log(`  ok ${name}`);
  else { console.error(`  FAIL ${name}`); failures.push(name); }
};

const app = read('src/App.tsx');
const install = read('src/components/public/AppInstallPage.tsx');
const css = read('src/index.css');

// 1. The app-context gate (lockedCentre) navigates to /#landing on back.
const gateIdx = app.indexOf('lockedCentre=');
check('app-context gate found', gateIdx > 0);
const gateBlock = app.slice(gateIdx, gateIdx + 1600);
check('gate back navigates to /#landing', gateBlock.includes("window.location.href = '/#landing'"));
const backCount = (app.match(/window\.location\.href = '\/#landing'/g) || []).length;
// Two intentional hard navigations to /#landing: the app-context gate's back
// (this batch) and the staff door's back (batch 52h), both fresh-load fixes.
const staffIdx = app.indexOf('TosAdminLogin onBack=');
const staffBlock = app.slice(staffIdx, staffIdx + 600);
check('two /#landing navigations in App.tsx (gate + staff door)', backCount === 2);
check('staff door back navigates to /#landing', staffBlock.includes("window.location.href = '/#landing'"));
check('no stale state-only back on the app-context gate', !gateBlock.includes('setCentreGateRequested(false)'));

// 2. The app context belt still holds the loading screen (unchanged).
check('bound-facility belt still holds the loading screen', app.includes('isAppContext && appFacility && !currentUser && !appWelcomeCentre'));

// 3. The /app page's back link is unchanged and hidden in the installed app.
check('install page back link targets /#landing', install.includes('href="/#landing"'));
check('gate back control marked data-gate-back', read('src/components/auth/CentreCodeGate.tsx').includes('data-gate-back'));
check('standalone CSS hides the gate back control', css.includes('@media (display-mode: standalone){ [data-gate-back]{display:none!important} }'));

if (failures.length) { console.error(`batch46: ${failures.length} failed`); process.exit(1); }
console.log('batch46 ok');
