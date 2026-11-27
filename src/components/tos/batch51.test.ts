/**
 * Batch 51: the pricing section is removed from the one-page brief.
 * The user said dropping pricing makes the brief look much better; the
 * brief now carries only what the facility gets, the results statement,
 * and the start CTA. Pricing stays in the full proposal untouched.
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
const block = page.slice(page.indexOf('const COMPACT_CSS'), page.indexOf('Registers the public proposal routes'));

// The pricing section and its styles are gone from the brief.
check('no Pricing heading in brief', !block.includes('<h2>Pricing</h2>'));
check('no pricing table in brief', !block.includes('class="ctbl"') && !block.includes('NGN 0'));
check('no seat-cost line in brief', !block.includes("A seat is one student's place"));
check('no plan-coverage line in brief', !block.includes('cplan'));
check('table CSS removed from compact styles', !block.includes('.ctbl') && !block.includes('.cplan'));

// The brief keeps its two content sections and the CTA.
check('what-you-get section kept', block.includes('What Tutorial OS gives your facility'));
check('results big statement kept', block.includes('.cbig') && block.includes('becomes the story parents tell one another.'));
check('CTA kept with the free-start line', block.includes('Ready to see it live?') && block.includes('No card, no payment, setup in minutes.'));

// The full proposal still carries all pricing detail untouched.
check('full proposal keeps pricing heading', page.includes('<h2>Pricing and getting started</h2>'));
check('full proposal keeps NGN 0 / 1,000 / 2,500', page.includes('NGN 0') && page.includes('NGN 1,000') && page.includes('NGN 2,500'));
check('full proposal keeps covers cards and paybox', page.includes('class="covers"') && page.includes('How facilities pay for the platform itself'));

// One-page mechanics unchanged.
check('one-page fit math kept', block.includes('canvas.width * pageH / canvas.height'));
check('file still named -1page', block.includes('-1page.pdf'));
check('console button untouched', read('src/components/tos/TosProposals.tsx').includes('&short=1&pdf=1'));

if (failures.length) { console.error(`batch51: ${failures.length} failed`); process.exit(1); }
console.log('batch51 ok');
