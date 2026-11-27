/**
 * Batch 67: the facility app's launch is entirely the facility's own.
 * (1) The launch splash animation is the facility-branded type on every
 * launch: facility logo, facility name and the three-dot wave on the
 * facility colour. The bound app feeds the lookup's branding straight into
 * the splash, first launch included, and holds it briefly before the gate
 * or dashboard takes over. The device remembers the branding at install and
 * at lookup, so the boot splash is theirs too.
 * (2) The facility app never carries TOS branding: a boot with nothing
 * remembered loads plain white with no wordmark, and the access-code gate
 * inside the facility app shows the facility's logo (or nothing) instead of
 * the Tutorial OS mark. The Tutorial OS mark stays on the gate opened from
 * the TOS landing page.
 */
import { readFileSync } from 'fs';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const boot = readFileSync('index.html', 'utf8');
const splash = readFileSync('src/components/student-portal/LaunchSplash.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const gate = readFileSync('src/components/auth/CentreCodeGate.tsx', 'utf8');
const install = readFileSync('src/components/public/AppInstallPage.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// The boot splash: a facility door with nothing remembered is neutral.
check('the boot splash has a neutral, unbranded state',
  boot.includes('#boot-splash.neutral .wm { display: none; }') && boot.includes("el.classList.add('neutral')"));
const neutralAt = boot.indexOf("el.classList.add('neutral')");
const tosAt = boot.indexOf("el.classList.add('tos')");
check('the neutral state comes before the TOS wordmark fallback',
  neutralAt > -1 && tosAt > neutralAt);
check('the facility boot still paints the remembered brand',
  boot.includes("localStorage.getItem('tos:launch-brand')") && boot.includes('if (b.name) nm.textContent'));

// The splash: the facility's own animation, from the lookup, first launch.
check('the splash accepts the facility branding directly',
  splash.includes('facility?: { centreName?: string; accent?: string; logoUrl?: string } | null'));
check('the facility branding wins over device memory',
  splash.indexOf('(facility && /^#[0-9a-fA-F]{6}$/.test(String(facility.accent || \'\')))')
    < splash.indexOf('readPersisted()'));
check('the splash keeps the facility logo, name and dots layout',
  splash.includes('backgroundColor: branding.accent') && splash.includes('tosLaunchDot'));
check('the plain fallback stays unbranded',
  splash.includes('if (plain && !branding.accent)') && !splash.slice(splash.indexOf('if (plain && !branding.accent)'), splash.indexOf('// TOS mode:')).includes('Tutorial'));
check('the launch-brand persistence is shared',
  splash.includes('export function persist(b: LaunchBranding)'));

// App.tsx: the hold, the branded splash, the remembered branding.
check('the app holds the facility splash before the gate',
  app.includes('const [appSplashHold, setAppSplashHold] = useState(false);')
    && app.includes('setTimeout(() => setAppSplashHold(false), 1100)'));
check('the gate waits for the splash hold to end',
  app.includes('appWelcomeMode === null && !appSplashHold'));
check('the held splash is the facility-branded one',
  app.includes('<LaunchSplash facility={appFacility} />'));
check('the pre-lookup splash stays unbranded',
  app.includes('<LaunchSplash plain />'));
check('the app remembers the facility branding for the next boot',
  app.includes("localStorage.setItem('tos:launch-brand'"));

// The gate: no TOS mark inside the facility app; TOS landing keeps it.
check('the TOS mark shows only on the TOS-landing gate',
  gate.includes('{!lockedCentre && (') && gate.includes('src="/tos-brand-icon.png"'));
const tosIconAt = gate.indexOf('src="/tos-brand-icon.png"');
const lockedGuardAt = gate.indexOf('{!lockedCentre && (');
check('the TOS mark sits inside the non-locked guard',
  lockedGuardAt > -1 && tosIconAt > lockedGuardAt && tosIconAt < lockedGuardAt + 200);
check('the facility gate shows the facility logo when it has one',
  gate.includes('lockedCentre && lockedCentre.logoUrl ?'));

// The install page seeds the branding for the first cold start.
check('the install page remembers the facility launch brand',
  install.includes("localStorage.setItem('tos:launch-brand'"));

check('batch67 registered in the chain', pkg.scripts.test.includes('batch67.test.ts'));

if (failed) { console.error(`batch67: ${failed} check(s) failed`); process.exit(1); }
console.log('batch67: all checks pass');
