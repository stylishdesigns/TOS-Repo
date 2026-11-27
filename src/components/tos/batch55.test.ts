import fs from 'fs';
import path from 'path';

/**
 * Batch 55: the mobile sign-in flow, one access code only, real TOS branding.
 * - In a browser the app-only rule blocks (phones, tablets), confirming the
 *   facility on the access-code gate hands the facility to the install page:
   * /app opens straight on "Install <facility>'s app", never a second
 *   access-code ask, and keeps the facility's accent colour there.
 * - The gate's helper line ("Enter the 6-digit access code...") shows only
 *   before the code is found, never on the confirmation card.
 * - The confirmation card is bigger: 80px facility logo and a text-3xl name.
 * - The real TOS brand icon (tos-brand-icon.png, the same mark the boot
 *   splash and the app icon use) replaces the old generic icon on the gate,
 *   the app-only "Open this portal in the app" screen and the install page
 *   header, and sits beside a bigger "Tutorial OS" wordmark on the landing
 *   header and footer.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

// --- Gate: one access code, then the install page ------------------------
const gate = read('src/components/auth/CentreCodeGate.tsx');
const handoff = gate.indexOf("sessionStorage.setItem('tos:app-centre'");
const redirect = gate.indexOf("window.location.href = '/app'");
expect(handoff > -1, 'the gate hands the confirmed facility to the install page');
expect(handoff < redirect, 'the handoff is written before the redirect to /app');
expect(gate.includes("const slug = String(centre.centreName || '').toLowerCase().replace(/[^a-z0-9]+/g, '')"), 'the handoff derives the same slug the install page derives');
expect(gate.includes("accent: String(centre.accentColor || '')"), 'the handoff carries the facility accent colour');
expect(gate.includes("sessionStorage.removeItem('tos:signup-result')"), 'the handoff drops any earlier signup branding');

// --- Gate: helper text only before the code is found ---------------------
const helperCount = (gate.match(/Enter the 6-digit access code provided by your education facility\./g) || []).length;
expect(helperCount === 2, 'the six-digit helper line stays in the file');
const condCount = (gate.match(/\{!centre && \(/g) || []).length;
expect(condCount === 2, 'each helper line is wrapped so it hides once the facility is found');

// --- Gate: the confirmation card is bigger -------------------------------
expect(gate.includes('w-20 h-20 mx-auto rounded-2xl object-contain bg-white p-2 mb-3 shadow-lg'), 'the found facility logo renders 80px');
expect(gate.includes('text-3xl font-black text-white tracking-tight'), 'the found facility name renders at text-3xl');

// --- Gate + app-only gate + install page: the real TOS brand icon --------
expect(gate.includes('<img src="/tos-brand-icon.png" alt="Tutorial OS" className="w-16 h-16 rounded-2xl mb-4 shadow-lg" />'), 'the gate shows the real TOS brand icon');
const only = read('src/components/portal/AppOnlyGate.tsx');
expect(only.includes('<img src="/tos-brand-icon.png"'), 'the app-only screen shows the real TOS brand icon');
expect(!only.includes('>TO</div>'), 'the app-only screen no longer shows the TO initials block');
const installPage = read('src/components/public/AppInstallPage.tsx');
expect(installPage.includes('<img src="/tos-brand-icon.png"'), 'the install page header shows the real TOS brand icon');
expect(!installPage.includes('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'), 'the old shield icon is gone from the install page');
expect(installPage.includes('accent?: string'), 'the install page accepts the handoff accent');
expect(installPage.includes("useState<string>(() => appCentre?.accent || '')"), 'the install page starts from the handoff accent');

// --- Landing: real icon + bigger wordmark, header and footer -------------
const landing = read('src/components/public/TutorialOsLanding.tsx');
expect((landing.match(/<span className="bx"><img src="\/tos-brand-icon\.png" alt="" \/><\/span>Tutorial OS<\/a>/g) || []).length === 2, 'the real brand icon sits beside the wordmark in header and footer');
expect(!landing.includes('bx\"><svg'), 'the old inline shield is gone from the landing brand links');
const css = read('src/components/public/landing/design.css');
expect(css.includes('.brand{display:flex;align-items:center;gap:10px;font:900 21px Inter,sans-serif'), 'the landing wordmark renders 21px');
expect(css.includes('.bx{width:42px;height:42px;border-radius:12px;overflow:hidden'), 'the brand box is sized for the image');
expect(css.includes('.bx img{width:100%;height:100%;object-fit:contain}'), 'the brand image fills its box');

if (failures) { console.log(`batch55: ${failures} failed`); process.exit(1); }
console.log('batch55: all good');
