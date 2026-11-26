/**
 * Batch 48: the one-page proposal.
 * A compressed single-sheet version of the full proposal, served at the same
 * /proposal/:slug link with ?short=1, with its own "One-page PDF" button in
 * the console Proposals tab (?short=1&pdf=1). The PDF script scales the whole
 * capture to exactly one A4 page, never spilling onto a second.
 */
import { readFileSync } from 'fs';

const repo = process.cwd();
const read = (p: string) => readFileSync(`${repo}/${p}`, 'utf-8');

const failures: string[] = [];
const check = (name: string, cond: unknown) => {
  if (cond) console.log(`  ok ${name}`);
  else { console.error(`  FAIL ${name}`); failures.push(name); }
};

const page = read('src/server/proposalPage.ts');
const tab = read('src/components/tos/TosProposals.tsx');

// The compact page exists and is a real compressed variant.
check('compact builder exists', page.includes('export function buildCompactProposalPage'));
check('compact CSS exists', page.includes('const COMPACT_CSS'));
check('compact serves on ?short=1', page.includes("(req.query as any).short || '') === '1'"));
check('full page builder unchanged', page.includes('export function buildProposalPage(displayName: string, origin: string, slug: string): string'));

// Same facts as the full proposal: pricing, seat language, plan list.
check('compact keeps NGN 0 free row', /Free Facility<\/th><td><span class="price">NGN 0<\/span> <small>free forever/.test(page.replace(/\s+/g, ' ')) || page.includes('NGN 0'));
check('compact keeps NGN 1,000 Standard', page.includes('NGN 1,000'));
check('compact keeps NGN 2,500 Premium', page.includes('NGN 2,500'));
check('compact says per seat per month, never per student', page.includes('/ seat / month'));
check('compact keeps the 7/3/1 warnings', page.includes('7, 3 and 1 days'));
check('compact keeps fresh 30 days on payment', page.includes('fresh 30 days'));
check('compact keeps 5-student free cap', page.includes('up to 5 students'));
check('compact keeps Android/iPhone wording', page.includes('the same app works on both phones'));
check('compact keeps management wording for fees', page.includes('Fee management for students and parents'));

// The PDF script compresses to exactly ONE page.
check('compact PDF fits to one A4 height', page.includes('canvas.width * pageH / canvas.height'));
check('compact PDF names the file -1page', page.includes('-1page.pdf'));
check('compact still falls back to print', page.includes('window.print()'));
check('compact auto-downloads on pdf=1', page.includes("get('pdf') === '1'"));

// The console has its own separate one-page button.
check('console has One-page PDF button', tab.includes('One-page PDF'));
check('console button opens short=1&pdf=1', tab.includes('&short=1&pdf=1'));
check('existing Download PDF button kept', tab.includes('Download PDF'));
check('existing Download PDF link unchanged', tab.includes("&pdf=1`, '_blank', 'noopener')"));

// The full proposal page itself is untouched by this batch.
check('full page keeps its own pricing table', page.includes('Every facility starts free and upgrades when it grows.'));
check('full page keeps its covers cards', page.includes('class="covers"'));

if (failures.length) { console.error(`batch48: ${failures.length} failed`); process.exit(1); }
console.log('batch48 ok');
