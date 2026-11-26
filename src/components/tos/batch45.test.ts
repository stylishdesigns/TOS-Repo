/**
 * Batch 45: the facility admin portal is exempt from the app-only gate on
 * desktop. When app-only portals is ON:
 *  - a desktop browser (min-width 1024px + a fine pointer) opens the admin
 *    portal on the web;
 *  - phones and tablets stay blocked (the installed app only);
 *  - the student and tutor portals stay blocked in every browser;
 *  - the exemption follows the window live on resize.
 */
import { readFileSync } from 'fs';

const repo = process.cwd();
const read = (p: string) => readFileSync(`${repo}/${p}`, 'utf-8');

const failures: string[] = [];
const check = (name: string, cond: unknown) => {
  if (cond) console.log(`  ok ${name}`);
  else { console.error(`  FAIL ${name}`); failures.push(name); }
};

const gate = read('src/components/portal/AppOnlyGate.tsx');
const app = read('src/App.tsx');

// 1. Desktop helper exists and matches a wide screen with a fine pointer.
check('isDesktopBrowser exported', gate.includes('export const isDesktopBrowser'));
check('desktop requires min-width 1024', gate.includes("window.matchMedia('(min-width: 1024px)')"));
check('desktop requires pointer: fine', gate.includes("window.matchMedia('(pointer: fine)')"));

// 2. Gate takes desktopOk and the blocked decision exempts desktop only then.
check('gate accepts desktopOk prop', gate.includes('desktopOk?: boolean'));
check('blocked exempts desktop only with desktopOk', gate.includes('!(desktopOk && desktop)'));
check('non-desktop gate path unchanged (standalone opens)', gate.includes('isStandaloneDisplay()'));
check('desktop exemption follows resize live', gate.includes("window.addEventListener('resize', update)"));

// 3. Only the admin portal wrap passes desktopOk.
const passes = app.split('desktopOk').length - 1;
check('exactly one desktopOk in App.tsx', passes === 1);
const adminIdx = app.indexOf('// Admin Portal Dashboard matching video layout and Geometric Balance theme');
check('admin comment found', adminIdx > 0);
const afterAdmin = app.slice(adminIdx, adminIdx + 400);
check('the desktopOk sits on the admin wrap', afterAdmin.includes('<AppOnlyGate desktopOk>'));
// Student and tutor wraps stay plain gates.
const studentIdx = app.indexOf('StudentPortal');
const tutorIdx = app.indexOf('TutorPortal');
const studentSlice = app.slice(Math.max(0, studentIdx - 600), studentIdx + 200);
const tutorSlice = app.slice(Math.max(0, tutorIdx - 600), tutorIdx + 200);
check('student wrap has no desktopOk', !studentSlice.includes('desktopOk'));
check('tutor wrap has no desktopOk', !tutorSlice.includes('desktopOk'));

// 4. Docblock says the exemption is admin-only.
check('docblock documents the admin exemption', gate.includes('The admin portal is the one exception'));

// 5. The centre access-code gate no longer sends desktop browsers to the
// /app install page after the code resolves: desktop continues into the
// facility app flow (welcome, then sign-in), where the admin portal opens.
const codeGate = read('src/components/auth/CentreCodeGate.tsx');
check('code gate imports isDesktopBrowser', codeGate.includes("import { isAppOnlyOn, isStandaloneDisplay, isDesktopBrowser }"));
check('code gate skips /app redirect on desktop', codeGate.includes('!isStandaloneDisplay() && !isDesktopBrowser()'));
check('blocked-screen copy names the admin exception', gate.includes('On a desktop computer, admins can also sign in from the browser'));

if (failures.length > 0) {
  console.error(`batch 45: ${failures.length} failing`);
  process.exit(1);
}
console.log('batch 45: all checks pass');
