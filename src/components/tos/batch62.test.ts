/**
 * Batch 62: admin readability sweep.
 * 1. The "View terms & conditions" button on the video-classes card shows dark,
 *    bigger text (it sat in the facility brand colour, invisible for light brands).
 * 2. Sub-text under every heading in the admin screens is bigger (13px) and a
 *    much stronger slate-700 (slate-300 inside the always-dark landing tiles),
 *    so it is readable in light mode and on the dark canvas.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };

// 1. Video-terms opener: dark, readable text.
const rm = readFileSync('src/components/academics/ResourcesManager.tsx', 'utf8');
check('opener uses slate-800 at 13px', rm.includes('text-[13px] font-bold text-slate-800 hover:underline'));
check('opener no longer uses the brand colour for text', !rm.includes("text-[var(--brand, #0F172A)] dark:text-slate-200 hover:underline"));

// 2. The sweep landed: strong 13px sub-text under headings in the sampled screens.
const sampled = [
  'src/components/dashboard/DashboardOverview.tsx',
  'src/components/settings/SettingsView.tsx',
  'src/components/academics/ResourcesManager.tsx',
  'src/components/students/SeatsManagementPanel.tsx',
  'src/components/finance/FinanceManager.tsx',
  'src/components/cms/CmsManager.tsx',
  'src/components/tutors/TutorsManager.tsx',
];
for (const f of sampled) {
  const s = readFileSync(f, 'utf8');
  check(`${f.split('/').pop()} carries text-[13px] text-slate-700`, s.includes('text-[13px]') && s.includes('text-slate-700'));
}

// 3. Landing editor's always-dark tiles keep light sub-text.
const le = readFileSync('src/components/landing/LandingEditor.tsx', 'utf8');
check('landing tile sub-text stays light (slate-300)', le.includes('text-[13px] text-slate-300'));

// 4. No malformed class leaked from the sweep.
let bad = '';
try { bad = execSync('grep -rl "text-slate-slate-" src --include=*.tsx || true').toString().trim(); } catch { /* none */ }
check('no malformed text-slate-slate- classes', !bad);

if (failed) { console.error(`batch62: ${failed} check(s) failed`); process.exit(1); }
console.log('batch62: all checks pass');
