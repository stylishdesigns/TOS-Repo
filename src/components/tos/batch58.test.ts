import fs from 'fs';
import path from 'path';

/**
 * Batch 58: the faint-text and logo fixes on the access path.
 *  1. The facility logo reaches the facility login page again: pendingCentre
 *     carries logoUrl through the centre gate's onProceed and authCentre
 *     hands it to AuthPortal (the generic icon regression).
 *  2. The gate's "You are entering" label is white and bold.
 *  3. "Back to landing page" is a visible bordered pill on the gate and a
 *     bright bordered button on the app install page.
 *  4. "Or continue with" on the facility login card reads in slate-600.
 *  5. The TOS monogram tile: the TOS text and the cap are enlarged to fill
 *     the orange component (font-size 175, cap scaled 1.45), every icon
 *     file regenerated from the new SVG, og-proposal.jpg re-tiled.
 */

const repo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) { failed++; console.log('FAIL ' + label); } };

const app = repo('src/App.tsx');
check(app.includes('accent?: string; logoUrl?: string } | null'), 'pendingCentre carries logoUrl');
check((app.match(/setPendingCentre\(\{ code: '', centreName: facility\.centreName, centreId: facility\.centreId, accent: facility\.accent, logoUrl: facility\.logoUrl \}\);/) || []).length === 1, 'facility-resolution pendingCentre carries logoUrl');
check((app.match(/setPendingCentre\(\{ code, centreName, centreId, accent, logoUrl: logoUrl \|\| '' \}\);/g) || []).length === 2, 'both gate onProceeds hand the logo through');
check(app.includes('logoUrl: pendingCentre.logoUrl'), 'authCentre passes pendingCentre logoUrl to AuthPortal');
check(app.includes('logoUrl: appWelcomeCentre.logoUrl }'), 'welcome-restore pendingCentre carries logoUrl');

const gate = repo('src/components/auth/CentreCodeGate.tsx');
check(gate.includes('text-xs uppercase tracking-widest text-white font-bold mb-1'), 'You are entering is white and bold');
check(!gate.includes('text-slate-500 font-bold mb-1'), 'old faded entering label gone');
check(gate.includes('rounded-full border border-slate-600 text-slate-200 hover:text-white hover:border-slate-400'), 'Back to landing page is a bright bordered pill');

const install = repo('src/components/public/AppInstallPage.tsx');
check(install.includes("color: '#F1F5F9'") && install.includes("border: '1px solid rgba(255,255,255,0.35)'") && install.includes("background: 'rgba(255,255,255,0.12)'"), 'install-page back button is bright');

const auth = repo('src/components/auth/AuthPortal.tsx');
check(auth.includes('px-4 bg-white text-slate-600">Or continue with</span>'), 'Or continue with reads in slate-600');
check(!auth.includes('text-slate-400">Or continue with'), 'old faded divider gone');

const svg = repo('public/icon.svg');
check(svg.includes('font-size="175"'), 'TOS text enlarged to 175');
check(svg.includes('scale(1.45)'), 'cap scaled up to match');
check(svg.includes('y="378"'), 'monogram re-centred in the tile');
for (const f of ['tos-brand-icon.png', 'pwa-512x512.png', 'pwa-192x192.png', 'apple-touch-icon.png', 'favicon-32.png', 'favicon.ico', 'icon.svg', 'og-proposal.jpg']) {
  check(fs.existsSync(path.join(process.cwd(), 'public', f)), 'icon file present: ' + f);
}
check(repo('public/og-proposal.jpg').length > 10000, 'og-proposal.jpg is a real rebuilt image');

if (failed) { console.log(`batch58: ${failed} failed`); process.exit(1); }
console.log('batch58: all checks pass');
