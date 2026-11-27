/**
 * Batch 59: two follow-ups from the same contrast/logo pass, found on the live walkthrough:
 *  1. The TOS monogram tile really fills the orange: TOS text font-size 205 (was 175),
 *     mortarboard scaled 1.70 (was 1.45), text baseline 406, cap lift -81.
 *  2. "Or continue with" is readable on the DARK facility login card: the span carries the
 *     or-divider hook and the dark theme repaints it (background #101a2c, text #cbd5e1).
 */
import fs from 'fs';
let fails = 0;
function check(cond: boolean, msg: string) { if (!cond) { fails++; console.log('FAIL', msg); } else { console.log('ok', msg); } }

const icon = fs.readFileSync('public/icon.svg', 'utf8');
check(icon.includes('font-size="205"'), 'TOS text enlarged to 205');
check(icon.includes('scale(1.7)'), 'mortarboard scaled 1.70');
check(icon.includes('y="406"'), 'text baseline moved to 406');
check(icon.includes('translate(0,-81)'), 'cap lift -81');

const auth = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');
check(auth.includes('px-4 bg-white text-slate-600 or-divider">Or continue with</span>'), 'divider span carries or-divider');
check(!auth.includes('px-4 bg-white text-slate-600">Or continue with'), 'old span replaced');

const css = fs.readFileSync('src/index.css', 'utf8');
check(css.includes('.tos-student-dark .or-divider { background-color: #101a2c; color: #cbd5e1; }'), 'dark or-divider rule present');
const idx = css.indexOf('.tos-student-dark .or-divider');
const bg = css.indexOf('.tos-student-dark .bg-white { background-color: #101a2c; }');
check(idx > -1 && bg > -1 && idx > bg, 'or-divider rule lands after the bg-white override');

for (const f of ['public/tos-brand-icon.png','public/pwa-192x192.png','public/pwa-512x512.png','public/apple-touch-icon.png','public/favicon-32.png']) {
  check(fs.existsSync(f), f + ' exists');
}

if (fails) { console.log('batch59: ' + fails + ' failures'); process.exit(1); }
console.log('batch59: all checks pass');
