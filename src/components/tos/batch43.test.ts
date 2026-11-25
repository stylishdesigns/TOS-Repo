import fs from 'fs';
import path from 'path';

/**
 * Batch 43: three fixes.
 * 1. The boot-splash wordmark logo sits inline with the text (36px tile next
 *    to the 34px words, not a 54px block).
 * 2. Student check-in locks once the facility's closing time has passed: the
 *    Check In button disables after closing (no check in, no check out for a
 *    student who never checked in), with its own hint line.
 * 3. Absence is marked only AFTER closing time, never before: the admin
 *    attendance list shows Pending (awaiting check-in) until closing, and the
 *    attendance rate reads only settled days.
 * 4. The facility name sits dead centre of the student header: equal 1fr side
 *    columns balance the button group.
 */

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf-8');

let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name}`); failed++; }
};

const indexHtml = read('index.html');
check('wordmark tile is 36px', /#boot-splash \.wm img \{ width: 36px; height: 36px;/.test(indexHtml));
check('old 54px tile is gone', !indexHtml.includes('width: 54px; height: 54px;'));
check('wordmark gap tightened', /#boot-splash \.wm \{ display: none; align-items: center; gap: 10px; \}/.test(indexHtml));

const splash = read('src/components/student-portal/LaunchSplash.tsx');
check('React wordmark tile w-9 h-9', splash.includes('src="/tos-brand-icon.png" alt="Tutorial OS" className="w-9 h-9 rounded-xl"'));

const home = read('src/components/student-portal/tabs/HomeTab.tsx');
check('afterClosing defined', home.includes('const afterClosing = !clockedInAt && isClosingTime;'));
check('check-in disabled after closing', home.includes('disabled={!!clockedInAt || beforeResumption || afterClosing}'));
check('after-closing hint line', home.includes('Check-in is closed for today'));

const tracker = read('src/components/academics/AttendanceTracker.tsx');
check('Pending status exists', tracker.includes("'Present' | 'Absent' | 'Late' | 'No clock out' | 'Pending'"));
check('pending until closing passes', tracker.includes("isTodaySelected && !closingPassed ? 'Pending' : 'Absent'"));
check('pending chip colour', tracker.includes("rec.status === 'Pending'\n                          ? 'bg-blue-50 text-blue-700 border-blue-200'"));
check('alert cell waits while pending', tracker.includes("rec.status === 'Pending' ? 'Waiting' : 'Normal'"));
check('rate reads settled days only', tracker.includes('resolvedTotal'));

const portal = read('src/components/student-portal/StudentPortal.tsx');
check('header name dead centre (1fr_auto_1fr)', portal.includes('grid-cols-[1fr_auto_1fr]'));
check('old flex-1 name block gone', !portal.includes('flex-1 min-w-0 text-center'));

const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf-8')) as { scripts: { test: string } };
check('batch 43 chained into npm test', pkg.scripts.test.includes('batch43.test.ts'));

if (failed > 0) { console.log(`--- ${failed} BATCH-43 CHECKS FAILED ---`); process.exit(1); }
console.log('--- ALL BATCH-43 CHECKS PASSED ---');
