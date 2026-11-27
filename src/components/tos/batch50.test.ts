/**
 * Batch 50: the one-page brief reads like a flyer, not a blog post.
 * The user said the batch-49 brief still looked stuffy/bloggy when printed.
 * The results section becomes ONE big statement plus a single short line,
 * the pricing line and CTA shrink to one clean sentence each, section
 * padding and gaps grow so the page breathes. Facts stay; the prose goes.
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

// The bloggy paragraph is gone; a big statement plus one short line stands.
check('big-statement style exists', block.includes('.cbig'));
check('big statement is the 300+/A1-B3 line', block.includes('A student who scores 300 and above in JAMB, or brings home A1 to B3 across nine subjects, becomes the story parents tell one another.'));
check('results section is one short supporting line', block.includes('Daily CBT practice and the leaderboard keep students competing even when a tutor is away, mock exams surface gaps long before the real day, and the AI study coach fills the rest'));
check('old results paragraph gone', !block.includes('When a tutor is away, the CBT engine keeps every class practising'));

// Pricing and CTA each carry one clean line.
check('pricing line removed from the brief (batch 51)', !block.includes("A seat is one student's place on the platform"));
check('pricing line drops the no-card clause', !block.includes('no card to begin'));
check('CTA keeps the ready line', block.includes('Ready to see it live?'));
check('CTA keeps access-code step', block.includes('check your email for the access code and login details'));
check('CTA dropped the brand-the-facility clause', !block.includes('brand the facility,'));

// Breathing room: bigger section padding, gaps and headings.
check('section padding grew', block.includes('padding:22px 26px') && block.includes('.cs{margin-top:20px'));
check('section headings grew', block.includes('.cs h2{font-size:18px'));
check('CTA padding grew', block.includes('padding:22px 26px;color:#F8FAFC') || block.includes('border-radius:14px;padding:22px 26px;color:#F8FAFC'));

// Facts preserved from batch 49.
check('what-you-get section kept', block.includes('What Tutorial OS gives your facility'));
check('all 7 bullets kept', block.includes('Admissions and records:') && block.includes('<b>Fee management:</b>') && block.includes('Over 100,000 practice questions') && block.includes('<b>AI built in:</b>') && block.includes('Your brand everywhere:'));
check('Android/iPhone/web kept', block.includes('Works on Android, iPhone and the web'));
check('prices removed from the brief, kept in the full proposal (batch 51)', !block.includes('NGN 0') && !block.includes('NGN 1,000') && !block.includes('NGN 2,500') && page.includes('NGN 1,000'));
check('no paybox or checklist cards still true', !block.includes('class="cpay"') && !block.includes('class="covers"'));

// One-page mechanics unchanged.
check('one-page fit math kept', block.includes('canvas.width * pageH / canvas.height'));
check('file still named -1page', block.includes('-1page.pdf'));
check('auto-download on pdf=1 kept', block.includes("get('pdf') === '1'"));
check('full proposal builder untouched', page.includes('export function buildProposalPage(displayName: string, origin: string, slug: string): string'));
check('console button untouched', read('src/components/tos/TosProposals.tsx').includes('&short=1&pdf=1'));

if (failures.length) { console.error(`batch50: ${failures.length} failed`); process.exit(1); }
console.log('batch50 ok');
